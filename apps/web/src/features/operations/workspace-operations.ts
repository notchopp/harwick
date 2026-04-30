import {
  LeadTimelineResponseSchema,
  OperationsQueueSummarySchema,
  WorkspaceReadinessSummarySchema,
  type LeadTimelineItem,
  type LeadTimelineResponse,
  type OperationsQueueSummary,
  type WorkspaceReadinessItem,
  type WorkspaceReadinessStatus,
  type WorkspaceReadinessSummary,
} from "@realty-ops/core";
import type {
  CrmBacksyncEventRow,
  FollowUpBossWebhookSubscriptionRow,
  IntegrationAccountRow,
  LeadEventRow,
  LeadTaskRow,
  NurtureMessageRow,
  WorkerHeartbeatRow,
} from "../../lib/supabase/database.types";
import type { VoiceLeadHandoffRow } from "../../lib/supabase/voice-handoffs";

export type WorkspaceOperationsRepository = {
  countConnectedIntegrations(params: {
    workspaceId: string;
    provider: IntegrationAccountRow["provider"];
  }): Promise<number>;
  countActiveVoiceAgents(workspaceId: string): Promise<number>;
  countVerifiedListings(workspaceId: string): Promise<number>;
  findLatestWorkerHeartbeat(): Promise<WorkerHeartbeatRow | null>;
  countOpenTasks(workspaceId: string): Promise<number>;
  countUrgentTasks(workspaceId: string): Promise<number>;
  countFailedJobs(workspaceId: string): Promise<number>;
  countStuckJobs(params: { workspaceId: string; olderThanIso: string }): Promise<number>;
  countFailedCrmSyncs(workspaceId: string): Promise<number>;
  countProviderErrorsSince(params: { workspaceId: string; sinceIso: string }): Promise<number>;
  listLeadEvents(params: { workspaceId: string; leadId: string; limit: number }): Promise<LeadEventRow[]>;
  listLeadTasks(params: { workspaceId: string; leadId: string; limit: number }): Promise<LeadTaskRow[]>;
  listVoiceHandoffs(params: { workspaceId: string; leadId: string; limit: number }): Promise<VoiceLeadHandoffRow[]>;
  listCrmSyncLogs(params: { workspaceId: string; leadId: string; limit: number }): Promise<Array<{
    id: string;
    workspace_id: string;
    lead_id: string;
    provider: "follow_up_boss";
    status: "queued" | "synced" | "failed" | "skipped";
    provider_contact_id: string | null;
    last_outbound_at: string | null;
    created_at: string;
    updated_at: string;
  }>>;
  listCrmBacksyncEvents(params: { workspaceId: string; leadId: string; providerContactId: string | null; limit: number }): Promise<CrmBacksyncEventRow[]>;
  listNurtureMessages(params: { workspaceId: string; leadId: string; limit: number }): Promise<NurtureMessageRow[]>;
  findLeadFubContactId(params: { workspaceId: string; leadId: string }): Promise<string | null>;
  listFubSubscriptions(workspaceId: string): Promise<FollowUpBossWebhookSubscriptionRow[]>;
};

function summarizeStatus(items: WorkspaceReadinessItem[]): WorkspaceReadinessStatus {
  if (items.some((item) => item.status === "needs_setup")) {
    return "needs_setup";
  }
  if (items.some((item) => item.status === "degraded")) {
    return "degraded";
  }
  return "ready";
}

function heartbeatStatus(lastSeenAt: string | null, now: Date): WorkspaceReadinessStatus {
  if (lastSeenAt === null) {
    return "needs_setup";
  }

  const ageMs = now.getTime() - new Date(lastSeenAt).getTime();
  if (ageMs > 15 * 60 * 1000) {
    return "degraded";
  }

  return "ready";
}

export async function loadWorkspaceReadiness(params: {
  workspaceId: string;
  repository: WorkspaceOperationsRepository;
  now?: () => Date;
}): Promise<WorkspaceReadinessSummary> {
  const now = params.now?.() ?? new Date();
  const [
    metaCount,
    fubCount,
    voiceCount,
    listingCount,
    workerHeartbeat,
    fubSubscriptions,
  ] = await Promise.all([
    params.repository.countConnectedIntegrations({ workspaceId: params.workspaceId, provider: "meta" }),
    params.repository.countConnectedIntegrations({ workspaceId: params.workspaceId, provider: "follow_up_boss" }),
    params.repository.countActiveVoiceAgents(params.workspaceId),
    params.repository.countVerifiedListings(params.workspaceId),
    params.repository.findLatestWorkerHeartbeat(),
    params.repository.listFubSubscriptions(params.workspaceId),
  ]);
  const activeFubSubscriptions = fubSubscriptions.filter((subscription) => subscription.status === "active").length;
  const workerSeenAt = workerHeartbeat?.last_seen_at ?? null;
  const items: WorkspaceReadinessItem[] = [
    {
      key: "meta",
      status: metaCount > 0 ? "ready" : "needs_setup",
      label: "Meta",
      detail: metaCount > 0 ? `${metaCount} connected account${metaCount === 1 ? "" : "s"}` : "Connect Instagram or Facebook before social intake.",
      updatedAt: null,
    },
    {
      key: "follow_up_boss",
      status: fubCount > 0 && activeFubSubscriptions > 0 ? "ready" : fubCount > 0 ? "degraded" : "needs_setup",
      label: "Follow Up Boss",
      detail: fubCount > 0
        ? `${activeFubSubscriptions} active webhook subscription${activeFubSubscriptions === 1 ? "" : "s"}`
        : "Connect Follow Up Boss before qualified lead sync.",
      updatedAt: null,
    },
    {
      key: "voice",
      status: voiceCount > 0 ? "ready" : "needs_setup",
      label: "Voice",
      detail: voiceCount > 0 ? `${voiceCount} active voice agent${voiceCount === 1 ? "" : "s"}` : "Provision a Retell voice agent and number.",
      updatedAt: null,
    },
    {
      key: "listings",
      status: listingCount > 0 ? "ready" : "needs_setup",
      label: "Listings",
      detail: listingCount > 0 ? `${listingCount} verified listing fact${listingCount === 1 ? "" : "s"}` : "Import or enter manual listing facts.",
      updatedAt: null,
    },
    {
      key: "worker",
      status: heartbeatStatus(workerSeenAt, now),
      label: "Worker",
      detail: workerSeenAt === null ? "No worker heartbeat recorded." : `Last heartbeat at ${workerSeenAt}`,
      updatedAt: workerSeenAt,
    },
  ];

  return WorkspaceReadinessSummarySchema.parse({
    workspaceId: params.workspaceId,
    status: summarizeStatus(items),
    items,
  });
}

export async function loadOperationsQueueSummary(params: {
  workspaceId: string;
  repository: WorkspaceOperationsRepository;
  now?: () => Date;
}): Promise<OperationsQueueSummary> {
  const now = params.now?.() ?? new Date();
  const stuckBefore = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
  const errorsSince = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const [
    openTasks,
    urgentTasks,
    failedJobs,
    stuckJobs,
    failedCrmSyncs,
    providerErrors24h,
    heartbeat,
  ] = await Promise.all([
    params.repository.countOpenTasks(params.workspaceId),
    params.repository.countUrgentTasks(params.workspaceId),
    params.repository.countFailedJobs(params.workspaceId),
    params.repository.countStuckJobs({ workspaceId: params.workspaceId, olderThanIso: stuckBefore }),
    params.repository.countFailedCrmSyncs(params.workspaceId),
    params.repository.countProviderErrorsSince({ workspaceId: params.workspaceId, sinceIso: errorsSince }),
    params.repository.findLatestWorkerHeartbeat(),
  ]);

  return OperationsQueueSummarySchema.parse({
    workspaceId: params.workspaceId,
    openTasks,
    urgentTasks,
    failedJobs,
    stuckJobs,
    failedCrmSyncs,
    providerErrors24h,
    lastWorkerSeenAt: heartbeat?.last_seen_at ?? null,
  });
}

function redactDetail(text: string | null): string | null {
  if (text === null) {
    return null;
  }

  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, "[phone]")
    .slice(0, 500);
}

function leadEventTitle(row: LeadEventRow): string {
  if (row.source_channel === "instagram_dm") return "Instagram DM";
  if (row.source_channel === "instagram_comment") return "Instagram comment";
  if (row.source_channel === "facebook_dm") return "Facebook DM";
  if (row.source_channel === "facebook_comment") return "Facebook comment";
  if (row.source_channel === "call") return "Call event";
  if (row.source_channel === "sms") return "SMS event";
  return row.event_type;
}

export async function loadLeadTimeline(params: {
  workspaceId: string;
  leadId: string;
  repository: WorkspaceOperationsRepository;
  limit?: number;
}): Promise<LeadTimelineResponse> {
  const limit = Math.min(params.limit ?? 100, 200);
  const providerContactId = await params.repository.findLeadFubContactId({
    workspaceId: params.workspaceId,
    leadId: params.leadId,
  });
  const [
    leadEvents,
    tasks,
    handoffs,
    crmSyncs,
    backsyncEvents,
    nurtureMessages,
  ] = await Promise.all([
    params.repository.listLeadEvents({ workspaceId: params.workspaceId, leadId: params.leadId, limit }),
    params.repository.listLeadTasks({ workspaceId: params.workspaceId, leadId: params.leadId, limit }),
    params.repository.listVoiceHandoffs({ workspaceId: params.workspaceId, leadId: params.leadId, limit }),
    params.repository.listCrmSyncLogs({ workspaceId: params.workspaceId, leadId: params.leadId, limit }),
    params.repository.listCrmBacksyncEvents({ workspaceId: params.workspaceId, leadId: params.leadId, providerContactId, limit }),
    params.repository.listNurtureMessages({ workspaceId: params.workspaceId, leadId: params.leadId, limit }),
  ]);

  const items: LeadTimelineItem[] = [
    ...leadEvents.map((row) => ({
      id: `lead_event:${row.id}`,
      workspaceId: row.workspace_id,
      leadId: params.leadId,
      itemType: "lead_event" as const,
      title: leadEventTitle(row),
      detail: redactDetail(row.text),
      occurredAt: row.occurred_at,
      source: row.provider,
      status: row.event_type,
    })),
    ...tasks.map((row) => ({
      id: `task:${row.id}`,
      workspaceId: row.workspace_id,
      leadId: row.lead_id ?? params.leadId,
      itemType: "task" as const,
      title: row.title,
      detail: redactDetail(row.description),
      occurredAt: row.updated_at,
      source: row.task_type,
      status: row.status,
    })),
    ...handoffs.map((row) => ({
      id: `voice_handoff:${row.id}`,
      workspaceId: row.workspace_id,
      leadId: row.lead_id ?? params.leadId,
      itemType: "voice_handoff" as const,
      title: "Voice handoff",
      detail: redactDetail(row.summary),
      occurredAt: row.created_at,
      source: "retell",
      status: row.status,
    })),
    ...crmSyncs.map((row) => ({
      id: `crm_sync:${row.id}`,
      workspaceId: row.workspace_id,
      leadId: row.lead_id,
      itemType: "crm_sync" as const,
      title: "Follow Up Boss sync",
      detail: row.provider_contact_id === null ? null : `Contact ${row.provider_contact_id}`,
      occurredAt: row.last_outbound_at ?? row.updated_at ?? row.created_at,
      source: row.provider,
      status: row.status,
    })),
    ...backsyncEvents.map((row) => ({
      id: `crm_backsync:${row.id}`,
      workspaceId: row.workspace_id,
      leadId: params.leadId,
      itemType: "crm_backsync" as const,
      title: "Follow Up Boss activity",
      detail: row.resource_uri === null ? null : row.resource_uri,
      occurredAt: row.event_created_at,
      source: row.provider,
      status: row.status,
    })),
    ...nurtureMessages.map((row) => ({
      id: `nurture_message:${row.id}`,
      workspaceId: row.workspace_id,
      leadId: row.lead_id,
      itemType: "nurture_message" as const,
      title: row.status === "drafted" ? "Nurture draft" : "Nurture message",
      detail: redactDetail(row.body),
      occurredAt: row.updated_at,
      source: row.channel,
      status: row.status,
    })),
  ].sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime()).slice(0, limit);

  return LeadTimelineResponseSchema.parse({
    workspaceId: params.workspaceId,
    leadId: params.leadId,
    items,
  });
}
