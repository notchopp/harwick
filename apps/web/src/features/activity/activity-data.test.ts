import { describe, expect, it, vi } from "vitest";
import type {
  CrmSyncLogRow,
  LeadEventRow,
  ProviderErrorLogRow,
  Tables,
} from "../../lib/supabase/database.types";
import { loadWorkspaceActivity, type WorkspaceActivityRepository } from "./activity-data";

type WorkflowJobRow = Tables<"workflow_jobs">;
type AuditLogRow = Tables<"audit_logs">;

const workspaceId = "11111111-1111-4111-8111-111111111111";

function leadEvent(overrides: Partial<LeadEventRow> = {}): LeadEventRow {
  return {
    id: "lead-event-1",
    workspace_id: workspaceId,
    lead_id: "lead-1",
    provider: "meta",
    event_type: "inbound_message",
    source_channel: "instagram_dm",
    provider_event_id: "provider-event-1",
    provider_account_id: "ig-1",
    provider_user_id: "user-1",
    source_post_id: null,
    source_comment_id: null,
    text: "Call me at 305-555-0199 about this home.",
    occurred_at: "2026-05-06T14:00:00.000Z",
    created_at: "2026-05-06T14:00:00.000Z",
    lead_classification: "lead",
    lead_classification_confidence: 0.92,
    lead_classification_hint: null,
    lead_classification_reason: null,
    ...overrides,
  };
}

function auditLog(overrides: Partial<AuditLogRow> = {}): AuditLogRow {
  return {
    id: "audit-1",
    workspace_id: workspaceId,
    user_id: "user-1",
    actor_type: "member",
    action: "lead_routing_override",
    resource_type: "lead",
    resource_id: "lead-1",
    metadata: {},
    ip_address: null,
    user_agent: null,
    created_at: "2026-05-06T13:00:00.000Z",
    ...overrides,
  };
}

function workflowJob(overrides: Partial<WorkflowJobRow> = {}): WorkflowJobRow {
  return {
    id: "job-1",
    workspace_id: workspaceId,
    job_type: "follow_up_boss_sync",
    status: "failed",
    payload: {},
    idempotency_key: "fub:lead-1",
    lead_event_id: null,
    lead_id: "lead-1",
    run_after: "2026-05-06T12:00:00.000Z",
    locked_at: null,
    locked_by: null,
    attempt_count: 2,
    max_attempts: 3,
    last_error_code: "rate_limited",
    last_error_message: "Failed for sarah@example.com",
    created_at: "2026-05-06T12:00:00.000Z",
    updated_at: "2026-05-06T12:00:00.000Z",
    ...overrides,
  };
}

function crmSync(overrides: Partial<CrmSyncLogRow> = {}): CrmSyncLogRow {
  return {
    id: "crm-1",
    workspace_id: workspaceId,
    lead_id: "lead-1",
    provider: "follow_up_boss",
    provider_contact_id: "123",
    status: "synced",
    attempt_count: 1,
    last_error_code: null,
    last_error_message: null,
    last_outbound_at: "2026-05-06T11:00:00.000Z",
    next_retry_at: null,
    backsync_suppressed_until: null,
    created_at: "2026-05-06T11:00:00.000Z",
    updated_at: "2026-05-06T11:00:00.000Z",
    ...overrides,
  };
}

function providerError(overrides: Partial<ProviderErrorLogRow> = {}): ProviderErrorLogRow {
  return {
    id: "provider-error-1",
    workspace_id: workspaceId,
    provider: "twilio",
    operation: "send_sms",
    error_code: "invalid_number",
    error_message: "Could not send to 305-555-0177.",
    metadata: {},
    retryable: false,
    created_at: "2026-05-06T10:00:00.000Z",
    ...overrides,
  };
}

function makeRepository() {
  const listLeadEvents = vi.fn<WorkspaceActivityRepository["listLeadEvents"]>().mockResolvedValue([leadEvent()]);
  const listAuditLogs = vi.fn<WorkspaceActivityRepository["listAuditLogs"]>().mockResolvedValue([auditLog()]);
  const listWorkflowJobs = vi.fn<WorkspaceActivityRepository["listWorkflowJobs"]>().mockResolvedValue([workflowJob()]);
  const listCrmSyncLogs = vi.fn<WorkspaceActivityRepository["listCrmSyncLogs"]>().mockResolvedValue([crmSync()]);
  const listProviderErrors = vi.fn<WorkspaceActivityRepository["listProviderErrors"]>().mockResolvedValue([providerError()]);

  return {
    repository: {
      listLeadEvents,
      listAuditLogs,
      listWorkflowJobs,
      listCrmSyncLogs,
      listProviderErrors,
    } satisfies WorkspaceActivityRepository,
    mocks: {
      listLeadEvents,
      listAuditLogs,
      listWorkflowJobs,
      listCrmSyncLogs,
      listProviderErrors,
    },
  };
}

describe("loadWorkspaceActivity", () => {
  it("builds a workspace-scoped activity feed from real persistence tables", async () => {
    const { repository, mocks } = makeRepository();
    const activity = await loadWorkspaceActivity({ workspaceId, repository, limit: 25 });

    expect(mocks.listLeadEvents).toHaveBeenCalledWith({ workspaceId, limit: 25 });
    expect(mocks.listAuditLogs).toHaveBeenCalledWith({ workspaceId, limit: 25 });
    expect(mocks.listWorkflowJobs).toHaveBeenCalledWith({ workspaceId, limit: 25 });
    expect(mocks.listCrmSyncLogs).toHaveBeenCalledWith({ workspaceId, limit: 25 });
    expect(mocks.listProviderErrors).toHaveBeenCalledWith({ workspaceId, limit: 25 });
    expect(activity.events.map((event) => event.id)).toEqual([
      "lead_event:lead-event-1",
      "audit_log:audit-1",
      "workflow_job:job-1",
      "crm_sync:crm-1",
      "provider_error:provider-error-1",
    ]);
    expect(activity.events[0]?.detail).toBe("Call me at [phone] about this home.");
    expect(activity.events[2]).toMatchObject({
      type: "fub",
      icon: "sync",
      error: true,
      detail: "Failed for [email]",
    });
    expect(activity.events[4]?.detail).toBe("Could not send to [phone].");
  });
});
