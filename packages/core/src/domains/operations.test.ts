import { describe, expect, it } from "vitest";
import {
  CrmSyncActionRequestSchema,
  LeadTimelineResponseSchema,
  OperationsQueueSummarySchema,
  OperationsFailureQueueResponseSchema,
  WorkspaceReadinessSummarySchema,
  WorkflowJobActionRequestSchema,
} from "./operations.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const leadId = "22222222-2222-4222-8222-222222222222";

describe("operations contracts", () => {
  it("validates workspace readiness summaries", () => {
    const parsed = WorkspaceReadinessSummarySchema.parse({
      workspaceId,
      status: "degraded",
      items: [
        {
          key: "meta",
          status: "ready",
          label: "Meta",
          detail: "1 connected account",
          updatedAt: "2026-04-29T12:00:00.000Z",
        },
      ],
    });

    expect(parsed.items[0]?.key).toBe("meta");
  });

  it("rejects unknown readiness keys", () => {
    expect(() => WorkspaceReadinessSummarySchema.parse({
      workspaceId,
      status: "ready",
      items: [{ key: "billing", status: "ready", label: "Billing", detail: "ok", updatedAt: null }],
    })).toThrow();
  });

  it("validates operations queue counters", () => {
    const parsed = OperationsQueueSummarySchema.parse({
      workspaceId,
      openTasks: 3,
      urgentTasks: 1,
      failedJobs: 0,
      stuckJobs: 0,
      failedCrmSyncs: 1,
      providerErrors24h: 2,
      lastWorkerSeenAt: null,
    });

    expect(parsed.failedCrmSyncs).toBe(1);
  });

  it("validates unified lead timelines", () => {
    const parsed = LeadTimelineResponseSchema.parse({
      workspaceId,
      leadId,
      items: [
        {
          id: "event:abc",
          workspaceId,
          leadId,
          itemType: "lead_event",
          title: "Instagram DM",
          detail: "Looking in Cypress",
          occurredAt: "2026-04-29T12:00:00.000Z",
          source: "meta",
          status: null,
        },
      ],
    });

    expect(parsed.items).toHaveLength(1);
  });

  it("validates operations failure queues and actions", () => {
    const parsed = OperationsFailureQueueResponseSchema.parse({
      workspaceId,
      items: [{
        id: "workflow_job:job-1",
        workspaceId,
        itemType: "workflow_job",
        title: "fub_sync failed",
        detail: "rate limited",
        status: "failed",
        retryable: true,
        occurredAt: "2026-04-29T12:00:00.000Z",
        provider: "worker",
        operation: "fub_sync",
      }],
    });

    expect(parsed.items[0]?.retryable).toBe(true);
    expect(WorkflowJobActionRequestSchema.parse({ action: "retry_now" }).action).toBe("retry_now");
    expect(CrmSyncActionRequestSchema.parse({ action: "retry_now" }).action).toBe("retry_now");
  });
});
