import { describe, expect, it } from "vitest";
import { handleWorkflowJob, parseWorkerJobRows, type WorkerJobRow, type WorkflowJobServices } from "./jobs.js";

const workspaceId = "123e4567-e89b-12d3-a456-426614174000";
const leadId = "123e4567-e89b-12d3-a456-426614174001";
const enrollmentId = "123e4567-e89b-12d3-a456-426614174003";

function createRow(overrides: Partial<WorkerJobRow> = {}): WorkerJobRow {
  return {
    id: "123e4567-e89b-12d3-a456-426614174002",
    workspace_id: workspaceId,
    lead_id: leadId,
    lead_event_id: null,
    job_type: "lead_intake",
    status: "processing",
    payload: {
      jobType: "lead_intake",
      workspaceId,
      leadId,
      source: "retell",
    },
    idempotency_key: `lead_intake:${leadId}`,
    attempt_count: 1,
    max_attempts: 5,
    run_after: "2026-04-28T00:00:00.000Z",
    locked_at: "2026-04-28T00:01:00.000Z",
    locked_by: "worker-test",
    last_error_code: null,
    last_error_message: null,
    created_at: "2026-04-28T00:00:00.000Z",
    updated_at: "2026-04-28T00:01:00.000Z",
    ...overrides,
  };
}

describe("parseWorkerJobRows", () => {
  it("maps Supabase rows into typed workflow jobs", () => {
    expect(parseWorkerJobRows([createRow()])[0]).toMatchObject({
      workspaceId,
      leadId,
      jobType: "lead_intake",
      payload: {
        jobType: "lead_intake",
        source: "retell",
      },
    });
  });
});

describe("handleWorkflowJob", () => {
  it("dispatches the intake worker category", async () => {
    const [job] = parseWorkerJobRows([createRow()]);

    await expect(handleWorkflowJob(job!)).resolves.toEqual({
      status: "completed",
      message: "accepted retell intake for downstream qualification",
    });
  });

  it("keeps FUB sync from fake-successing before the client is implemented", async () => {
    const [job] = parseWorkerJobRows([createRow({
      job_type: "fub_sync",
      payload: {
        jobType: "fub_sync",
        workspaceId,
        leadId,
        qualifiedOnly: true,
      },
      idempotency_key: `fub_sync:${leadId}`,
    })]);

    await expect(handleWorkflowJob(job!)).resolves.toEqual({
      status: "skipped",
      message: "Follow Up Boss client is not configured in the worker yet",
    });
  });

  it("syncs FUB jobs when a provider service is configured", async () => {
    const [job] = parseWorkerJobRows([createRow({
      job_type: "fub_sync",
      payload: {
        jobType: "fub_sync",
        workspaceId,
        leadId,
        qualifiedOnly: true,
      },
      idempotency_key: `fub_sync:${leadId}`,
    })]);
    const services: Pick<WorkflowJobServices, "syncLeadToFub"> = {
      syncLeadToFub() {
        return Promise.resolve("123");
      },
    };

    await expect(handleWorkflowJob(job!, services as WorkflowJobServices)).resolves.toEqual({
      status: "completed",
      message: "Follow Up Boss synced contact 123",
    });
  });

  it("processes nurture delivery jobs through the worker service", async () => {
    const [job] = parseWorkerJobRows([createRow({
      job_type: "nurture_delivery",
      payload: {
        jobType: "nurture_delivery",
        workspaceId,
        leadId,
        enrollmentId,
        reason: "scheduled_followup",
      },
      idempotency_key: `nurture_delivery:${enrollmentId}:0`,
    })]);
    const services: Pick<WorkflowJobServices, "processNurtureDelivery"> = {
      processNurtureDelivery(params) {
        expect(params).toEqual({
          workspaceId,
          leadId,
          enrollmentId,
        });
        return Promise.resolve("nurture drafted step 0");
      },
    };

    await expect(handleWorkflowJob(job!, services as WorkflowJobServices)).resolves.toEqual({
      status: "completed",
      message: "nurture drafted step 0",
    });
  });

  it("dispatches Harwick AI reply jobs through the worker service", async () => {
    const turnId = "123e4567-e89b-12d3-a456-426614174004";
    const reviewId = "123e4567-e89b-12d3-a456-426614174005";
    const [job] = parseWorkerJobRows([createRow({
      job_type: "harwick_ai_reply",
      payload: {
        jobType: "harwick_ai_reply",
        workspaceId,
        leadId,
        turnId,
        socialReplyReviewId: reviewId,
        channel: "instagram_dm",
        providerAccountId: "ig-business-1",
        recipientUserId: "ig-user-1",
        sourceCommentId: null,
        sourcePostId: "post-1",
      },
      idempotency_key: `harwick_ai_reply:${turnId}`,
    })]);
    const services: Pick<WorkflowJobServices, "processHarwickAiReply"> = {
      processHarwickAiReply(params) {
        expect(params).toEqual({
          workspaceId,
          leadId,
          turnId,
          socialReplyReviewId: reviewId,
          channel: "instagram_dm",
          providerAccountId: "ig-business-1",
          recipientUserId: "ig-user-1",
          sourceCommentId: null,
          sourcePostId: "post-1",
        });
        return Promise.resolve({
          status: "completed",
          message: "executed Harwick AI turn",
        });
      },
    };

    await expect(handleWorkflowJob(job!, services as WorkflowJobServices)).resolves.toEqual({
      status: "completed",
      message: "executed Harwick AI turn",
    });
  });

  it("processes listing recheck jobs through the worker service", async () => {
    const listingId = "123e4567-e89b-12d3-a456-426614174004";
    const [job] = parseWorkerJobRows([createRow({
      lead_id: null,
      job_type: "listing_recheck",
      payload: {
        jobType: "listing_recheck",
        workspaceId,
        listingId,
        reason: "scheduled_recheck",
      },
      idempotency_key: `listing_recheck:${listingId}:2026-04-29T12:00:00.000Z`,
    })]);
    const services: Pick<WorkflowJobServices, "processListingRecheck"> = {
      processListingRecheck(params) {
        expect(params).toEqual({ workspaceId, listingId });
        return Promise.resolve("listing recheck task created");
      },
    };

    await expect(handleWorkflowJob(job!, services as WorkflowJobServices)).resolves.toEqual({
      status: "completed",
      message: "listing recheck task created",
    });
  });

  it("skips FUB backsync reconciliation until the worker service is wired", async () => {
    const [job] = parseWorkerJobRows([createRow({
      job_type: "fub_backsync_reconcile",
      payload: {
        jobType: "fub_backsync_reconcile",
        workspaceId,
        backsyncEventId: "123e4567-e89b-12d3-a456-426614174077",
      },
      idempotency_key: "fub_backsync:event-1",
    })]);

    await expect(handleWorkflowJob(job!)).resolves.toEqual({
      status: "skipped",
      message: "Follow Up Boss backsync reconciliation is not configured in the worker yet",
    });
  });

  it("qualifies hot leads and schedules assignment, handoff, and FUB work", async () => {
    const [job] = parseWorkerJobRows([createRow({
      job_type: "lead_qualification",
      payload: {
        jobType: "lead_qualification",
        workspaceId,
        leadId,
        reason: "post_call_analysis",
      },
      idempotency_key: `lead_qualification:${leadId}`,
    })]);
    const calls: string[] = [];
    const services: WorkflowJobServices = {
      getLeadWorkflowContext() {
        calls.push("getLeadWorkflowContext");
        return Promise.resolve({
          leadId,
          workspaceId,
          sourceChannel: "call",
          leadType: "buyer",
          intent: "unknown",
          timeline: "this weekend",
          budgetMin: null,
          budgetMax: null,
          targetArea: "Cypress",
          financingStatus: "preapproved",
          currentScore: 0,
          currentStatus: "new",
          assignedAgentId: null,
          engagementCount: 1,
          latestText: "I want a showing this weekend.",
        });
      },
      updateLeadWorkflowDecision() {
        calls.push("updateLeadWorkflowDecision");
        return Promise.resolve();
      },
      assignLead() {
        calls.push("assignLead");
        return Promise.resolve("123e4567-e89b-12d3-a456-426614174099");
      },
      createHandoffTask() {
        calls.push("createHandoffTask");
        return Promise.resolve();
      },
      enqueueFubSync() {
        calls.push("enqueueFubSync");
        return Promise.resolve();
      },
      enrollNurture() {
        calls.push("enrollNurture");
        return Promise.resolve();
      },
    };

    await expect(handleWorkflowJob(job!, services)).resolves.toMatchObject({
      status: "completed",
      message: expect.stringContaining("hot") as string,
    });
    expect(calls).toEqual([
      "getLeadWorkflowContext",
      "updateLeadWorkflowDecision",
      "assignLead",
      "createHandoffTask",
      "enqueueFubSync",
    ]);
  });
});
