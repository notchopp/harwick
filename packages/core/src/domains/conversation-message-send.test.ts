import { describe, expect, it } from "vitest";
import {
  ConversationMessageSendRequestSchema,
  ConversationMessageSendResponseSchema,
} from "./conversation-message-send.js";

describe("ConversationMessageSendRequestSchema", () => {
  it("accepts valid request", () => {
    const result = ConversationMessageSendRequestSchema.safeParse({
      conversationId: "123e4567-e89b-12d3-a456-426614174000",
      workspaceId: "223e4567-e89b-12d3-a456-426614174000",
      reply: "Thanks for reaching out!",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty reply", () => {
    const result = ConversationMessageSendRequestSchema.safeParse({
      conversationId: "123e4567-e89b-12d3-a456-426614174000",
      workspaceId: "223e4567-e89b-12d3-a456-426614174000",
      reply: "   ",
    });
    expect(result.success).toBe(false);
  });

  it("rejects reply over 1000 characters", () => {
    const result = ConversationMessageSendRequestSchema.safeParse({
      conversationId: "123e4567-e89b-12d3-a456-426614174000",
      workspaceId: "223e4567-e89b-12d3-a456-426614174000",
      reply: "x".repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid conversation id", () => {
    const result = ConversationMessageSendRequestSchema.safeParse({
      conversationId: "not-a-uuid",
      workspaceId: "223e4567-e89b-12d3-a456-426614174000",
      reply: "Hello",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing workspace id", () => {
    const result = ConversationMessageSendRequestSchema.safeParse({
      conversationId: "123e4567-e89b-12d3-a456-426614174000",
      reply: "Hello",
    });
    expect(result.success).toBe(false);
  });
});

describe("ConversationMessageSendResponseSchema", () => {
  it("accepts valid response", () => {
    const result = ConversationMessageSendResponseSchema.safeParse({
      status: "sent",
      providerEventId: "provider_event_123",
      occurredAt: "2026-01-15T12:00:00Z",
      channel: "instagram_dm",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status", () => {
    const result = ConversationMessageSendResponseSchema.safeParse({
      status: "pending",
      providerEventId: "provider_event_123",
      occurredAt: "2026-01-15T12:00:00Z",
      channel: "instagram_dm",
    });
    expect(result.success).toBe(false);
  });
});
