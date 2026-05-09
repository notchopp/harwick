import {
  VoiceDailyBriefResponseSchema,
  VoiceShowingBriefQuerySchema,
  VoiceShowingBriefResponseSchema,
  VoiceShowingDebriefRequestSchema,
  VoiceShowingDebriefResponseSchema,
  type LeadStatus,
  type VoiceShowingDebriefOutcome,
} from "@realty-ops/core";

type VoiceBriefLeadSnapshot = {
  id: string;
  name: string;
  status: LeadStatus;
  targetArea: string | null;
  timeline: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  lastMessageAt: string | null;
};

type VoiceBriefLeadActivity = {
  leadId: string;
  leadName: string;
  status: LeadStatus;
  score: number;
  lastMessageAt: string | null;
};

type VoiceBriefHandoff = {
  id: string;
  leadId: string | null;
  callerName: string | null;
  summary: string;
  urgency: "routine" | "hot" | "needs_handoff";
};

type VoiceBriefShowingTask = {
  id: string;
  leadId: string | null;
  title: string;
  status: string;
  requestedStartAt: string | null;
  requestedEndAt: string | null;
};

type VoiceBriefListing = {
  id: string;
  address: string;
  price: number | null;
};

type VoiceBriefShowingContext = {
  task: VoiceBriefShowingTask | null;
  listing: VoiceBriefListing | null;
};

type VoiceBriefSnippet = {
  body: string;
  occurredAt: string;
};

export type VoiceBriefsRepository = {
  countActiveConversationsSince(params: {
    workspaceId: string;
    sinceIso: string;
  }): Promise<number>;
  countUnassignedPriorityLeads(workspaceId: string): Promise<number>;
  countNurtureLeads(workspaceId: string): Promise<number>;
  listRecentLeadActivity(params: {
    workspaceId: string;
    limit: number;
  }): Promise<VoiceBriefLeadActivity[]>;
  listPendingVoiceHandoffs(params: {
    workspaceId: string;
    limit: number;
  }): Promise<VoiceBriefHandoff[]>;
  listOpenShowingTasks(params: {
    workspaceId: string;
    limit: number;
  }): Promise<VoiceBriefShowingTask[]>;
  findLeadSnapshot(params: {
    workspaceId: string;
    leadId: string;
  }): Promise<VoiceBriefLeadSnapshot | null>;
  findLatestConversationSnippet(params: {
    workspaceId: string;
    leadId: string;
  }): Promise<VoiceBriefSnippet | null>;
  findLatestLeadEventSnippet(params: {
    workspaceId: string;
    leadId: string;
  }): Promise<VoiceBriefSnippet | null>;
  findShowingContext(params: {
    workspaceId: string;
    leadId: string;
    taskId?: string;
  }): Promise<VoiceBriefShowingContext>;
  createDebriefConversationMessage(params: {
    workspaceId: string;
    leadId: string;
    body: string;
    createdAt: string;
  }): Promise<string>;
  createFollowUpTask(params: {
    workspaceId: string;
    leadId: string;
    title: string;
    description: string;
    priority: "normal" | "high" | "urgent";
    dueAt: string;
    createdAt: string;
  }): Promise<string>;
  updateLeadStatus(params: {
    workspaceId: string;
    leadId: string;
    status: LeadStatus;
    nextFollowUpAt: string | null;
    updatedAt: string;
  }): Promise<void>;
};

function pluralize(value: number, singular: string, plural = `${singular}s`): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function formatStatusLabel(status: LeadStatus): string {
  return status.replace(/_/g, " ");
}

function formatRelativeShort(iso: string | null, now: Date): string {
  if (iso === null) return "recently";
  const diffMs = now.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return "just now";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function formatBudgetRange(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  if (min !== null && max !== null) {
    return `$${Math.round(min / 1000)}k to $${Math.round(max / 1000)}k`;
  }
  if (min !== null) {
    return `from about $${Math.round(min / 1000)}k`;
  }
  return `up to about $${Math.round((max ?? 0) / 1000)}k`;
}

function formatShowingWindow(startIso: string | null, endIso: string | null): string | null {
  if (startIso === null) return null;
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return null;
  if (endIso === null) {
    return start.toLocaleString("en-US", {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  const end = new Date(endIso);
  if (Number.isNaN(end.getTime())) return null;
  return `${start.toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  })} to ${end.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

function leadStatusForOutcome(params: {
  currentStatus: LeadStatus;
  outcome: VoiceShowingDebriefOutcome;
  statusOverride?: LeadStatus;
}): LeadStatus {
  if (params.statusOverride !== undefined) {
    return params.statusOverride;
  }
  if (params.outcome === "went_well") {
    return params.currentStatus === "appointment_booked" ? "active_client" : "qualified";
  }
  if (params.outcome === "needs_follow_up") {
    return "qualified";
  }
  if (params.outcome === "reschedule_needed") {
    return "appointment_booked";
  }
  if (params.outcome === "not_interested") {
    return "closed_lost";
  }
  return params.currentStatus;
}

function defaultFollowUpDueAt(params: {
  now: Date;
  outcome: VoiceShowingDebriefOutcome;
}): string {
  const base = params.now.getTime();
  if (params.outcome === "went_well") {
    return new Date(base + 2 * 60 * 60 * 1000).toISOString();
  }
  if (params.outcome === "needs_follow_up" || params.outcome === "reschedule_needed") {
    return new Date(base + 24 * 60 * 60 * 1000).toISOString();
  }
  return new Date(base + 12 * 60 * 60 * 1000).toISOString();
}

function followUpTitle(outcome: VoiceShowingDebriefOutcome): string {
  if (outcome === "went_well") return "Send post-showing follow-up";
  if (outcome === "needs_follow_up") return "Review showing feedback with lead";
  if (outcome === "reschedule_needed") return "Reschedule showing";
  return "Review showing debrief";
}

export async function buildVoiceDailyBrief(params: {
  workspaceId: string;
  workspaceName: string;
  repository: VoiceBriefsRepository;
  now?: () => Date;
}) {
  const now = params.now?.() ?? new Date();
  const generatedAt = now.toISOString();
  const sinceIso = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

  const [
    activeConversationsLastHour,
    unassignedPriorityLeads,
    nurtureLeads,
    recentLeadActivity,
    pendingVoiceHandoffs,
    openShowingTasks,
  ] = await Promise.all([
    params.repository.countActiveConversationsSince({ workspaceId: params.workspaceId, sinceIso }),
    params.repository.countUnassignedPriorityLeads(params.workspaceId),
    params.repository.countNurtureLeads(params.workspaceId),
    params.repository.listRecentLeadActivity({ workspaceId: params.workspaceId, limit: 3 }),
    params.repository.listPendingVoiceHandoffs({ workspaceId: params.workspaceId, limit: 2 }),
    params.repository.listOpenShowingTasks({ workspaceId: params.workspaceId, limit: 2 }),
  ]);

  const highlights = [
    ...recentLeadActivity.map((lead) => ({
      leadId: lead.leadId,
      title: `${lead.leadName} is active`,
      detail: `${formatStatusLabel(lead.status)} · ${lead.score}/100 · ${formatRelativeShort(lead.lastMessageAt, now)}`,
    })),
    ...pendingVoiceHandoffs.map((handoff) => ({
      leadId: handoff.leadId,
      title: handoff.callerName === null ? "Voice handoff pending" : `${handoff.callerName} needs callback`,
      detail: handoff.summary,
    })),
    ...openShowingTasks.map((task) => ({
      leadId: task.leadId,
      title: "Showing request waiting",
      detail: task.title,
    })),
  ].slice(0, 5);

  const topFocus = highlights[0]?.title ?? "No urgent lead is waiting right now.";
  const spokenText = [
    `Daily brief for ${params.workspaceName}.`,
    `${pluralize(activeConversationsLastHour, "active conversation")} in the last hour.`,
    `${pluralize(unassignedPriorityLeads, "priority lead")} waiting for routing.`,
    `${pluralize(openShowingTasks.length, "showing task")} open and ${pluralize(pendingVoiceHandoffs.length, "voice handoff")} pending review.`,
    `Nurture currently has ${pluralize(nurtureLeads, "lead")}.`,
    `Top focus: ${topFocus}`,
  ].join(" ");

  return VoiceDailyBriefResponseSchema.parse({
    workspaceId: params.workspaceId,
    generatedAt,
    spokenText,
    summary: {
      activeConversationsLastHour,
      unassignedPriorityLeads,
      nurtureLeads,
      pendingVoiceHandoffs: pendingVoiceHandoffs.length,
      openShowingTasks: openShowingTasks.length,
    },
    highlights,
  });
}

export async function buildVoiceShowingBrief(params: {
  workspaceId: string;
  query: unknown;
  repository: VoiceBriefsRepository;
  now?: () => Date;
}) {
  const query = VoiceShowingBriefQuerySchema.parse(params.query);
  const now = params.now?.() ?? new Date();
  const lead = await params.repository.findLeadSnapshot({
    workspaceId: params.workspaceId,
    leadId: query.leadId,
  });
  if (lead === null) {
    return null;
  }

  const [conversationSnippet, leadEventSnippet, showingContext] = await Promise.all([
    params.repository.findLatestConversationSnippet({
      workspaceId: params.workspaceId,
      leadId: lead.id,
    }),
    params.repository.findLatestLeadEventSnippet({
      workspaceId: params.workspaceId,
      leadId: lead.id,
    }),
    params.repository.findShowingContext({
      workspaceId: params.workspaceId,
      leadId: lead.id,
      ...(query.taskId === undefined ? {} : { taskId: query.taskId }),
    }),
  ]);

  const latestSnippet = conversationSnippet ?? leadEventSnippet;
  const listingAddress = showingContext.listing?.address ?? null;
  const showingWindowStart = showingContext.task?.requestedStartAt ?? null;
  const showingWindowEnd = showingContext.task?.requestedEndAt ?? null;
  const showingWindow = formatShowingWindow(showingWindowStart, showingWindowEnd);
  const budgetLine = formatBudgetRange(lead.budgetMin, lead.budgetMax);

  const spokenText = [
    `Showing brief for ${lead.name}.`,
    `${lead.name} is currently in ${formatStatusLabel(lead.status)} stage.`,
    listingAddress === null ? "No listing address is attached yet." : `Listing: ${listingAddress}.`,
    showingWindow === null ? "No showing time is confirmed in the task yet." : `Scheduled window: ${showingWindow}.`,
    lead.targetArea === null ? null : `Target area: ${lead.targetArea}.`,
    budgetLine === null ? null : `Budget context is ${budgetLine}.`,
    latestSnippet === null
      ? "No recent conversation snippet was found."
      : `Latest message was ${formatRelativeShort(latestSnippet.occurredAt, now)}: ${latestSnippet.body}`,
  ].filter((line): line is string => line !== null).join(" ");

  return VoiceShowingBriefResponseSchema.parse({
    workspaceId: params.workspaceId,
    generatedAt: now.toISOString(),
    spokenText,
    snapshot: {
      leadId: lead.id,
      leadName: lead.name,
      status: lead.status,
      listingAddress,
      showingWindowStart,
      showingWindowEnd,
      latestConversationSnippet: latestSnippet?.body ?? null,
      latestConversationAt: latestSnippet?.occurredAt ?? null,
    },
  });
}

export async function submitVoiceShowingDebrief(params: {
  workspaceId: string;
  workspaceName: string;
  request: unknown;
  repository: VoiceBriefsRepository;
  now?: () => Date;
}) {
  const request = VoiceShowingDebriefRequestSchema.parse(params.request);
  const now = params.now?.() ?? new Date();
  const generatedAt = now.toISOString();
  const lead = await params.repository.findLeadSnapshot({
    workspaceId: params.workspaceId,
    leadId: request.leadId,
  });
  if (lead === null) {
    return null;
  }

  const transcriptMessageId = await params.repository.createDebriefConversationMessage({
    workspaceId: params.workspaceId,
    leadId: lead.id,
    body: `Showing debrief (${request.outcome}): ${request.debrief}`,
    createdAt: generatedAt,
  });

  const nextStatus = leadStatusForOutcome({
    currentStatus: lead.status,
    outcome: request.outcome,
    ...(request.statusOverride === undefined ? {} : { statusOverride: request.statusOverride }),
  });
  const statusUpdatedTo = nextStatus === lead.status ? null : nextStatus;

  const followUpDueAt = request.followUpDueAt ?? defaultFollowUpDueAt({
    now,
    outcome: request.outcome,
  });
  const shouldCreateFollowUpTask = request.outcome !== "not_interested";
  const followUpTaskId = shouldCreateFollowUpTask
    ? await params.repository.createFollowUpTask({
      workspaceId: params.workspaceId,
      leadId: lead.id,
      title: followUpTitle(request.outcome),
      description: request.debrief,
      priority: request.followUpTaskPriority,
      dueAt: followUpDueAt,
      createdAt: generatedAt,
    })
    : null;

  if (statusUpdatedTo !== null) {
    await params.repository.updateLeadStatus({
      workspaceId: params.workspaceId,
      leadId: lead.id,
      status: statusUpdatedTo,
      nextFollowUpAt: shouldCreateFollowUpTask ? followUpDueAt : null,
      updatedAt: generatedAt,
    });
  }

  const spokenText = [
    `Logged your showing debrief for ${lead.name} in ${params.workspaceName}.`,
    statusUpdatedTo === null ? null : `Lead status moved to ${formatStatusLabel(statusUpdatedTo)}.`,
    followUpTaskId === null
      ? "No follow-up task was created."
      : `I created a ${request.followUpTaskPriority} priority follow-up task for ${formatRelativeShort(followUpDueAt, now)}.`,
  ].filter((line): line is string => line !== null).join(" ");

  return VoiceShowingDebriefResponseSchema.parse({
    workspaceId: params.workspaceId,
    leadId: lead.id,
    generatedAt,
    outcome: request.outcome,
    statusUpdatedTo,
    followUpTaskId,
    transcriptMessageId,
    spokenText,
  });
}
