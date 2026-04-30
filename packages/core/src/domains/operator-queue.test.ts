import { describe, expect, it } from "vitest";
import {
  SocialReplyQueueActionRequestSchema,
  SocialReplyQueueItemSchema,
  VoiceHandoffQueueActionRequestSchema,
  isSocialReplyChannel,
} from "./operator-queue.js";

describe("operator queue contracts", () => {
  it("validates social reply queue items", () => {
    const item = SocialReplyQueueItemSchema.parse({
      id: "11111111-1111-4111-8111-111111111111",
      workspaceId: "22222222-2222-4222-8222-222222222222",
      leadId: null,
      leadEventId: "33333333-3333-4333-8333-333333333333",
      providerAccountId: "ig-1",
      recipientUserId: "user-1",
      channel: "instagram_dm",
      sourcePostId: null,
      sourceCommentId: null,
      inboundText: "Price?",
      suggestedReply: null,
      status: "pending",
      automationMode: "ai_on",
      automationReason: "safe to qualify",
      aiDecision: null,
      providerEventId: null,
      createdAt: "2026-04-29T12:00:00.000Z",
      updatedAt: "2026-04-29T12:00:00.000Z",
    });

    expect(item.channel).toBe("instagram_dm");
  });

  it("validates approve and send actions with replies", () => {
    expect(SocialReplyQueueActionRequestSchema.parse({
      action: "send",
      reply: "I can send details now.",
    })).toMatchObject({ action: "send" });
  });

  it("validates voice callback task action", () => {
    expect(VoiceHandoffQueueActionRequestSchema.parse({
      action: "create_callback_task",
      priority: "urgent",
    })).toMatchObject({ action: "create_callback_task" });
  });

  it("narrows social reply channels", () => {
    expect(isSocialReplyChannel("facebook_comment")).toBe(true);
    expect(isSocialReplyChannel("call")).toBe(false);
  });
});
