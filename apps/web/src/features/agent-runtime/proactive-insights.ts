import { HarwickWorkItemCreateSchema, type HarwickWorkItemCreate } from "@realty-ops/core";
import {
  intelligizeHarwickWorkItem,
  type HarwickWorkItemIntelligenceClient,
} from "./harwick-work-item-intelligence";

export type AmbiguousInboundEvent = {
  id: string;
  workspaceId: string;
  leadId: string;
  text: string | null;
  occurredAt: string;
  sourceChannel: string;
  confidence: number | null;
  reasonCode: string | null;
  leadHint: string | null;
};

export type UnassignedPriorityLead = {
  id: string;
  workspaceId: string;
  status: string;
  score: number;
  leadType: string;
  fullName: string | null;
  targetArea: string | null;
  timeline: string | null;
  lastMessageAt: string | null;
};

export type DormantLead = UnassignedPriorityLead & {
  lastMessageAt: string;
  assignedAgentId: string | null;
};

export type WorkspaceMemoryPattern = {
  id: string;
  workspaceId: string;
  memoryType: string;
  title: string;
  body: string;
  source: string;
  confidence: number;
  lastObservedAt: string;
  updatedAt: string;
};

export type WorkspaceMemoryReviewStats = {
  workspaceId: string;
  pendingCount: number;
  approvedCount: number;
  dismissedCount: number;
  latestObservedAt: string;
};

export type ProactiveInsightRepository = {
  listAmbiguousInboundEvents(params: {
    sinceIso: string;
    limit: number;
  }): Promise<AmbiguousInboundEvent[]>;
  listUnassignedPriorityLeads(params: {
    limit: number;
  }): Promise<UnassignedPriorityLead[]>;
  listDormantLeads(params: {
    beforeIso: string;
    limit: number;
  }): Promise<DormantLead[]>;
  listWorkspaceMemoryPatterns(params: {
    sinceIso: string;
    limit: number;
  }): Promise<WorkspaceMemoryPattern[]>;
  listWorkspaceMemoryReviewStats(params: {
    sinceIso: string;
    limit: number;
  }): Promise<WorkspaceMemoryReviewStats[]>;
  findOpenInsightBySignalKey(params: {
    workspaceId: string;
    signalKey: string;
  }): Promise<{ id: string } | null>;
  createWorkItem(item: HarwickWorkItemCreate): Promise<{ workItemId: string }>;
};

export type ProactiveInsightReport = {
  scanned: number;
  created: number;
  refined: number;
  skippedExisting: number;
  errors: number;
};

export type ProactiveInsightDeps = {
  repository: ProactiveInsightRepository;
  intelligenceClient?: HarwickWorkItemIntelligenceClient;
  now?: () => Date;
  batchSize?: number;
  lookbackHours?: number;
  dormantLeadDays?: number;
};

type InsightCandidate = {
  workspaceId: string;
  signalKey: string;
  item: HarwickWorkItemCreate;
};

function displayLeadName(name: string | null): string {
  const trimmed = name?.trim();
  return trimmed === undefined || trimmed.length === 0 ? "This lead" : trimmed;
}

function summarizeLeadContext(lead: UnassignedPriorityLead): string {
  const details = [
    lead.leadType === "unknown" ? null : lead.leadType,
    lead.targetArea,
    lead.timeline,
  ].filter((value): value is string => value !== null && value.trim().length > 0);

  return details.length === 0 ? "No extra qualification context yet." : details.join(" / ");
}

function hoursSince(params: { now: Date; iso: string }): number | null {
  const timestamp = Date.parse(params.iso);
  if (!Number.isFinite(timestamp)) return null;
  return (params.now.getTime() - timestamp) / 3600000;
}

function buildAmbiguousInboundCandidate(event: AmbiguousInboundEvent): InsightCandidate {
  const signalKey = `lead_classification_needs_review:${event.id}`;
  const confidenceText = event.confidence === null ? "unknown confidence" : `${Math.round(event.confidence * 100)}% confidence`;
  const message = event.text?.trim();

  return {
    workspaceId: event.workspaceId,
    signalKey,
    item: HarwickWorkItemCreateSchema.parse({
      workspaceId: event.workspaceId,
      leadId: event.leadId,
      routingDecisionId: null,
      trajectoryId: null,
      stepId: null,
      type: "insight",
      status: "pending",
      targetMemberId: null,
      targetRole: "operator",
      priority: event.confidence !== null && event.confidence < 0.35 ? "high" : "normal",
      title: "Review ambiguous inbound",
      summary: message === undefined || message.length === 0
        ? `Harwick's cheap classifier could not tell whether this ${event.sourceChannel} message is a lead.`
        : `Harwick's cheap classifier could not tell whether this ${event.sourceChannel} message is a lead: "${message.slice(0, 180)}"`,
      recommendedAction: "Classify or assign the conversation",
      reason: `The lead-or-not gate returned needs_review with ${confidenceText}. This should surface to an operator without spending full agent-loop tokens.`,
      payload: {
        signalType: "lead_classification_needs_review",
        signalKey,
        leadEventId: event.id,
        occurredAt: event.occurredAt,
        sourceChannel: event.sourceChannel,
        confidence: event.confidence,
        reasonCode: event.reasonCode,
        leadHint: event.leadHint,
      },
      dueAt: null,
    }),
  };
}

function buildUnassignedPriorityLeadCandidate(lead: UnassignedPriorityLead): InsightCandidate {
  const signalKey = `unassigned_priority_lead:${lead.id}:${lead.status}`;
  const name = displayLeadName(lead.fullName);

  return {
    workspaceId: lead.workspaceId,
    signalKey,
    item: HarwickWorkItemCreateSchema.parse({
      workspaceId: lead.workspaceId,
      leadId: lead.id,
      routingDecisionId: null,
      trajectoryId: null,
      stepId: null,
      type: "insight",
      status: "pending",
      targetMemberId: null,
      targetRole: "team_lead",
      priority: lead.status === "hot" || lead.score >= 75 ? "high" : "normal",
      title: "Priority lead needs assignment",
      summary: `${name} is ${lead.status} with score ${lead.score}, but no agent is assigned.`,
      recommendedAction: "Assign the best-fit agent",
      reason: `Harwick found a qualified or hot lead without an owner. Context: ${summarizeLeadContext(lead)}`,
      payload: {
        signalType: "unassigned_priority_lead",
        signalKey,
        leadStatus: lead.status,
        score: lead.score,
        leadType: lead.leadType,
        targetArea: lead.targetArea,
        timeline: lead.timeline,
        lastMessageAt: lead.lastMessageAt,
      },
      dueAt: null,
    }),
  };
}

function buildDormantLeadCandidate(lead: DormantLead, now: Date): InsightCandidate {
  const signalKey = `dormant_active_lead:${lead.id}`;
  const name = displayLeadName(lead.fullName);
  const dormantHours = hoursSince({ now, iso: lead.lastMessageAt });
  const dormantDays = dormantHours === null ? null : Math.floor(dormantHours / 24);
  const dormantText = dormantDays === null ? "multiple days" : `${dormantDays} day${dormantDays === 1 ? "" : "s"}`;

  return {
    workspaceId: lead.workspaceId,
    signalKey,
    item: HarwickWorkItemCreateSchema.parse({
      workspaceId: lead.workspaceId,
      leadId: lead.id,
      routingDecisionId: null,
      trajectoryId: null,
      stepId: null,
      type: "insight",
      status: "pending",
      targetMemberId: lead.assignedAgentId,
      targetRole: lead.assignedAgentId === null ? "lead_manager" : null,
      priority: lead.status === "hot" ? "high" : "normal",
      title: "Lead has gone quiet",
      summary: `${name} has had no recorded message for ${dormantText} and has no next follow-up scheduled.`,
      recommendedAction: "Send follow-up or start nurture",
      reason: `Harwick found an active ${lead.status} lead without a next_followup_at. Context: ${summarizeLeadContext(lead)}`,
      payload: {
        signalType: "dormant_active_lead",
        signalKey,
        leadStatus: lead.status,
        score: lead.score,
        leadType: lead.leadType,
        targetArea: lead.targetArea,
        timeline: lead.timeline,
        lastMessageAt: lead.lastMessageAt,
        assignedAgentId: lead.assignedAgentId,
        dormantDays,
      },
      dueAt: null,
    }),
  };
}

function buildWorkspaceMemoryPatternCandidate(memory: WorkspaceMemoryPattern): InsightCandidate {
  const signalKey = `workspace_memory_pattern:${memory.id}`;

  return {
    workspaceId: memory.workspaceId,
    signalKey,
    item: HarwickWorkItemCreateSchema.parse({
      workspaceId: memory.workspaceId,
      leadId: null,
      routingDecisionId: null,
      trajectoryId: null,
      stepId: null,
      type: "insight",
      status: "pending",
      targetMemberId: null,
      targetRole: "team_lead",
      priority: memory.confidence >= 0.8 ? "high" : "normal",
      title: "Workspace pattern needs review",
      summary: memory.title,
      recommendedAction: "Review pattern",
      reason: memory.body,
      payload: {
        signalType: "workspace_memory_pattern",
        signalKey,
        workspaceMemoryId: memory.id,
        memoryType: memory.memoryType,
        source: memory.source,
        confidence: memory.confidence,
        lastObservedAt: memory.lastObservedAt,
        updatedAt: memory.updatedAt,
      },
      dueAt: null,
    }),
  };
}

function buildWorkspaceMemoryReviewQualityCandidate(
  stats: WorkspaceMemoryReviewStats,
  now: Date,
): InsightCandidate | null {
  const reviewedCount = stats.approvedCount + stats.dismissedCount;
  const dismissedRatio = reviewedCount === 0 ? 0 : stats.dismissedCount / reviewedCount;
  const hasBacklog = stats.pendingCount >= 5;
  const hasQualityIssue = reviewedCount >= 5 && dismissedRatio >= 0.5;

  if (!hasBacklog && !hasQualityIssue) {
    return null;
  }

  const bucket = now.toISOString().slice(0, 10);
  const signalKey = `workspace_memory_review_quality:${stats.workspaceId}:${bucket}`;
  const priority = hasQualityIssue ? "high" : "normal";
  const dismissedPercent = Math.round(dismissedRatio * 100);

  return {
    workspaceId: stats.workspaceId,
    signalKey,
    item: HarwickWorkItemCreateSchema.parse({
      workspaceId: stats.workspaceId,
      leadId: null,
      routingDecisionId: null,
      trajectoryId: null,
      stepId: null,
      type: "insight",
      status: "pending",
      targetMemberId: null,
      targetRole: "team_lead",
      priority,
      title: hasQualityIssue ? "Workspace memory quality needs attention" : "Workspace memory review is backing up",
      summary: hasQualityIssue
        ? `${stats.dismissedCount} of ${reviewedCount} reviewed memories were dismissed in the current review window.`
        : `${stats.pendingCount} learned workspace memories are waiting for review.`,
      recommendedAction: hasQualityIssue ? "Review dismissed patterns" : "Review pending memories",
      reason: hasQualityIssue
        ? "Harwick is learning from brokerage-wide patterns, but a high dismissal rate means the distillation worker may be overfitting or surfacing noisy signals."
        : "Pending workspace memories still inform review queues, but approved/dismissed feedback is needed to keep Harwick's brokerage memory trustworthy.",
      payload: {
        signalType: "workspace_memory_review_quality",
        signalKey,
        pendingCount: stats.pendingCount,
        approvedCount: stats.approvedCount,
        dismissedCount: stats.dismissedCount,
        reviewedCount,
        dismissedRatio,
        dismissedPercent,
        latestObservedAt: stats.latestObservedAt,
      },
      dueAt: null,
    }),
  };
}

async function createCandidateIfNew(
  repository: ProactiveInsightRepository,
  candidate: InsightCandidate,
): Promise<"created" | "skipped_existing"> {
  const existing = await repository.findOpenInsightBySignalKey({
    workspaceId: candidate.workspaceId,
    signalKey: candidate.signalKey,
  });
  if (existing !== null) {
    return "skipped_existing";
  }

  await repository.createWorkItem(candidate.item);
  return "created";
}

async function refineCandidate(
  deps: Pick<ProactiveInsightDeps, "intelligenceClient">,
  candidate: InsightCandidate,
): Promise<{ candidate: InsightCandidate; refined: boolean }> {
  const item = await intelligizeHarwickWorkItem({
    context: {
      signalKey: candidate.signalKey,
      source: "proactive_insight",
      item: candidate.item,
    },
    ...(deps.intelligenceClient === undefined ? {} : { client: deps.intelligenceClient }),
  });
  const intelligence = item.payload["intelligence"];
  const refined = typeof intelligence === "object"
    && intelligence !== null
    && !Array.isArray(intelligence)
    && (intelligence as Record<string, unknown>)["source"] === "small_model";
  return {
    refined,
    candidate: {
      ...candidate,
      item,
    },
  };
}

export async function surfaceProactiveInsights(
  deps: ProactiveInsightDeps,
): Promise<ProactiveInsightReport> {
  const now = deps.now?.() ?? new Date();
  const batchSize = deps.batchSize ?? 25;
  const lookbackHours = deps.lookbackHours ?? 48;
  const dormantLeadDays = deps.dormantLeadDays ?? 5;
  const sinceIso = new Date(now.getTime() - lookbackHours * 3600000).toISOString();
  const dormantBeforeIso = new Date(now.getTime() - dormantLeadDays * 24 * 3600000).toISOString();

  const [ambiguousEvents, unassignedLeads, dormantLeads, workspacePatterns, memoryReviewStats] = await Promise.all([
    deps.repository.listAmbiguousInboundEvents({ sinceIso, limit: batchSize }),
    deps.repository.listUnassignedPriorityLeads({ limit: batchSize }),
    deps.repository.listDormantLeads({ beforeIso: dormantBeforeIso, limit: batchSize }),
    deps.repository.listWorkspaceMemoryPatterns({ sinceIso, limit: batchSize }),
    deps.repository.listWorkspaceMemoryReviewStats({ sinceIso, limit: batchSize }),
  ]);

  const candidates = [
    ...ambiguousEvents.map(buildAmbiguousInboundCandidate),
    ...unassignedLeads.map(buildUnassignedPriorityLeadCandidate),
    ...dormantLeads.map((lead) => buildDormantLeadCandidate(lead, now)),
    ...workspacePatterns.map(buildWorkspaceMemoryPatternCandidate),
    ...memoryReviewStats
      .map((stats) => buildWorkspaceMemoryReviewQualityCandidate(stats, now))
      .filter((candidate): candidate is InsightCandidate => candidate !== null),
  ];

  let created = 0;
  let refined = 0;
  let skippedExisting = 0;
  let errors = 0;

  for (const candidate of candidates) {
    try {
      const refinedCandidate = await refineCandidate(deps, candidate);
      if (refinedCandidate.refined) {
        refined += 1;
      }
      const result = await createCandidateIfNew(deps.repository, refinedCandidate.candidate);
      if (result === "created") {
        created += 1;
      } else {
        skippedExisting += 1;
      }
    } catch (error) {
      console.warn("[surfaceProactiveInsights] failed to create insight", candidate.signalKey, error);
      errors += 1;
    }
  }

  return {
    scanned: candidates.length,
    created,
    refined,
    skippedExisting,
    errors,
  };
}
