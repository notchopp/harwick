import { describe, expect, it, vi } from "vitest";
import type { OperationsFailureItem } from "@realty-ops/core";
import {
  actOnCrmSyncFailure,
  actOnWorkflowJobFailure,
  loadOperationsFailureQueue,
  type FailureOperationsRepository,
} from "./failure-operations";

const workspaceId = "11111111-1111-4111-8111-111111111111";

function item(overrides: Partial<OperationsFailureItem> = {}): OperationsFailureItem {
  return {
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
    ...overrides,
  };
}

function repository(overrides: Partial<FailureOperationsRepository> = {}): FailureOperationsRepository {
  return {
    listFailedWorkflowJobs: vi.fn().mockResolvedValue([item()]),
    listStuckWorkflowJobs: vi.fn().mockResolvedValue([]),
    listFailedCrmSyncs: vi.fn().mockResolvedValue([]),
    listProviderErrors: vi.fn().mockResolvedValue([]),
    retryWorkflowJob: vi.fn().mockResolvedValue(item({ status: "queued" })),
    dismissWorkflowJob: vi.fn().mockResolvedValue(item({ status: "skipped", retryable: false })),
    retryCrmSync: vi.fn().mockResolvedValue(item({
      id: "crm_sync:sync-1",
      itemType: "crm_sync",
      status: "queued",
      provider: "follow_up_boss",
      operation: "fub_sync",
    })),
    ...overrides,
  };
}

describe("failure operations", () => {
  it("loads failures from jobs, crm syncs, and provider errors", async () => {
    const queue = await loadOperationsFailureQueue({
      workspaceId,
      repository: repository({
        listFailedCrmSyncs: vi.fn().mockResolvedValue([item({
          id: "crm_sync:sync-1",
          itemType: "crm_sync",
          occurredAt: "2026-04-29T13:00:00.000Z",
        })]),
      }),
    });

    expect(queue.items.map((entry) => entry.id)).toEqual(["crm_sync:sync-1", "workflow_job:job-1"]);
  });

  it("retries workflow jobs", async () => {
    const retryWorkflowJob = vi.fn<FailureOperationsRepository["retryWorkflowJob"]>()
      .mockResolvedValue(item({ status: "queued" }));
    await actOnWorkflowJobFailure({
      workspaceId,
      jobId: "job-1",
      request: { action: "retry_now" },
      repository: repository({ retryWorkflowJob }),
    });

    expect(retryWorkflowJob).toHaveBeenCalledWith({ workspaceId, jobId: "job-1" });
  });

  it("retries crm syncs", async () => {
    const retryCrmSync = vi.fn<FailureOperationsRepository["retryCrmSync"]>()
      .mockResolvedValue(item({ status: "queued" }));
    await actOnCrmSyncFailure({
      workspaceId,
      syncLogId: "sync-1",
      request: { action: "retry_now" },
      repository: repository({ retryCrmSync }),
    });

    expect(retryCrmSync).toHaveBeenCalledWith({ workspaceId, syncLogId: "sync-1" });
  });
});
