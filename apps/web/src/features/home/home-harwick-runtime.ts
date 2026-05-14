import {
  HarwickAiRuntimeInputSchema,
  HarwickAssistantResponseSchema,
  generatePolicyNarrative,
  type HarwickAiAutomationPolicy,
  type HarwickAiToolCall,
  type HarwickAssistantMention,
  type HarwickAssistantResponse,
} from "@realty-ops/core";
import {
  runHarwickAiAgenticLoop,
  type AgenticLoopOutcome,
  type HarwickAiRuntimeClient,
  type HarwickAiToolExecutionResult,
  type HarwickAiToolHandlers,
} from "@realty-ops/integrations";
import { loadAiConversationHistory } from "../lead-intake/harwick-ai-conversation-history";
import { buildTrajectorySummary, retrievePositiveExamples, retrieveWorkspaceMemory } from "../harwick-runtime/harwick-runtime-context";
import { createSupabaseAgentTrajectoryStore, type AgentTrajectoryStore } from "../../lib/supabase/agent-trajectory-store";
import { createSupabaseConversationMessageRepository, type ConversationMessageRepository } from "../../lib/supabase/conversation-messages";
import { createSupabaseHarwickAiAutomationPolicyRepository, type HarwickAiAutomationPolicyRepository } from "../../lib/supabase/harwick-ai-turns";
import { createSupabaseLeadDocumentRepository, type LeadDocumentRepository } from "../../lib/supabase/lead-document";
import { createSupabaseHarwickLoopApprovalRepository } from "../../lib/supabase/harwick-work-items";
import type { LeadRow } from "../../lib/supabase/leads";
import type { RealtyOpsSupabaseClient } from "../../lib/supabase/server-client";
import { createSupabaseWorkspacePolicyNarrativeRepository, type WorkspacePolicyNarrativeRepository } from "../../lib/supabase/workspace-policy-narrative";
import { createSupabaseWorkspaceMemoryRepository, type WorkspaceMemoryRepository } from "../../lib/supabase/workspace-memory";

type HomeHarwickRuntimeParams = {
  workspaceId: string;
  workspaceName: string;
  operatorName: string;
  message: string;
  mentions: HarwickAssistantMention[];
  activeLeadId: string | null;
  threadId: string | null;
  recentLeadSummaries: string[];
  routingSummaries: string[];
  teamSummaries: string[];
};

type HomeHarwickRuntimeDependencies = {
  supabase: RealtyOpsSupabaseClient;
  runtime: HarwickAiRuntimeClient;
  policyRepository: HarwickAiAutomationPolicyRepository;
  policyNarrativeRepository: WorkspacePolicyNarrativeRepository;
  conversationRepository: ConversationMessageRepository;
  leadDocumentRepository: LeadDocumentRepository;
  workspaceMemoryRepository: WorkspaceMemoryRepository;
  trajectoryStore: AgentTrajectoryStore;
  enqueueSubagentTask: ReturnType<typeof createSupabaseHarwickLoopApprovalRepository>["enqueueLoopSubagentTask"];
  now?: () => Date;
};

function uniqueToolCalls(toolCalls: HarwickAiToolCall[]): HarwickAiToolCall[] {
  const seen = new Set<string>();
  const deduped: HarwickAiToolCall[] = [];
  for (const toolCall of toolCalls) {
    const key = JSON.stringify(toolCall);
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(toolCall);
    }
  }
  return deduped;
}

function readPayloadString(toolCall: HarwickAiToolCall, key: string): string | null {
  const value = toolCall.payload[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readSubagentType(toolCall: HarwickAiToolCall): "research" | "writer" | "calendar" | "routing" {
  const value = readPayloadString(toolCall, "subagentType") ?? readPayloadString(toolCall, "type");
  if (value === "writer" || value === "calendar" || value === "routing") return value;
  return "research";
}

function readPriority(toolCall: HarwickAiToolCall): "low" | "normal" | "high" | "urgent" {
  const value = readPayloadString(toolCall, "priority");
  return value === "low" || value === "high" || value === "urgent" ? value : "normal";
}

function chooseLeadId(params: {
  activeLeadId: string | null;
  mentions: HarwickAssistantMention[];
}): string | null {
  if (params.activeLeadId !== null) {
    return params.activeLeadId;
  }
  return params.mentions.find((mention) => mention.type === "lead")?.id ?? null;
}

function formatBudget(lead: LeadRow): string | null {
  if (lead.budget_min === null && lead.budget_max === null) return null;
  if (lead.budget_min !== null && lead.budget_max !== null) return `$${lead.budget_min.toLocaleString()}-$${lead.budget_max.toLocaleString()}`;
  return `$${(lead.budget_min ?? lead.budget_max ?? 0).toLocaleString()}`;
}

function buildLeadSummary(lead: LeadRow): string {
  return [
    lead.full_name ?? lead.instagram_username ?? `Lead ${lead.id.slice(0, 8)}`,
    `${lead.status} ${lead.lead_type}`,
    lead.target_area,
    formatBudget(lead),
    lead.timeline,
    `score ${lead.score}`,
  ]
    .filter((part): part is string => part !== null && part.trim().length > 0)
    .join(" • ");
}

async function loadLeadRow(params: {
  supabase: RealtyOpsSupabaseClient;
  workspaceId: string;
  leadId: string | null;
}): Promise<LeadRow | null> {
  if (params.leadId === null) {
    return null;
  }

  const { data, error } = await params.supabase
    .from("leads")
    .select("*")
    .eq("workspace_id", params.workspaceId)
    .eq("id", params.leadId)
    .maybeSingle<LeadRow>();

  if (error !== null) {
    throw error;
  }

  return data ?? null;
}

async function resolvePolicyNarrative(params: {
  workspaceId: string;
  automationPolicy: HarwickAiAutomationPolicy;
  repository: WorkspacePolicyNarrativeRepository;
}): Promise<string | null> {
  const policyNarrative = await params.repository.read(params.workspaceId);
  if (policyNarrative !== null) {
    return policyNarrative;
  }

  const generated = generatePolicyNarrative(params.automationPolicy);
  try {
    await params.repository.write({
      workspaceId: params.workspaceId,
      body: generated.body,
      source: "generated",
    });
  } catch (error) {
    console.warn("[home-harwick-runtime] could not persist generated policy narrative:", error);
  }
  return generated.body;
}

function createHomeToolHandlers(params: {
  workspaceId: string;
  leadId: string | null;
  trajectoryId: string;
  enqueueSubagentTask: HomeHarwickRuntimeDependencies["enqueueSubagentTask"];
  now: () => Date;
}): HarwickAiToolHandlers {
  return {
    dispatch_subagent: async (toolCall) => {
      const subagentType = readSubagentType(toolCall);
      const title = readPayloadString(toolCall, "title") ?? `${subagentType} subagent task`;
      const instructions = readPayloadString(toolCall, "instructions") ?? toolCall.reason;
      const { taskId } = await params.enqueueSubagentTask({
        workspaceId: params.workspaceId,
        leadId: params.leadId,
        trajectoryId: params.trajectoryId,
        stepId: null,
        subagentType,
        priority: readPriority(toolCall),
        title,
        instructions,
        payload: {
          source: "home_harwick_runtime",
          reason: toolCall.reason,
          payload: toolCall.payload,
        },
        nowIso: params.now().toISOString(),
      });

      return {
        queued: true,
        taskId,
        subagentType,
        title,
      };
    },
  };
}

async function persistTrajectorySteps(params: {
  workspaceId: string;
  leadId: string | null;
  trajectoryId: string;
  outcome: AgenticLoopOutcome;
  trajectoryStore: AgentTrajectoryStore;
}): Promise<void> {
  for (const step of params.outcome.steps) {
    await params.trajectoryStore.appendStep({
      trajectoryId: params.trajectoryId,
      workspaceId: params.workspaceId,
      leadId: params.leadId,
      iteration: step.iteration,
      inputSnapshot: {
        inboundText: step.turn.reply,
      },
      turnOutput: step.turn,
      toolExecutions: step.results,
      selfGateAutoExecute: step.turn.selfGateAutoExecute,
      selfGateReason: step.turn.selfGateReason,
      deterministicGateAutoExecute: step.automation.canAutoExecute,
      gatesAgreed: step.turn.selfGateAutoExecute === step.automation.canAutoExecute,
      exitReason: step.iteration === params.outcome.steps.length ? params.outcome.exitReason : null,
      harwickAiTurnId: null,
    });
  }
}

function collectToolCalls(outcome: AgenticLoopOutcome): HarwickAiToolCall[] {
  return uniqueToolCalls(outcome.steps.flatMap((step) => step.turn.toolCalls)).slice(0, 8);
}

function buildReasoningSteps(params: {
  scopeLabel: string;
  results: HarwickAiToolExecutionResult[];
}): HarwickAssistantResponse["reasoningSteps"] {
  const steps: HarwickAssistantResponse["reasoningSteps"] = [{
    label: "Scoped request",
    detail: `Ran the shared Harwick runtime against ${params.scopeLabel.toLowerCase()} context.`,
  }];

  for (const result of params.results) {
    if (result.status === "executed") {
      steps.push({
        label: "Ran tool",
        detail: `${result.tool} executed to move the request forward.`,
      });
    } else if (result.status === "queued_for_approval") {
      steps.push({
        label: "Queued review",
        detail: `${result.tool} still needs operator approval before execution.`,
      });
    }
  }

  return steps.slice(0, 5);
}

function summarizeQueuedWorkspaceApproval(results: HarwickAiToolExecutionResult[]): string | null {
  const queued = results.filter((result) => result.status === "queued_for_approval");
  if (queued.length === 0) {
    return null;
  }

  const routeCount = queued.filter((result) => result.tool === "route_lead").length;
  if (routeCount > 0) {
    return routeCount === 1
      ? "Queued the proposed routing change for review. Check the route card before anything is reassigned."
      : `Queued ${routeCount} proposed routing changes for review. Check the route cards before anything is reassigned.`;
  }

  return queued.length === 1
    ? `Queued ${queued[0]?.tool.replace(/_/g, " ")} for review before Harwick continues.`
    : `Queued ${queued.length} approval items for review before Harwick continues.`;
}

function mapOutcomeToAssistantResponse(params: {
  workspaceName: string;
  lead: LeadRow | null;
  outcome: AgenticLoopOutcome;
}): HarwickAssistantResponse {
  const scope = params.lead?.full_name?.trim().length
    ? params.lead.full_name
    : params.lead?.instagram_username?.trim().length
      ? params.lead.instagram_username
      : params.lead === null
        ? "Workspace"
        : `Lead ${params.lead.id.slice(0, 8)}`;

  const results = params.outcome.steps.flatMap((step) => step.results);
  const queuedWorkspaceAnswer = params.lead === null
    ? summarizeQueuedWorkspaceApproval(results)
    : null;

  return HarwickAssistantResponseSchema.parse({
    answer: queuedWorkspaceAnswer ?? params.outcome.finalTurn.reply,
    followUpQuestion: null,
    reasoningSteps: buildReasoningSteps({
      scopeLabel: params.lead === null ? params.workspaceName : scope,
      results,
    }),
    scope,
    toolCalls: collectToolCalls(params.outcome),
  });
}

export function createHomeHarwickRuntimeService(
  deps: HomeHarwickRuntimeDependencies,
) {
  return {
    async run(params: HomeHarwickRuntimeParams): Promise<HarwickAssistantResponse> {
      const now = deps.now ?? (() => new Date());
      const selectedLeadId = chooseLeadId({
        activeLeadId: params.activeLeadId,
        mentions: params.mentions,
      });
      const lead = await loadLeadRow({
        supabase: deps.supabase,
        workspaceId: params.workspaceId,
        leadId: selectedLeadId,
      });
      const resolvedLeadId = lead?.id ?? null;

      const [automationPolicy, conversationHistory, leadDocument, threadHistory] = await Promise.all([
        deps.policyRepository.resolveEffectivePolicy({
          workspaceId: params.workspaceId,
          memberId: null,
          leadId: resolvedLeadId,
        }),
        resolvedLeadId === null
          ? Promise.resolve([])
          : loadAiConversationHistory({
              leadId: resolvedLeadId,
              repository: deps.conversationRepository,
            }),
        resolvedLeadId === null
          ? Promise.resolve(null)
          : deps.leadDocumentRepository.read({
              workspaceId: params.workspaceId,
              leadId: resolvedLeadId,
            }),
        // Workspace-command threads: pull prior turns from this rail thread so
        // "route those to me" and yesterday-references resolve.
        params.threadId === null || resolvedLeadId !== null
          ? Promise.resolve([])
          : deps.trajectoryStore.loadThreadHistory({
              workspaceId: params.workspaceId,
              threadId: params.threadId,
              limit: 6,
            }),
      ]);

      const [policyNarrative, workspaceMemory, retrievedExamples] = await Promise.all([
        resolvePolicyNarrative({
          workspaceId: params.workspaceId,
          automationPolicy,
          repository: deps.policyNarrativeRepository,
        }),
        retrieveWorkspaceMemory({
          repository: deps.workspaceMemoryRepository,
          workspaceId: params.workspaceId,
          inboundText: params.message,
          leadDocument,
        }),
        resolvedLeadId === null
          ? Promise.resolve(null)
          : retrievePositiveExamples({
              supabase: deps.supabase,
              workspaceId: params.workspaceId,
              inboundText: params.message,
              leadDocument,
            }),
      ]);

      const threadConversation = threadHistory.flatMap((turn, index) => {
        const messages: Array<{ id: string; actor: "human" | "harwick_ai"; body: string; occurredAt: string | null }> = [];
        if (turn.inboundText !== null) {
          messages.push({
            id: `thread-${turn.trajectoryId}-${index}-in`,
            actor: "human",
            body: turn.inboundText,
            occurredAt: turn.startedAt,
          });
        }
        if (turn.reply !== null) {
          messages.push({
            id: `thread-${turn.trajectoryId}-${index}-out`,
            actor: "harwick_ai",
            body: turn.reply,
            occurredAt: turn.startedAt,
          });
        }
        return messages;
      });

      const initialInput = HarwickAiRuntimeInputSchema.parse({
        workspaceName: params.workspaceName,
        channel: lead?.source_channel ?? "instagram_dm",
        inboundText: params.message,
        conversation: threadConversation.length > 0 ? threadConversation : conversationHistory,
        state: null,
        toneProfile: {},
        postContext: null,
        listingContext: null,
        calendarContext: [],
        buyerBlueprintUrl: null,
        policyNarrative,
        leadDocument,
        workspaceMemory,
        retrievedExamples,
        operatorContext: {
          operatorName: params.operatorName,
          requestMode: resolvedLeadId === null ? "workspace_command" : "lead_review",
          requestScope: resolvedLeadId === null ? "workspace" : "lead",
          recentLeads: params.recentLeadSummaries,
          routing: params.routingSummaries,
          team: params.teamSummaries,
          activeLeadSummary: lead === null ? null : buildLeadSummary(lead),
        },
      });

      const { trajectoryId } = await deps.trajectoryStore.startTrajectory({
        workspaceId: params.workspaceId,
        leadId: resolvedLeadId,
        channel: lead?.source_channel ?? null,
        threadId: params.threadId,
      });

      const outcome = await runHarwickAiAgenticLoop({
        initialInput,
        runtime: deps.runtime,
        policy: automationPolicy,
        handlers: createHomeToolHandlers({
          workspaceId: params.workspaceId,
          leadId: resolvedLeadId,
          trajectoryId,
          enqueueSubagentTask: deps.enqueueSubagentTask,
          now,
        }),
      });

      await persistTrajectorySteps({
        workspaceId: params.workspaceId,
        leadId: resolvedLeadId,
        trajectoryId,
        outcome,
        trajectoryStore: deps.trajectoryStore,
      });

      await deps.trajectoryStore.completeTrajectory({
        trajectoryId,
        completedAt: now().toISOString(),
        completionReason: outcome.exitReason,
        stepCount: outcome.steps.length,
        summaryText: buildTrajectorySummary(outcome),
        outcomeLabel: "neutral",
      });

      return mapOutcomeToAssistantResponse({
        workspaceName: params.workspaceName,
        lead,
        outcome,
      });
    },
  };
}

export function createDefaultHomeHarwickRuntimeService(params: {
  supabase: RealtyOpsSupabaseClient;
  runtime: HarwickAiRuntimeClient;
  now?: () => Date;
}) {
  const loopApprovalRepository = createSupabaseHarwickLoopApprovalRepository(params.supabase);
  return createHomeHarwickRuntimeService({
    supabase: params.supabase,
    runtime: params.runtime,
    policyRepository: createSupabaseHarwickAiAutomationPolicyRepository(params.supabase),
    policyNarrativeRepository: createSupabaseWorkspacePolicyNarrativeRepository(params.supabase),
    conversationRepository: createSupabaseConversationMessageRepository(params.supabase),
    leadDocumentRepository: createSupabaseLeadDocumentRepository(params.supabase),
    workspaceMemoryRepository: createSupabaseWorkspaceMemoryRepository(params.supabase),
    trajectoryStore: createSupabaseAgentTrajectoryStore(params.supabase),
    enqueueSubagentTask: (taskParams) => loopApprovalRepository.enqueueLoopSubagentTask(taskParams),
    ...(params.now === undefined ? {} : { now: params.now }),
  });
}
