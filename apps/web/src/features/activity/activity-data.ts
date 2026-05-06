import type {
  CrmSyncLogRow,
  LeadEventRow,
  ProviderErrorLogRow,
  Tables,
} from "../../lib/supabase/database.types";

export type ActivityFilter = "all" | "lead" | "voice" | "social" | "fub" | "system";
export type ActivityIcon = "instagram" | "facebook" | "voice" | "sync" | "system" | "lead" | "listing";

type WorkflowJobRow = Tables<"workflow_jobs">;
type AuditLogRow = Tables<"audit_logs">;

export type WorkspaceActivityEvent = {
  id: string;
  occurredAt: string;
  type: Exclude<ActivityFilter, "all">;
  icon: ActivityIcon;
  title: string;
  detail: string | null;
  meta: string;
  error: boolean;
};

export type WorkspaceActivityData = {
  workspaceId: string;
  events: WorkspaceActivityEvent[];
};

export type WorkspaceActivityRepository = {
  listLeadEvents(params: { workspaceId: string; limit: number }): Promise<LeadEventRow[]>;
  listAuditLogs(params: { workspaceId: string; limit: number }): Promise<AuditLogRow[]>;
  listWorkflowJobs(params: { workspaceId: string; limit: number }): Promise<WorkflowJobRow[]>;
  listCrmSyncLogs(params: { workspaceId: string; limit: number }): Promise<CrmSyncLogRow[]>;
  listProviderErrors(params: { workspaceId: string; limit: number }): Promise<ProviderErrorLogRow[]>;
};

function redactDetail(text: string | null): string | null {
  if (text === null) {
    return null;
  }

  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, "[phone]")
    .slice(0, 280);
}

function prettify(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function leadEventIcon(row: LeadEventRow): ActivityIcon {
  if (row.source_channel.startsWith("instagram")) return "instagram";
  if (row.source_channel.startsWith("facebook")) return "facebook";
  if (row.source_channel === "call") return "voice";
  return "lead";
}

function leadEventType(row: LeadEventRow): WorkspaceActivityEvent["type"] {
  if (row.source_channel === "call") return "voice";
  if (row.source_channel.startsWith("instagram") || row.source_channel.startsWith("facebook")) return "social";
  return "lead";
}

function mapLeadEvent(row: LeadEventRow): WorkspaceActivityEvent {
  const channel = prettify(row.source_channel);
  const classification = row.lead_classification === null ? "" : ` · ${prettify(row.lead_classification)}`;

  return {
    id: `lead_event:${row.id}`,
    occurredAt: row.occurred_at,
    type: leadEventType(row),
    icon: leadEventIcon(row),
    title: `${channel} ${prettify(row.event_type)}`,
    detail: redactDetail(row.text),
    meta: `Lead event · ${row.provider}${classification}`,
    error: false,
  };
}

function mapAuditLog(row: AuditLogRow): WorkspaceActivityEvent {
  return {
    id: `audit_log:${row.id}`,
    occurredAt: row.created_at,
    type: "system",
    icon: row.resource_type === "listing" ? "listing" : "system",
    title: prettify(row.action),
    detail: row.resource_id === null ? null : `${prettify(row.resource_type)} ${row.resource_id}`,
    meta: `Audit · ${row.actor_type}`,
    error: false,
  };
}

function mapWorkflowJob(row: WorkflowJobRow): WorkspaceActivityEvent {
  const failed = row.status === "failed";

  return {
    id: `workflow_job:${row.id}`,
    occurredAt: row.updated_at,
    type: row.job_type.includes("fub") || row.job_type.includes("follow_up_boss") ? "fub" : "system",
    icon: row.job_type.includes("fub") || row.job_type.includes("follow_up_boss") ? "sync" : "system",
    title: `${prettify(row.job_type)} ${prettify(row.status)}`,
    detail: failed ? redactDetail(row.last_error_message) : null,
    meta: `Workflow job · attempt ${row.attempt_count}/${row.max_attempts}`,
    error: failed,
  };
}

function mapCrmSync(row: CrmSyncLogRow): WorkspaceActivityEvent {
  const failed = row.status === "failed";

  return {
    id: `crm_sync:${row.id}`,
    occurredAt: row.updated_at,
    type: "fub",
    icon: "sync",
    title: `Follow Up Boss sync ${prettify(row.status)}`,
    detail: failed ? redactDetail(row.last_error_message) : null,
    meta: `CRM sync · attempt ${row.attempt_count}`,
    error: failed,
  };
}

function mapProviderError(row: ProviderErrorLogRow): WorkspaceActivityEvent {
  return {
    id: `provider_error:${row.id}`,
    occurredAt: row.created_at,
    type: "system",
    icon: "system",
    title: `${prettify(row.provider)} ${prettify(row.operation)} error`,
    detail: redactDetail(row.error_message),
    meta: `Provider error · ${row.error_code}${row.retryable ? " · retryable" : ""}`,
    error: true,
  };
}

export async function loadWorkspaceActivity(params: {
  workspaceId: string;
  repository: WorkspaceActivityRepository;
  limit?: number;
}): Promise<WorkspaceActivityData> {
  const perSourceLimit = Math.min(params.limit ?? 50, 100);
  const [
    leadEvents,
    auditLogs,
    workflowJobs,
    crmSyncs,
    providerErrors,
  ] = await Promise.all([
    params.repository.listLeadEvents({ workspaceId: params.workspaceId, limit: perSourceLimit }),
    params.repository.listAuditLogs({ workspaceId: params.workspaceId, limit: perSourceLimit }),
    params.repository.listWorkflowJobs({ workspaceId: params.workspaceId, limit: perSourceLimit }),
    params.repository.listCrmSyncLogs({ workspaceId: params.workspaceId, limit: perSourceLimit }),
    params.repository.listProviderErrors({ workspaceId: params.workspaceId, limit: perSourceLimit }),
  ]);

  const events = [
    ...leadEvents.map(mapLeadEvent),
    ...auditLogs.map(mapAuditLog),
    ...workflowJobs.map(mapWorkflowJob),
    ...crmSyncs.map(mapCrmSync),
    ...providerErrors.map(mapProviderError),
  ]
    .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())
    .slice(0, perSourceLimit);

  return {
    workspaceId: params.workspaceId,
    events,
  };
}
