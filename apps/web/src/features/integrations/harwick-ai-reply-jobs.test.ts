import { describe, expect, it } from "vitest";
import { buildHarwickAiReplyJobInput } from "./harwick-ai-reply-jobs";

const review = {
  id: "123e4567-e89b-12d3-a456-426614174010",
  workspaceId: "123e4567-e89b-12d3-a456-426614174000",
  leadId: "123e4567-e89b-12d3-a456-426614174001",
  leadEventId: "123e4567-e89b-12d3-a456-426614174002",
  providerAccountId: "ig-business-1",
  recipientUserId: "ig-user-1",
  channel: "instagram_dm",
  sourcePostId: "post-1",
  sourceCommentId: null,
  inboundText: "Can I get details?",
  suggestedReply: null,
  status: "pending",
  automationMode: "ai_on",
  automationReason: null,
  aiDecision: null,
  providerEventId: null,
  createdAt: "2026-05-01T12:00:00.000Z",
  updatedAt: "2026-05-01T12:00:00.000Z",
} as const;

describe("buildHarwickAiReplyJobInput", () => {
  it("builds an execution job when a DM turn can auto-send", () => {
    expect(buildHarwickAiReplyJobInput({
      turnId: "123e4567-e89b-12d3-a456-426614174099",
      review,
      automationDecision: {
        canAutoExecute: true,
        approvedTools: ["send_meta_dm"],
        blockedTools: [],
        reason: "policy allows this turn to auto-send.",
      },
    })).toMatchObject({
      jobType: "harwick_ai_reply",
      idempotencyKey: "harwick_ai_reply:123e4567-e89b-12d3-a456-426614174099",
      payload: {
        jobType: "harwick_ai_reply",
        providerAccountId: "ig-business-1",
        recipientUserId: "ig-user-1",
      },
    });
  });

  it("returns null when the turn is not eligible for auto execution", () => {
    expect(buildHarwickAiReplyJobInput({
      turnId: "123e4567-e89b-12d3-a456-426614174099",
      review,
      automationDecision: {
        canAutoExecute: false,
        approvedTools: [],
        blockedTools: ["send_meta_dm"],
        reason: "tool send_meta_dm requires approval or is not allowed.",
      },
    })).toBeNull();
  });

  it("requires comment targets for public reply tools", () => {
    expect(buildHarwickAiReplyJobInput({
      turnId: "123e4567-e89b-12d3-a456-426614174099",
      review: {
        ...review,
        channel: "instagram_comment",
        recipientUserId: null,
        sourceCommentId: null,
      },
      automationDecision: {
        canAutoExecute: true,
        approvedTools: ["send_meta_reply"],
        blockedTools: [],
        reason: "policy allows this turn to auto-send.",
      },
    })).toBeNull();
  });
});
