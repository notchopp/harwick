import { describe, expect, it } from "vitest";
import {
  EnqueueWorkflowJobInputSchema,
  WorkflowJobPayloadSchema,
} from "./workflow-job.js";

const workspaceId = "123e4567-e89b-12d3-a456-426614174000";
const leadId = "123e4567-e89b-12d3-a456-426614174001";
const listingId = "123e4567-e89b-12d3-a456-426614174002";
const enrollmentId = "123e4567-e89b-12d3-a456-426614174003";

describe("WorkflowJobPayloadSchema", () => {
  it("accepts known real estate worker payloads", () => {
    expect(WorkflowJobPayloadSchema.parse({
      jobType: "lead_qualification",
      workspaceId,
      leadId,
      reason: "post_call_analysis",
    })).toMatchObject({
      jobType: "lead_qualification",
      reason: "post_call_analysis",
    });
    expect(WorkflowJobPayloadSchema.parse({
      jobType: "lead_qualification",
      workspaceId,
      leadId,
      reason: "crm_backsync_activity",
    })).toMatchObject({
      jobType: "lead_qualification",
      reason: "crm_backsync_activity",
    });
    expect(WorkflowJobPayloadSchema.parse({
      jobType: "listing_recheck",
      workspaceId,
      listingId,
      reason: "scheduled_recheck",
    })).toMatchObject({
      jobType: "listing_recheck",
      listingId,
    });
    expect(WorkflowJobPayloadSchema.parse({
      jobType: "nurture_delivery",
      workspaceId,
      leadId,
      enrollmentId,
      reason: "scheduled_followup",
    })).toMatchObject({
      jobType: "nurture_delivery",
      enrollmentId,
    });
  });

  it("requires FUB jobs to be explicitly qualified-only", () => {
    expect(() => WorkflowJobPayloadSchema.parse({
      jobType: "fub_sync",
      workspaceId,
      leadId,
      qualifiedOnly: false,
    })).toThrow();
  });
});

describe("EnqueueWorkflowJobInputSchema", () => {
  it("keeps job identity explicit at enqueue boundaries", () => {
    expect(EnqueueWorkflowJobInputSchema.parse({
      workspaceId,
      leadId,
      jobType: "fub_sync",
      idempotencyKey: `fub_sync:${leadId}`,
      payload: {
        jobType: "fub_sync",
        workspaceId,
        leadId,
        qualifiedOnly: true,
      },
    })).toMatchObject({
      workspaceId,
      leadId,
      leadEventId: null,
      jobType: "fub_sync",
      idempotencyKey: `fub_sync:${leadId}`,
    });
  });
});
