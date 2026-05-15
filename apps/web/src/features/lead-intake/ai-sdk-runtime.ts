import { createOpenAI } from "@ai-sdk/openai";
import { buildHarwickToolCatalogPrompt } from "@realty-ops/integrations";
import {
  HarwickAiRuntimeInputSchema,
  HarwickAiTurnSchema,
  type HarwickAiRuntimeInput,
  type HarwickAiToolCall,
  type HarwickAiTurn,
} from "@realty-ops/core";
import { Output, generateText, stepCountIs } from "ai";
import { z } from "zod";
import type { HarwickAiRuntimeClient } from "@realty-ops/integrations";

import { LEAD_CONVERSATION_REGISTRY } from "../harwick-tools/lead-conversation";
import { OPERATOR_CHAT_REGISTRY } from "../harwick-tools/operator-chat";
import { buildHarwickToolsForScope } from "../harwick-tools/registry";
import { createServerSupabaseClient } from "../../lib/supabase/server-client";

/**
 * The Harwick lead-conversation runtime, now on native ai-sdk multi-step.
 *
 * Backed by generateText with tools + stopWhen: stepCountIs(6) — the hand-rolled
 * runHarwickAiAgenticLoop is no longer in this code path. The model calls
 * tools, sees results, chains until done. Structured turn metadata (intent,
 * statePatch, safetyFlags, etc.) flows through experimental_output so the
 * existing persistence + automation-decision pipeline keeps working unchanged.
 *
 * Tool wiring:
 *   - Action tools (send_meta_message, route_lead, request_showing_approval,
 *     pause_automation, dispatch_subagent, ...) come from the lead-conversation
 *     registry and PROPOSE actions; the existing executor pipeline runs them
 *     through approval gating.
 *   - Read tools (recall_fact, find_similar_leads, search_listings, find_comps,
 *     check_availability, summarize_call_recording, query_workspace, ...) come
 *     from the operator-chat registry tagged with lead_conversation scope and
 *     perform real reads in-loop.
 *
 * Provider swap stays a one-line change: openai("gpt-4o") → anthropic(...)
 * etc. — nothing else needs to know.
 */
export type HarwickAiRuntimeOptions = {
  apiKey: string;
  model: string;
};

// Structured metadata the model emits alongside its tool calls + reply.
// Mirrors the non-toolCalls fields of HarwickAiTurnSchema so we can stitch
// the full HarwickAiTurn back together for the persistence layer.
const HarwickTurnMetadataSchema = z.object({
  intent: HarwickAiTurnSchema.shape.intent,
  nextAction: HarwickAiTurnSchema.shape.nextAction,
  missingFields: HarwickAiTurnSchema.shape.missingFields,
  confidence: HarwickAiTurnSchema.shape.confidence,
  safetyFlags: HarwickAiTurnSchema.shape.safetyFlags,
  reply: HarwickAiTurnSchema.shape.reply,
  statePatch: HarwickAiTurnSchema.shape.statePatch,
  handoffBrief: HarwickAiTurnSchema.shape.handoffBrief,
  selfGateAutoExecute: HarwickAiTurnSchema.shape.selfGateAutoExecute,
  selfGateReason: HarwickAiTurnSchema.shape.selfGateReason,
  documentUpdate: HarwickAiTurnSchema.shape.documentUpdate,
  endTurn: HarwickAiTurnSchema.shape.endTurn,
});

type ProposedActionShape = {
  kind: "proposed_action";
  tool: string;
  payload: Record<string, unknown>;
  reason: string;
  requiresApproval: boolean;
};

function isProposedAction(value: unknown): value is ProposedActionShape {
  return value !== null
    && typeof value === "object"
    && (value as { kind?: unknown }).kind === "proposed_action"
    && typeof (value as { tool?: unknown }).tool === "string";
}

function buildLeadTurnSystemPrompt(input: HarwickAiRuntimeInput): string {
  const blocks: string[] = [
    "You are Harwick AI, the always-on front desk and qualification runtime for a real estate workspace.",
    "AI-NATIVE: you own the loop. Read the lead document and policy narrative, then call the tools you need, chaining as the conversation unfolds. The runtime will hand you tool results in-line so you can keep going.",
    "",
    "AGENTIC LOOP:",
    "  - Up to 6 steps per turn. The runtime stops you when you stop calling tools or you set endTurn=true in the structured output.",
    "  - Read tools (recall_fact, find_similar_leads, search_listings, check_availability, summarize_call_recording, query_workspace) DO the read and hand you results.",
    "  - Action tools (send_meta_message, route_lead, request_showing_approval, dispatch_subagent, pause_automation, ...) emit a proposed action that the operator's approval policy gates. Their result echoes the proposal so you can chain.",
    "",
    "TOOL CATALOG:",
    buildHarwickToolCatalogPrompt(),
  ];

  if (input.policyNarrative !== null && input.policyNarrative !== undefined) {
    blocks.push(
      "",
      "POLICY NARRATIVE (broker's automation preferences — self-gate against this):",
      input.policyNarrative,
    );
  }

  if (input.leadDocument !== null && input.leadDocument !== undefined) {
    blocks.push("", "LEAD DOCUMENT (running briefing on this lead):", input.leadDocument);
  }

  if (input.workspaceMemory !== null && input.workspaceMemory !== undefined) {
    blocks.push("", "WORKSPACE MEMORY (soft brokerage-wide context):", input.workspaceMemory);
  }

  if (input.operatorContext !== null && input.operatorContext !== undefined) {
    blocks.push(
      "",
      "OPERATOR MODE: This is an internal Harwick request from a teammate. Skip the off-topic gate.",
      `Operator: ${input.operatorContext.operatorName}. Request: ${input.operatorContext.requestMode} / ${input.operatorContext.requestScope}.`,
      "INFO-DUMP IS BANNED. Synthesize, don't transcribe.",
    );
  }

  blocks.push(
    "",
    "TURN RULES",
    "  - Off-topic messages: intent='spam_or_unsafe', nextAction='do_not_reply', reply='Not related to real estate', safetyFlags=['low_confidence'], confidence 0.0-0.2, NO action tools.",
    "  - Real-estate inquiries: classify intent, decide nextAction, set safety flags, emit any action tools needed.",
    "  - Use ONLY supplied context. Never invent price, availability, financing certainty, contract certainty.",
    "  - reply: 1-800 chars. Comments must be short and public-safe.",
    "  - statePatch: capture qualification deltas (intent strength, lead type, timeline, budget, area). Use null for unknown — don't echo empty strings.",
    "  - documentUpdate: 1-3 sentences appended to the lead document. Empty if nothing meaningful changed.",
    "  - selfGateAutoExecute: true unless the policy narrative requires approval for this action/tool/safety-flag combination.",
    "  - endTurn: true unless you're explicitly waiting on a tool result before you can finalize.",
  );

  return blocks.join("\n");
}

export function createHarwickAiRuntime(options: HarwickAiRuntimeOptions): HarwickAiRuntimeClient {
  const openai = createOpenAI({ apiKey: options.apiKey });

  return {
    async runTurn(input: HarwickAiRuntimeInput): Promise<HarwickAiTurn> {
      const parsed = HarwickAiRuntimeInputSchema.parse(input);
      const supabase = createServerSupabaseClient();

      // workspaceId / operator info may not be in the runtime input (legacy
      // pipelines didn't carry them). Use safe placeholders so the read tools
      // that need them gracefully no-op rather than throwing.
      const toolDeps = {
        supabase,
        workspaceId: parsed.state?.workspaceId ?? "00000000-0000-0000-0000-000000000000",
        workspaceName: parsed.workspaceName,
        operatorMemberId: "00000000-0000-0000-0000-000000000000",
        operatorName: parsed.operatorContext?.operatorName ?? parsed.workspaceName,
        operatorRole: "agent" as const,
        leadId: parsed.state?.leadId ?? null,
        openai,
      };

      const leadActionTools = buildHarwickToolsForScope({
        registry: LEAD_CONVERSATION_REGISTRY,
        scope: "lead_conversation",
        deps: toolDeps,
      });
      const leadReadTools = buildHarwickToolsForScope({
        registry: OPERATOR_CHAT_REGISTRY,
        scope: "lead_conversation",
        deps: toolDeps,
      });
      const tools = { ...leadReadTools, ...leadActionTools };

      const result = await generateText({
        model: openai(options.model),
        system: buildLeadTurnSystemPrompt(parsed),
        prompt: JSON.stringify(parsed),
        tools,
        stopWhen: stepCountIs(6),
        experimental_output: Output.object({ schema: HarwickTurnMetadataSchema }),
      });

      const proposedToolCalls: HarwickAiToolCall[] = [];
      for (const step of result.steps) {
        for (const toolResult of step.toolResults) {
          if (!isProposedAction(toolResult.output)) continue;
          proposedToolCalls.push({
            tool: toolResult.output.tool as HarwickAiToolCall["tool"],
            reason: toolResult.output.reason,
            requiresApproval: toolResult.output.requiresApproval,
            payload: toolResult.output.payload,
          });
        }
      }

      const metadata = result.experimental_output;
      return HarwickAiTurnSchema.parse({
        ...metadata,
        toolCalls: proposedToolCalls,
      });
    },
  };
}
