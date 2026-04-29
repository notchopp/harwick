import { describe, expect, it, vi } from "vitest";
import type { WorkflowJob } from "@realty-ops/core";
import { runWorkerBatch } from "./runner.js";
import type { WorkflowJobRepository } from "./repository.js";

const workspaceId = "123e4567-e89b-12d3-a456-426614174000";
const job: WorkflowJob = {
  id: "123e4567-e89b-12d3-a456-426614174002",
  workspaceId,
  leadId: "123e4567-e89b-12d3-a456-426614174001",
  leadEventId: null,
  jobType: "handoff_task",
  status: "processing",
  payload: {
    jobType: "handoff_task",
    workspaceId,
    leadId: "123e4567-e89b-12d3-a456-426614174001",
    source: "voice",
  },
  idempotencyKey: "handoff_task:123e4567-e89b-12d3-a456-426614174001",
  attemptCount: 1,
  maxAttempts: 5,
  runAfter: "2026-04-28T00:00:00.000Z",
  lockedAt: "2026-04-28T00:00:01.000Z",
  lockedBy: "worker-test",
  lastErrorCode: null,
  lastErrorMessage: null,
  createdAt: "2026-04-28T00:00:00.000Z",
  updatedAt: "2026-04-28T00:00:01.000Z",
};

describe("runWorkerBatch", () => {
  it("claims and completes jobs through the repository contract", async () => {
    const claimJobs = vi.fn<WorkflowJobRepository["claimJobs"]>().mockResolvedValue([job]);
    const markCompleted = vi.fn<WorkflowJobRepository["markCompleted"]>().mockResolvedValue(undefined);
    const markFailed = vi.fn<WorkflowJobRepository["markFailed"]>().mockResolvedValue(undefined);
    const repository: WorkflowJobRepository = {
      claimJobs,
      markCompleted,
      markFailed,
    };

    await expect(runWorkerBatch({
      repository,
      workerId: "worker-test",
      batchSize: 10,
    })).resolves.toEqual({
      claimed: 1,
      completed: 1,
      failed: 0,
    });

    expect(markCompleted).toHaveBeenCalledWith({
      jobId: job.id,
      status: "completed",
      message: "handoff task accepted from voice",
    });
    expect(markFailed).not.toHaveBeenCalled();
  });
});
