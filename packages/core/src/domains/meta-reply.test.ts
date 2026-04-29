import { describe, expect, it } from "vitest";
import { SendMetaReplyRequestSchema } from "./meta-reply.js";

describe("SendMetaReplyRequestSchema", () => {
  it("requires recipientUserId for Meta direct messages", () => {
    expect(() => SendMetaReplyRequestSchema.parse({
      workspaceId: "123e4567-e89b-12d3-a456-426614174000",
      leadId: null,
      providerAccountId: "ig-1",
      channel: "instagram_dm",
      sourceCommentId: null,
      sourcePostId: null,
      reply: "Thanks for reaching out.",
    })).toThrow("Direct message replies require recipientUserId.");
  });

  it("requires sourceCommentId for Meta comment replies", () => {
    expect(() => SendMetaReplyRequestSchema.parse({
      workspaceId: "123e4567-e89b-12d3-a456-426614174000",
      leadId: null,
      providerAccountId: "ig-1",
      channel: "instagram_comment",
      recipientUserId: null,
      sourcePostId: "post-1",
      reply: "Sending details now.",
    })).toThrow("Comment replies require sourceCommentId.");
  });
});
