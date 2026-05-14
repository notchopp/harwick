import { createOpenAI } from "@ai-sdk/openai";
import { buildHarwickToolCatalogPrompt } from "@realty-ops/integrations";
import {
  HarwickAiRuntimeInputSchema,
  HarwickAiTurnSchema,
  type HarwickAiRuntimeInput,
  type HarwickAiTurn,
} from "@realty-ops/core";
import { generateObject } from "ai";
import type { HarwickAiRuntimeClient } from "@realty-ops/integrations";

/**
 * ai-sdk-based Harwick lead-conversation runtime. Drop-in replacement for
 * createOpenAIHarwickAiRuntime — same HarwickAiRuntimeClient interface, same
 * HarwickAiTurn output, but uses ai-sdk's `generateObject` with a zod schema
 * so the structured-output guarantee replaces the fragile JSON-parser path.
 *
 * Two structural wins over the legacy runtime:
 *   - No parseHarwickAiTurn fallback safety nets — generateObject either
 *     returns a HarwickAiTurn that satisfies the schema or throws.
 *   - Provider-agnostic — swap to anthropic / xai / etc by changing the
 *     `model` argument; no need to rewrite the request/response handling.
 *
 * Today this is wired behind HARWICK_LEAD_RUNTIME=ai-sdk so we can flip
 * call sites one at a time. Legacy path stays default until full rollout.
 */
export type AiSdkHarwickRuntimeOptions = {
  apiKey: string;
  model: string;
};

export function createAiSdkHarwickAiRuntime(options: AiSdkHarwickRuntimeOptions): HarwickAiRuntimeClient {
  const openai = createOpenAI({ apiKey: options.apiKey });

  return {
    async runTurn(input: HarwickAiRuntimeInput): Promise<HarwickAiTurn> {
      const parsed = HarwickAiRuntimeInputSchema.parse(input);

      const systemPrompt = buildLeadTurnSystemPrompt(parsed);
      const userPrompt = JSON.stringify(parsed);

      const result = await generateObject({
        model: openai(options.model),
        schema: HarwickAiTurnSchema,
        system: systemPrompt,
        prompt: userPrompt,
      });

      return result.object;
    },
  };
}

function buildLeadTurnSystemPrompt(input: HarwickAiRuntimeInput): string {
  const blocks: string[] = [
    "You are Harwick AI, the always-on front desk and qualification runtime for a real estate workspace.",
    "AI-NATIVE OPERATING PRINCIPLE: You own the loop. Read the lead document and policy narrative below, then decide which tools to call and what to write back to the document.",
    "",
    "AGENTIC LOOP: You can chain multiple tool calls across iterations.",
    "  - Set endTurn=false when you need a tool's result before deciding the next step.",
    "  - Set endTurn=true when this turn is complete and you are not waiting on any tool result.",
    "",
    "TOOL CATALOG:",
    buildHarwickToolCatalogPrompt(),
  ];

  if (input.policyNarrative !== null && input.policyNarrative !== undefined) {
    blocks.push(
      "",
      "POLICY NARRATIVE (the broker's automation preferences — self-gate against this):",
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
      "OPERATOR MODE: This is an internal Harwick request from a teammate, not a lead. Skip the off-topic gate. Answer the operator directly.",
      `Operator: ${input.operatorContext.operatorName}. Request mode: ${input.operatorContext.requestMode}. Scope: ${input.operatorContext.requestScope}.`,
      "INFO-DUMP IS BANNED. Synthesize, don't transcribe lists.",
      "Use dispatch_subagent for any 'show me / find me' request rather than paraphrasing the workspace context.",
      ...((input.operatorContext.recentLeads ?? []).length > 0
        ? ["Recent leads:", ...(input.operatorContext.recentLeads ?? []).map((line) => `  - ${line}`)]
        : []),
      ...((input.operatorContext.routing ?? []).length > 0
        ? ["Routing desk:", ...(input.operatorContext.routing ?? []).map((line) => `  - ${line}`)]
        : []),
      ...((input.operatorContext.team ?? []).length > 0
        ? ["Team context:", ...(input.operatorContext.team ?? []).map((line) => `  - ${line}`)]
        : []),
    );
  }

  blocks.push(
    "",
    "TURN RULES",
    "  - Off-topic messages: intent='spam_or_unsafe', nextAction='do_not_reply', toolCalls=[], reply='Not related to real estate', safetyFlags=['low_confidence'], confidence between 0.0 and 0.2.",
    "  - For real-estate inquiries: classify intent, decide nextAction, set safety flags, and emit any tool calls needed to act.",
    "  - Use ONLY supplied context. Never invent price, availability, financing certainty, contract certainty.",
    "  - reply: 1-800 chars. Public comments must be short and public-safe.",
    "  - missingFields: only fields you genuinely need but don't have. Empty if you have enough.",
    "  - documentUpdate: 1-3 sentences appended to the lead document. Empty if nothing meaningful changed.",
    "  - selfGateAutoExecute: true unless the policy narrative requires approval for this action/tool/safety-flag combination.",
    "  - statePatch: capture qualification deltas (intent strength, lead type, timeline, budget, area, etc.). Use null for unknown — don't echo empty strings.",
    "  - toolCalls: { tool, reason, requiresApproval, payload }. Never flatten payload fields up to the tool-call root.",
  );

  return blocks.join("\n");
}
