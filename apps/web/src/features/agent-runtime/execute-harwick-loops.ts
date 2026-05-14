import { HarwickWorkItemCreateSchema, type HarwickLoop, type HarwickWorkItemCreate, type WorkspaceRole } from "@realty-ops/core";
import type { SmallModelClient } from "@realty-ops/integrations";
import { z } from "zod";
import type {
  HarwickLoopClosedWonEvent,
  HarwickLoopEventSourceRepository,
  HarwickLoopRepository,
} from "../../lib/supabase/harwick-loops";
import type { HarwickWorkItemRepository } from "../../lib/supabase/harwick-work-items";
import {
  intelligizeHarwickWorkItem,
  type HarwickWorkItemIntelligenceClient,
} from "./harwick-work-item-intelligence";

const LoopWorkItemPlanSchema = z.object({
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(1000),
  recommendedAction: z.string().trim().min(1).max(160),
  reason: z.string().trim().min(1).max(1000),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  targetRole: z.enum(["owner", "admin", "team_lead", "lead_manager", "operator", "agent", "viewer"]),
  draftBody: z.string().trim().min(1).max(2000).nullable(),
  proposedToolCalls: z.array(z.object({
    tool: z.string().trim().min(1).max(80),
    reason: z.string().trim().min(1).max(240),
    requiresApproval: z.boolean(),
    payload: z.record(z.string(), z.unknown()),
  })).max(8),
  agentLoopBrief: z.string().trim().min(1).max(1000).nullable(),
});

export type HarwickLoopWorkItemPlan = z.infer<typeof LoopWorkItemPlanSchema>;

export type HarwickLoopPlannerContext = {
  triggerType: HarwickLoop["triggerType"];
  eventType: string | null;
  leadId: string | null;
  entityLabel: string | null;
  occurredAt: string | null;
  summary: string | null;
  payload: Record<string, unknown>;
};

export type HarwickLoopPlannerClient = {
  planWorkItem(loop: HarwickLoop, nowIso: string, context?: HarwickLoopPlannerContext): Promise<HarwickLoopWorkItemPlan>;
};

export type HarwickLoopExecutionDeps = {
  loopRepository: HarwickLoopRepository;
  workItemRepository: Pick<HarwickWorkItemRepository, "createWorkItem" | "findOpenInsightBySignalKey">;
  plannerClient?: HarwickLoopPlannerClient;
  intelligenceClient?: HarwickWorkItemIntelligenceClient;
  now?: () => Date;
  batchSize?: number;
};

export type HarwickLoopExecutionReport = {
  scanned: number;
  completed: number;
  surfaced: number;
  drafted: number;
  plannedAgentLoops: number;
  skippedExisting: number;
  failed: number;
};

export type HarwickEventLoopExecutionReport = {
  scannedLoops: number;
  scannedEvents: number;
  completed: number;
  surfaced: number;
  drafted: number;
  plannedAgentLoops: number;
  skippedExisting: number;
  failed: number;
};

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

export function createSmallModelHarwickLoopPlannerClient(
  client: SmallModelClient,
): HarwickLoopPlannerClient {
  return {
    async planWorkItem(loop, nowIso, context) {
      return client.classify({
        schema: LoopWorkItemPlanSchema,
        temperature: 0.2,
        maxTokens: 500,
        instructions: [
          "You are the lightweight planning layer for Harwick loops.",
          "A Harwick loop is a recurring autonomous instruction that wakes up the workspace chief of staff.",
          "Convert the loop into one concise, reviewable dashboard work item.",
          "If event context is present, incorporate it into the work item so Harwick reacts to the specific event rather than writing a generic reminder.",
          "Do not claim that external tools, sends, calendar writes, or CRM writes already happened.",
          "If outputMode is draft, include draftBody as the draft Harwick should review with the operator.",
          "If outputMode is agent_loop, include agentLoopBrief and proposedToolCalls. Proposed tool calls must require approval.",
          "Target team_lead for brokerage-level review unless the instruction is clearly operator-owned.",
        ].join("\n"),
        input: JSON.stringify({
          loopId: loop.id,
          name: loop.name,
          instruction: loop.instruction,
          scheduleSpec: loop.scheduleSpec,
          approvalMode: loop.approvalMode,
          outputMode: loop.outputMode,
          toolAllowlist: loop.toolAllowlist,
          nowIso,
          context,
        }),
      });
    },
  };
}

function parseTimeOfDay(spec: string): { hours: number; minutes: number } | null {
  const match = /\b(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(spec);
  if (match === null) return null;

  let hours = Number(match[1]);
  const minutes = match[2] === undefined ? 0 : Number(match[2]);
  const period = match[3]?.toLowerCase();
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
    return null;
  }
  if (hours < 1 || hours > 12) return null;

  if (period === "pm" && hours !== 12) hours += 12;
  if (period === "am" && hours === 12) hours = 0;
  return { hours, minutes };
}

function withTimeOfDay(base: Date, spec: string): Date {
  const time = parseTimeOfDay(spec);
  if (time === null) return base;
  const next = new Date(base);
  next.setUTCHours(time.hours, time.minutes, 0, 0);
  return next;
}

export function computeNextHarwickLoopRunAt(scheduleSpec: string, from: Date): string | null {
  const normalized = scheduleSpec.trim().toLowerCase();
  if (normalized.length === 0) return null;

  const interval = /^every\s+(\d+)\s+(minute|minutes|hour|hours|day|days|week|weeks)\b/.exec(normalized);
  if (interval !== null) {
    const amount = Number(interval[1]);
    const unit = interval[2];
    if (unit === undefined) return null;
    if (!Number.isInteger(amount) || amount < 1) return null;
    const multiplier = unit.startsWith("minute")
      ? MS_PER_MINUTE
      : unit.startsWith("hour")
        ? MS_PER_HOUR
        : unit.startsWith("day")
          ? MS_PER_DAY
          : 7 * MS_PER_DAY;
    return new Date(from.getTime() + amount * multiplier).toISOString();
  }

  const dayIndex = DAY_NAMES.findIndex((day) => normalized.includes(day));
  if (dayIndex >= 0) {
    const next = withTimeOfDay(new Date(from), normalized);
    const currentDay = next.getUTCDay();
    let daysAhead = (dayIndex - currentDay + 7) % 7;
    if (daysAhead === 0 && next.getTime() <= from.getTime()) {
      daysAhead = 7;
    }
    next.setUTCDate(next.getUTCDate() + daysAhead);
    return next.toISOString();
  }

  if (normalized.includes("weekly") || normalized.includes("every week")) {
    return new Date(from.getTime() + 7 * MS_PER_DAY).toISOString();
  }

  if (normalized.includes("monthly") || normalized.includes("every month")) {
    const next = new Date(from);
    next.setUTCMonth(next.getUTCMonth() + 1);
    return next.toISOString();
  }

  if (normalized.includes("daily") || normalized.includes("every day")) {
    const next = withTimeOfDay(new Date(from), normalized);
    if (next.getTime() <= from.getTime()) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next.toISOString();
  }

  return null;
}

function deterministicPlan(loop: HarwickLoop, context?: HarwickLoopPlannerContext): HarwickLoopWorkItemPlan {
  const targetRole: WorkspaceRole = loop.instruction.toLowerCase().includes("queue")
    || loop.instruction.toLowerCase().includes("follow-up")
    ? "operator"
    : "team_lead";
  const entityLabel = context?.entityLabel;
  const summaryPrefix = loop.triggerType === "event"
    ? entityLabel === null || entityLabel === undefined
      ? `Harwick event loop "${loop.name}" woke up for ${context?.eventType ?? "an event"}.`
      : `Harwick event loop "${loop.name}" woke up for ${entityLabel}.`
    : `Harwick loop "${loop.name}" is due.`;
  return LoopWorkItemPlanSchema.parse({
    title: loop.triggerType === "event" ? `Event loop ready: ${loop.name}` : `Loop due: ${loop.name}`,
    summary: `${summaryPrefix} Instruction: ${loop.instruction}`,
    recommendedAction: loop.outputMode === "draft"
      ? "Review draft"
      : loop.outputMode === "agent_loop"
        ? "Approve execution plan"
        : loop.approvalMode === "auto_execute"
          ? "Review autonomous loop output"
          : "Review and approve next step",
    reason: loop.triggerType === "event"
      ? "This surfaced from an event-triggered Harwick loop so recurring cognitive work can start as soon as the workspace event happens."
      : "This surfaced from a scheduled Harwick loop so recurring cognitive work appears in the workspace before any external action happens.",
    priority: "normal",
    targetRole,
    draftBody: loop.outputMode === "draft"
      ? loop.triggerType === "event" && entityLabel !== null && entityLabel !== undefined
        ? `Draft from "${loop.name}" for ${entityLabel}: ${loop.instruction}`
        : `Draft from "${loop.name}": ${loop.instruction}`
      : null,
    proposedToolCalls: loop.outputMode === "agent_loop"
      ? [{
          tool: "dispatch_subagent",
          reason: `run the ${loop.triggerType === "event" ? "event-driven" : "scheduled"} loop instruction through a specialist before any external action`,
          requiresApproval: true,
          payload: {
            subagentType: "research",
            instructions: entityLabel === null || entityLabel === undefined ? loop.instruction : `${loop.instruction}\n\nContext: ${entityLabel}`,
          },
        }]
      : [],
    agentLoopBrief: loop.outputMode === "agent_loop"
      ? `Harwick should execute this ${loop.triggerType === "event" ? "event-triggered" : "recurring"} instruction as a bounded approval-first agent loop: ${loop.instruction}`
      : null,
  });
}

function workItemTypeForLoop(loop: HarwickLoop): HarwickWorkItemCreate["type"] {
  if (loop.outputMode === "draft" || loop.outputMode === "agent_loop") {
    return "approval";
  }
  return loop.approvalMode === "approval_required" ? "approval" : "insight";
}

function buildLoopWorkItem(params: {
  loop: HarwickLoop;
  plan: HarwickLoopWorkItemPlan;
  signalKey: string;
  nowIso: string;
  triggerContext?: HarwickLoopPlannerContext;
}): HarwickWorkItemCreate {
  return HarwickWorkItemCreateSchema.parse({
    workspaceId: params.loop.workspaceId,
    leadId: params.triggerContext?.leadId ?? null,
    routingDecisionId: null,
    trajectoryId: null,
    stepId: null,
    type: workItemTypeForLoop(params.loop),
    status: "pending",
    targetMemberId: null,
    targetRole: params.plan.targetRole,
    priority: params.plan.priority,
    title: params.plan.title,
    summary: params.plan.summary,
    recommendedAction: params.plan.recommendedAction,
    reason: params.plan.reason,
    payload: {
      signalType: params.loop.triggerType === "event" ? "harwick_loop_event" : "harwick_loop_due",
      signalKey: params.signalKey,
      loopId: params.loop.id,
      loopName: params.loop.name,
      triggerType: params.loop.triggerType,
      eventType: params.loop.eventType,
      scheduleSpec: params.loop.scheduleSpec,
      instruction: params.loop.instruction,
      approvalMode: params.loop.approvalMode,
      outputMode: params.loop.outputMode,
      toolAllowlist: params.loop.toolAllowlist,
      draftBody: params.plan.draftBody,
      proposedToolCalls: params.plan.proposedToolCalls,
      agentLoopBrief: params.plan.agentLoopBrief,
      requiresOperatorApproval: params.loop.approvalMode !== "auto_execute"
        || params.loop.outputMode === "draft"
        || params.loop.outputMode === "agent_loop",
      source: params.loop.triggerType === "event" ? "harwick_loop_event_executor" : "harwick_loop_executor",
      dueAt: params.loop.nextRunAt ?? params.triggerContext?.occurredAt ?? params.nowIso,
      triggerContext: params.triggerContext ?? null,
    },
    dueAt: params.triggerContext?.occurredAt ?? null,
  });
}

function buildClosedWonEventContext(event: HarwickLoopClosedWonEvent): HarwickLoopPlannerContext {
  return {
    triggerType: "event",
    eventType: "lead_closed_won",
    leadId: event.leadId,
    entityLabel: event.leadName === null ? "a newly closed lead" : `${event.leadName} just closed`,
    occurredAt: event.occurredAt,
    summary: `Lead closed won via ${event.sourceChannel}${event.targetArea === null ? "" : ` in ${event.targetArea}`}.`,
    payload: {
      leadStatus: event.status,
      sourceChannel: event.sourceChannel,
      targetArea: event.targetArea,
      timeline: event.timeline,
      assignedAgentId: event.assignedAgentId,
      occurredAt: event.occurredAt,
    },
  };
}

export async function executeHarwickEventLoops(params: {
  loopRepository: HarwickLoopRepository;
  eventSourceRepository: HarwickLoopEventSourceRepository;
  workItemRepository: Pick<HarwickWorkItemRepository, "createWorkItem" | "findOpenInsightBySignalKey">;
  plannerClient?: HarwickLoopPlannerClient;
  intelligenceClient?: HarwickWorkItemIntelligenceClient;
  now?: () => Date;
  batchSize?: number;
}): Promise<HarwickEventLoopExecutionReport> {
  const now = params.now?.() ?? new Date();
  const nowIso = now.toISOString();
  const closedWonLoops = await params.loopRepository.listActiveEventLoops({
    eventType: "lead_closed_won",
    limit: params.batchSize ?? 10,
  });
  const plannerClient = params.plannerClient ?? { planWorkItem: (loop: HarwickLoop, _nowIso: string, context?: HarwickLoopPlannerContext) => Promise.resolve(deterministicPlan(loop, context)) };

  if (closedWonLoops.length === 0) {
    return {
      scannedLoops: 0,
      scannedEvents: 0,
      completed: 0,
      surfaced: 0,
      drafted: 0,
      plannedAgentLoops: 0,
      skippedExisting: 0,
      failed: 0,
    };
  }

  const earliestLastRunAt = closedWonLoops
    .map((loop) => loop.lastRunAt)
    .filter((value): value is string => value !== null)
    .sort((left, right) => Date.parse(left) - Date.parse(right))[0]
    ?? new Date(now.getTime() - 7 * MS_PER_DAY).toISOString();
  const closedWonEvents = await params.eventSourceRepository.listClosedWonLeadEvents({
    sinceIso: earliestLastRunAt,
    limit: Math.max((params.batchSize ?? 10) * 4, 20),
  });

  let completed = 0;
  let surfaced = 0;
  let drafted = 0;
  let plannedAgentLoops = 0;
  let skippedExisting = 0;
  let failed = 0;

  for (const loop of closedWonLoops) {
    const loopEvents = closedWonEvents.filter((event) =>
      event.workspaceId === loop.workspaceId
      && (loop.lastRunAt === null || Date.parse(event.occurredAt) > Date.parse(loop.lastRunAt))
    ).slice(0, params.batchSize ?? 10);

    for (const event of loopEvents) {
      const signalKey = `harwick_loop_event:${loop.id}:${event.leadId}:${event.occurredAt}`;
      const run = await params.loopRepository.createRun({
        workspaceId: loop.workspaceId,
        loopId: loop.id,
        instructionSnapshot: loop.instruction,
        nowIso,
        metadata: {
          signalKey,
          eventType: loop.eventType,
          leadId: event.leadId,
          occurredAt: event.occurredAt,
        },
      });

      try {
        const existing = await params.workItemRepository.findOpenInsightBySignalKey({
          workspaceId: loop.workspaceId,
          signalKey,
        });
        if (existing !== null) {
          skippedExisting += 1;
          await params.loopRepository.completeRun({
            workspaceId: loop.workspaceId,
            loopId: loop.id,
            runId: run.runId,
            nowIso,
            status: "completed",
            resultSummary: "Skipped surfacing because an open work item already exists for this event occurrence.",
            workItemId: existing.id,
            nextRunAt: null,
          });
          completed += 1;
          continue;
        }

        const triggerContext = buildClosedWonEventContext(event);
        const plan = LoopWorkItemPlanSchema.parse(await plannerClient.planWorkItem(loop, nowIso, triggerContext));
        const workItem = await intelligizeHarwickWorkItem({
          context: {
            signalKey,
            source: "loop",
            item: buildLoopWorkItem({
              loop,
              plan,
              signalKey,
              nowIso,
              triggerContext,
            }),
          },
          ...(params.intelligenceClient === undefined ? {} : { client: params.intelligenceClient }),
        });
        const created = await params.workItemRepository.createWorkItem(workItem);
        await params.loopRepository.completeRun({
          workspaceId: loop.workspaceId,
          loopId: loop.id,
          runId: run.runId,
          nowIso,
          status: "completed",
          resultSummary: `Surfaced Harwick event loop "${loop.name}" for ${event.leadName ?? event.leadId}.`,
          workItemId: created.workItemId,
          nextRunAt: null,
        });
        completed += 1;
        surfaced += 1;
        if (loop.outputMode === "draft") drafted += 1;
        if (loop.outputMode === "agent_loop") plannedAgentLoops += 1;
      } catch (error) {
        failed += 1;
        await params.loopRepository.completeRun({
          workspaceId: loop.workspaceId,
          loopId: loop.id,
          runId: run.runId,
          nowIso,
          status: "failed",
          errorMessage: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000),
          nextRunAt: null,
        });
      }
    }
  }

  return {
    scannedLoops: closedWonLoops.length,
    scannedEvents: closedWonEvents.length,
    completed,
    surfaced,
    drafted,
    plannedAgentLoops,
    skippedExisting,
    failed,
  };
}

export async function executeDueHarwickLoops(
  deps: HarwickLoopExecutionDeps,
): Promise<HarwickLoopExecutionReport> {
  const now = deps.now?.() ?? new Date();
  const nowIso = now.toISOString();
  const loops = await deps.loopRepository.listDueScheduledLoops({
    nowIso,
    limit: deps.batchSize ?? 10,
  });
  const plannerClient = deps.plannerClient ?? { planWorkItem: (loop: HarwickLoop) => Promise.resolve(deterministicPlan(loop)) };

  let completed = 0;
  let surfaced = 0;
  let drafted = 0;
  let plannedAgentLoops = 0;
  let skippedExisting = 0;
  let failed = 0;

  for (const loop of loops) {
    const signalKey = `harwick_loop_due:${loop.id}:${loop.nextRunAt ?? nowIso}`;
    const run = await deps.loopRepository.createRun({
      workspaceId: loop.workspaceId,
      loopId: loop.id,
      instructionSnapshot: loop.instruction,
      nowIso,
      metadata: {
        signalKey,
        scheduleSpec: loop.scheduleSpec,
        outputMode: loop.outputMode,
      },
    });

    const nextRunAt = loop.scheduleSpec === null ? null : computeNextHarwickLoopRunAt(loop.scheduleSpec, now);

    try {
      const existing = await deps.workItemRepository.findOpenInsightBySignalKey({
        workspaceId: loop.workspaceId,
        signalKey,
      });
      if (existing !== null) {
        skippedExisting += 1;
        await deps.loopRepository.completeRun({
          workspaceId: loop.workspaceId,
          loopId: loop.id,
          runId: run.runId,
          nowIso,
          status: "completed",
          resultSummary: "Skipped surfacing because an open work item already exists for this scheduled occurrence.",
          workItemId: existing.id,
          nextRunAt,
        });
        completed += 1;
        continue;
      }

      const plan = LoopWorkItemPlanSchema.parse(await plannerClient.planWorkItem(loop, nowIso));
      const workItem = await intelligizeHarwickWorkItem({
        context: {
          signalKey,
          source: "loop",
          item: buildLoopWorkItem({ loop, plan, signalKey, nowIso }),
        },
        ...(deps.intelligenceClient === undefined ? {} : { client: deps.intelligenceClient }),
      });
      const created = await deps.workItemRepository.createWorkItem(workItem);
      await deps.loopRepository.completeRun({
        workspaceId: loop.workspaceId,
        loopId: loop.id,
        runId: run.runId,
        nowIso,
        status: "completed",
        resultSummary: `Surfaced Harwick loop "${loop.name}" as a ${workItem.type}.`,
        workItemId: created.workItemId,
        nextRunAt,
      });
      completed += 1;
      surfaced += 1;
      if (loop.outputMode === "draft") drafted += 1;
      if (loop.outputMode === "agent_loop") plannedAgentLoops += 1;
    } catch (error) {
      failed += 1;
      await deps.loopRepository.completeRun({
        workspaceId: loop.workspaceId,
        loopId: loop.id,
        runId: run.runId,
        nowIso,
        status: "failed",
        errorMessage: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000),
        nextRunAt: loop.nextRunAt,
      });
    }
  }

  return {
    scanned: loops.length,
    completed,
    surfaced,
    drafted,
    plannedAgentLoops,
    skippedExisting,
    failed,
  };
}
