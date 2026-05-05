import {
  type NormalizedLeadEvent,
  HarwickAiRuntimeInputSchema,
  HarwickAiAutomationDecisionSchema,
  buildPersistedHarwickAiToolCalls,
  deriveHarwickAiTurnPersistenceStatus,
  evaluateHarwickAiAutomation,
  generatePolicyNarrative,
  buildPolicyShadowComparison,
  type HarwickAiPersistedTurn,
} from "@realty-ops/core";
import {
  createOpenAIHarwickAiRuntime,
  runHarwickAiAgenticLoop,
  type HarwickAiToolHandlers,
} from "@realty-ops/integrations";
import type {
  HarwickAiTurnPersistenceRepository,
  HarwickAiAutomationPolicyRepository,
} from "../../lib/supabase/harwick-ai-turns";
import type { LeadEventPersistenceRepository } from "../../lib/supabase/lead-events";
import type { RealtyOpsSupabaseClient } from "../../lib/supabase/server-client";
import type { SocialReplyQueueRepository } from "../operator-queues/operator-queues";
import { createSupabaseConversationMessageRepository } from "../../lib/supabase/conversation-messages";
import { createSupabaseConversationAutomationRepository } from "../../lib/supabase/conversation-automation";
import { createSupabaseLeadDocumentRepository } from "../../lib/supabase/lead-document";
import { createSupabaseMemberRoutingProfileRepository } from "../../lib/supabase/member-routing-profiles";
import { createSupabaseWorkspacePolicyNarrativeRepository } from "../../lib/supabase/workspace-policy-narrative";
import { createSupabaseAgentTrajectoryStore } from "../../lib/supabase/agent-trajectory-store";
import { loadAiConversationHistory } from "./harwick-ai-conversation-history";
import { createHarwickAiToolHandlers, type HarwickAiToolContext } from "./harwick-ai-tool-handlers";

export type GenerateAndExecuteHarwickAiTurnParams = {
  workspaceId: string;
  leadId: string;
  leadEventId: string;
  event: NormalizedLeadEvent;
};

export type HarwickAiExecutorDependencies = {
  supabase: RealtyOpsSupabaseClient;
  turnRepository: HarwickAiTurnPersistenceRepository;
  policyRepository: HarwickAiAutomationPolicyRepository;
  leadEventRepository: LeadEventPersistenceRepository;
  queueRepository: SocialReplyQueueRepository;
  runtimeClient: ReturnType<typeof createOpenAIHarwickAiRuntime>;
  credentialSecret: string | undefined;
};

const VALID_CHANNELS = [
  "instagram_dm",
  "instagram_comment",
  "facebook_dm",
  "facebook_comment",
] as const;

type ValidChannel = typeof VALID_CHANNELS[number];

/**
 * AI-native runtime entry point. The model owns the loop:
 *  1. Hydrate context (conversation history, lead document, policy narrative).
 *  2. Run the agentic loop — model emits tool calls, runtime executes them
 *     against real handlers, results feed back into the next iteration.
 *  3. Persist every step into agent_trajectories / agent_steps for future
 *     RL, fine-tuning, and in-context retrieval.
 *  4. Append documentUpdate to the lead document so memory compounds.
 *  5. Shadow-compare deterministic gate vs model self-gate per step.
 */
export async function generateAndExecuteHarwickAiTurnSync(
  params: GenerateAndExecuteHarwickAiTurnParams,
  deps: HarwickAiExecutorDependencies,
): Promise<void> {
  if (!VALID_CHANNELS.includes(params.event.sourceChannel as ValidChannel)) {
    return;
  }

  const channel = params.event.sourceChannel as ValidChannel;
  if (!params.event.text || !params.event.providerAccountId || !params.event.providerUserId) {
    return;
  }
  if (!deps.credentialSecret) {
    console.warn("Skipping Harwick AI turn: CREDENTIAL_ENCRYPTION_KEY not set");
    return;
  }

  const trajectoryStore = createSupabaseAgentTrajectoryStore(deps.supabase);
  const conversationRepo = createSupabaseConversationMessageRepository(deps.supabase);
  const conversationAutomationRepo = createSupabaseConversationAutomationRepository(deps.supabase);
  const policyNarrativeRepo = createSupabaseWorkspacePolicyNarrativeRepository(deps.supabase);
  const leadDocumentRepo = createSupabaseLeadDocumentRepository(deps.supabase);
  const memberRoutingRepo = createSupabaseMemberRoutingProfileRepository(deps.supabase);

  let trajectoryId: string | null = null;
  let stepCount = 0;
  let exitReason: string = "unknown";

  try {
    const automationPolicy = await deps.policyRepository.resolveEffectivePolicy({
      workspaceId: params.workspaceId,
      memberId: null,
      leadId: params.leadId,
    });

    // Look up the lead row once — handlers reuse it for assignment, calendar
    // lookup, automation pause target, etc. A fresh read each step would be
    // overkill since the agentic loop completes in seconds.
    const { data: leadRow } = await deps.supabase
      .from("leads")
      .select("*")
      .eq("workspace_id", params.workspaceId)
      .eq("id", params.leadId)
      .maybeSingle();

    const conversationHistory = await loadAiConversationHistory({
      leadId: params.leadId,
      repository: conversationRepo,
    });

    let policyNarrative = await policyNarrativeRepo.read(params.workspaceId);
    if (policyNarrative === null) {
      const generated = generatePolicyNarrative(automationPolicy);
      try {
        await policyNarrativeRepo.write({
          workspaceId: params.workspaceId,
          body: generated.body,
          source: "generated",
        });
      } catch (writeError) {
        console.warn("Could not persist generated policy narrative:", writeError);
      }
      policyNarrative = generated.body;
    }

    const leadDocument = await leadDocumentRepo.read({
      workspaceId: params.workspaceId,
      leadId: params.leadId,
    });

    const initialInput = HarwickAiRuntimeInputSchema.parse({
      workspaceName: "Workspace",
      channel,
      inboundText: params.event.text,
      conversation: conversationHistory,
      state: null,
      toneProfile: {},
      postContext: null,
      listingContext: null,
      calendarContext: [],
      buyerBlueprintUrl: null,
      policyNarrative,
      leadDocument,
    });

    const toolContext: HarwickAiToolContext = {
      workspaceId: params.workspaceId,
      leadId: params.leadId,
      leadEventId: params.leadEventId,
      event: params.event,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lead: leadRow as any,
      channel,
      providerAccountId: params.event.providerAccountId,
      recipientUserId: params.event.providerUserId,
      sourcePostId: params.event.sourcePostId,
      sourceCommentId: params.event.sourceCommentId,
      automationMode: "ai_on",
    };

    const handlers: HarwickAiToolHandlers = createHarwickAiToolHandlers({
      supabase: deps.supabase,
      context: toolContext,
      conversationMessageRepository: conversationRepo,
      conversationAutomationRepository: conversationAutomationRepo,
      leadEventRepository: deps.leadEventRepository,
      memberRoutingRepository: memberRoutingRepo,
      credentialSecret: deps.credentialSecret,
    });

    // Open a trajectory for this episode. Every loop step is appended; on
    // completion we update outcome_label and step_count.
    const { trajectoryId: openedTrajectoryId } = await trajectoryStore.startTrajectory({
      workspaceId: params.workspaceId,
      leadId: params.leadId,
      channel,
    });
    trajectoryId = openedTrajectoryId;

    const loopOutcome = await runHarwickAiAgenticLoop({
      initialInput,
      runtime: deps.runtimeClient,
      policy: automationPolicy,
      handlers,
      maxIterations: 6,
    });

    exitReason = loopOutcome.exitReason;
    stepCount = loopOutcome.steps.length;

    // Persist every step into the trajectory + the harwick_ai_turns log.
    // Each iteration is a complete (state, action, tool_results) tuple
    // suitable for RL trajectories and supervised fine-tuning corpus.
    for (const step of loopOutcome.steps) {
      const turn = step.turn;
      const automationDecision = HarwickAiAutomationDecisionSchema.parse(step.automation);

      const persistedToolCalls = buildPersistedHarwickAiToolCalls({
        toolCalls: turn.toolCalls,
        approvedTools: automationDecision.approvedTools,
        blockedTools: automationDecision.blockedTools,
      });
      const persistenceStatus = deriveHarwickAiTurnPersistenceStatus({
        automationDecision,
        isExecuted: step.results.some((result) => result.status === "executed"),
        hasExecutionFailure: step.results.some((result) => result.status === "failed"),
      });

      const persistedTurn: HarwickAiPersistedTurn = {
        workspaceId: params.workspaceId,
        leadId: params.leadId,
        socialReplyReviewId: null,
        providerThreadId: params.event.providerUserId,
        channel,
        runtimeInput: step.iteration === 1 ? initialInput : initialInput,
        turn,
        automationPolicy,
        automationDecision,
        status: persistenceStatus,
        toolCalls: persistedToolCalls,
      };

      const { turnId } = await deps.turnRepository.insertTurn(persistedTurn);

      const shadowComparison = buildPolicyShadowComparison({
        workspaceId: params.workspaceId,
        turnId,
        deterministicAutoExecute: automationDecision.canAutoExecute,
        deterministicReason: automationDecision.reason,
        modelSelfGateAutoExecute: turn.selfGateAutoExecute,
        modelSelfGateReason: turn.selfGateReason,
      });
      if (!shadowComparison.agree) {
        console.warn("[harwick-ai policy shadow disagreement]", shadowComparison);
      }

      try {
        await trajectoryStore.appendStep({
          trajectoryId: openedTrajectoryId,
          workspaceId: params.workspaceId,
          leadId: params.leadId,
          iteration: step.iteration,
          inputSnapshot: step.iteration === 1 ? initialInput : { iteration: step.iteration, note: "see iteration 1 inputSnapshot for base context" },
          turnOutput: turn,
          toolExecutions: step.results,
          selfGateAutoExecute: turn.selfGateAutoExecute,
          selfGateReason: turn.selfGateReason,
          deterministicGateAutoExecute: automationDecision.canAutoExecute,
          gatesAgreed: shadowComparison.agree,
          exitReason: step.iteration === loopOutcome.steps.length ? loopOutcome.exitReason : null,
          harwickAiTurnId: turnId,
        });
      } catch (stepError) {
        console.warn("Could not persist agent step:", stepError);
      }

      // AI-native shift 4: append the model's prose update to the lead document.
      if (turn.documentUpdate.trim().length > 0) {
        try {
          await leadDocumentRepo.appendUpdate({
            workspaceId: params.workspaceId,
            leadId: params.leadId,
            update: turn.documentUpdate,
          });
        } catch (documentError) {
          console.warn("Could not append lead document update:", documentError);
        }
      }

      if (automationDecision.canAutoExecute && step.results.some((result) => result.status === "executed")) {
        await deps.turnRepository.updateTurnStatus(turnId, "auto_executed");
      }
    }

    await trajectoryStore.completeTrajectory({
      trajectoryId: openedTrajectoryId,
      completedAt: new Date().toISOString(),
      completionReason: loopOutcome.exitReason,
      stepCount,
      summaryText: buildTrajectorySummary(loopOutcome),
      // outcome_label stays "pending" until downstream operator/lead signals
      // close the loop via agent_outcomes.
      outcomeLabel: "pending",
    });
  } catch (error) {
    console.error("Harwick AI turn generation error:", error);
    if (trajectoryId !== null) {
      try {
        await trajectoryStore.completeTrajectory({
          trajectoryId,
          completedAt: new Date().toISOString(),
          completionReason: exitReason === "unknown" ? "tool_failed" : exitReason,
          stepCount,
          summaryText: `Trajectory aborted: ${error instanceof Error ? error.message : String(error)}`,
          outcomeLabel: "negative",
        });
      } catch (completionError) {
        console.warn("Could not record aborted trajectory:", completionError);
      }
    }
    // Don't rethrow — webhook delivery should still succeed.
  }
}

function buildTrajectorySummary(outcome: Awaited<ReturnType<typeof runHarwickAiAgenticLoop>>): string {
  const lines: string[] = [];
  for (const step of outcome.steps) {
    const tools = step.results
      .map((result) => `${result.tool}=${result.status}`)
      .join(", ");
    lines.push(`Step ${step.iteration}: ${step.turn.intent} → ${step.turn.nextAction} (${tools || "no tools"})`);
  }
  lines.push(`Exit: ${outcome.exitReason} after ${outcome.steps.length} step(s).`);
  return lines.join("\n");
}
