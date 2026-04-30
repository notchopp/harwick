import { describe, expect, it, vi } from "vitest";
import type { WorkspaceOperationsRepository } from "./workspace-operations";
import {
  loadLeadTimeline,
  loadOperationsQueueSummary,
  loadWorkspaceReadiness,
} from "./workspace-operations";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const leadId = "22222222-2222-4222-8222-222222222222";

function buildRepository(overrides: Partial<WorkspaceOperationsRepository> = {}): WorkspaceOperationsRepository {
  return {
    countConnectedIntegrations: vi.fn().mockResolvedValue(1),
    countActiveVoiceAgents: vi.fn().mockResolvedValue(1),
    countVerifiedListings: vi.fn().mockResolvedValue(1),
    findLatestWorkerHeartbeat: vi.fn().mockResolvedValue({
      worker_id: "worker-1",
      app_env: "test",
      last_seen_at: "2026-04-29T12:00:00.000Z",
      last_batch: {},
      updated_at: "2026-04-29T12:00:00.000Z",
    }),
    countOpenTasks: vi.fn().mockResolvedValue(0),
    countUrgentTasks: vi.fn().mockResolvedValue(0),
    countFailedJobs: vi.fn().mockResolvedValue(0),
    countStuckJobs: vi.fn().mockResolvedValue(0),
    countFailedCrmSyncs: vi.fn().mockResolvedValue(0),
    countProviderErrorsSince: vi.fn().mockResolvedValue(0),
    listLeadEvents: vi.fn().mockResolvedValue([]),
    listLeadTasks: vi.fn().mockResolvedValue([]),
    listVoiceHandoffs: vi.fn().mockResolvedValue([]),
    listCrmSyncLogs: vi.fn().mockResolvedValue([]),
    listCrmBacksyncEvents: vi.fn().mockResolvedValue([]),
    listNurtureMessages: vi.fn().mockResolvedValue([]),
    findLeadFubContactId: vi.fn().mockResolvedValue(null),
    listFubSubscriptions: vi.fn().mockResolvedValue([{
      id: "sub-1",
      workspace_id: workspaceId,
      integration_account_id: "integration-1",
      event_type: "peopleUpdated",
      status: "active",
      provider_webhook_id: "webhook-1",
      callback_token: "token",
      system_name: "system",
      encrypted_system_key_ref: "ref",
      last_registered_at: "2026-04-29T12:00:00.000Z",
      last_error_code: null,
      last_error_message: null,
      created_at: "2026-04-29T12:00:00.000Z",
      updated_at: "2026-04-29T12:00:00.000Z",
    }]),
    ...overrides,
  };
}

describe("workspace operations", () => {
  it("summarizes readiness across required launch systems", async () => {
    const readiness = await loadWorkspaceReadiness({
      workspaceId,
      repository: buildRepository(),
      now: () => new Date("2026-04-29T12:05:00.000Z"),
    });

    expect(readiness.status).toBe("ready");
    expect(readiness.items.map((item) => item.key)).toEqual([
      "meta",
      "follow_up_boss",
      "voice",
      "listings",
      "worker",
    ]);
  });

  it("marks stale worker heartbeat as degraded", async () => {
    const readiness = await loadWorkspaceReadiness({
      workspaceId,
      repository: buildRepository(),
      now: () => new Date("2026-04-29T12:30:00.000Z"),
    });

    expect(readiness.status).toBe("degraded");
    expect(readiness.items.find((item) => item.key === "worker")?.status).toBe("degraded");
  });

  it("counts failed and stuck backend work", async () => {
    const summary = await loadOperationsQueueSummary({
      workspaceId,
      repository: buildRepository({
        countOpenTasks: vi.fn().mockResolvedValue(4),
        countUrgentTasks: vi.fn().mockResolvedValue(2),
        countFailedJobs: vi.fn().mockResolvedValue(1),
        countStuckJobs: vi.fn().mockResolvedValue(1),
        countFailedCrmSyncs: vi.fn().mockResolvedValue(1),
        countProviderErrorsSince: vi.fn().mockResolvedValue(3),
      }),
      now: () => new Date("2026-04-29T12:30:00.000Z"),
    });

    expect(summary).toMatchObject({
      openTasks: 4,
      urgentTasks: 2,
      failedJobs: 1,
      stuckJobs: 1,
      failedCrmSyncs: 1,
      providerErrors24h: 3,
    });
  });

  it("builds a redacted unified lead timeline", async () => {
    const timeline = await loadLeadTimeline({
      workspaceId,
      leadId,
      repository: buildRepository({
        findLeadFubContactId: vi.fn().mockResolvedValue("123"),
        listLeadEvents: vi.fn().mockResolvedValue([{
          id: "event-1",
          workspace_id: workspaceId,
          lead_id: leadId,
          provider: "meta",
          event_type: "message_received",
          source_channel: "instagram_dm",
          provider_event_id: "provider-event-1",
          provider_account_id: "account-1",
          provider_user_id: "user-1",
          source_post_id: null,
          source_comment_id: null,
          text: "Call me at 713-555-1212",
          occurred_at: "2026-04-29T12:00:00.000Z",
          created_at: "2026-04-29T12:00:00.000Z",
        }]),
      }),
    });

    expect(timeline.items[0]).toMatchObject({
      title: "Instagram DM",
      detail: "Call me at [phone]",
    });
  });
});
