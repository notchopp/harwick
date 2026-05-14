import { describe, expect, it, vi } from "vitest";
import { encryptCredential } from "../../lib/credentials";
import { sendMetaReply } from "./meta-reply-send";

const credentialSecret = "change-me-to-a-long-random-secret";

describe("sendMetaReply", () => {
  it("sends a direct message and records an outbound lead event", async () => {
    const insertLeadEventRows = vi.fn().mockResolvedValue(1);
    const response = await sendMetaReply({
      request: {
        workspaceId: "123e4567-e89b-12d3-a456-426614174000",
        leadId: "123e4567-e89b-12d3-a456-426614174001",
        providerAccountId: "ig-1",
        channel: "instagram_dm",
        recipientUserId: "ig-user-1",
        reply: "Thanks for reaching out.",
      },
      credentialSecret,
      credentialRepository: {
        findConnectedCredential: vi.fn().mockResolvedValue({
          workspaceId: "123e4567-e89b-12d3-a456-426614174000",
          providerAccountId: "ig-1",
          providerAccountIds: ["ig-1", "page-1"],
          encryptedCredentialRef: encryptCredential({
            userAccessToken: "user-token",
            pageAccessToken: "page-token",
            pageId: "page-1",
            instagramBusinessAccountId: "ig-1",
          }, credentialSecret),
        }),
      },
      leadEventRepository: {
        insertLeadEventRows,
      },
      metaClient: {
        sendDirectMessage: vi.fn().mockResolvedValue({ providerEventId: "mid.123" }),
        replyToComment: vi.fn(),
      },
      now: new Date("2026-04-28T23:10:00.000Z"),
    });

    expect(response).toEqual({
      status: 200,
      body: {
        status: "sent",
        providerEventId: "mid.123",
        occurredAt: "2026-04-28T23:10:00.000Z",
        channel: "instagram_dm",
      },
    });
    expect(insertLeadEventRows).toHaveBeenCalledWith([
      expect.objectContaining({
        event_type: "reply_sent",
        source_channel: "instagram_dm",
        provider_user_id: "ig-user-1",
        text: "Thanks for reaching out.",
      }),
    ]);
  });

  it("replies on the original comment thread for comment channels", async () => {
    const insertLeadEventRows = vi.fn().mockResolvedValue(1);
    const replyToComment = vi.fn().mockResolvedValue({ providerEventId: "comment.reply.123" });
    const sendDirectMessage = vi.fn();

    const response = await sendMetaReply({
      request: {
        workspaceId: "123e4567-e89b-12d3-a456-426614174000",
        leadId: "123e4567-e89b-12d3-a456-426614174001",
        providerAccountId: "ig-1",
        channel: "instagram_comment",
        recipientUserId: "ig-user-1",
        sourceCommentId: "comment-1",
        sourcePostId: "post-1",
        reply: "I can share more details here.",
      },
      credentialSecret,
      credentialRepository: {
        findConnectedCredential: vi.fn().mockResolvedValue({
          workspaceId: "123e4567-e89b-12d3-a456-426614174000",
          providerAccountId: "ig-1",
          providerAccountIds: ["ig-1", "page-1"],
          encryptedCredentialRef: encryptCredential({
            userAccessToken: "user-token",
            pageAccessToken: "page-token",
            pageId: "page-1",
            instagramBusinessAccountId: "ig-1",
          }, credentialSecret),
        }),
      },
      leadEventRepository: {
        insertLeadEventRows,
      },
      metaClient: {
        sendDirectMessage,
        replyToComment,
      },
      now: new Date("2026-04-28T23:11:00.000Z"),
    });

    expect(response).toEqual({
      status: 200,
      body: {
        status: "sent",
        providerEventId: "comment.reply.123",
        occurredAt: "2026-04-28T23:11:00.000Z",
        channel: "instagram_comment",
      },
    });
    expect(replyToComment).toHaveBeenCalledWith({
      commentId: "comment-1",
      accessToken: "page-token",
      reply: "I can share more details here.",
    });
    expect(sendDirectMessage).not.toHaveBeenCalled();
    expect(insertLeadEventRows).toHaveBeenCalledWith([
      expect.objectContaining({
        event_type: "reply_sent",
        source_channel: "instagram_comment",
        source_comment_id: "comment-1",
        source_post_id: "post-1",
        provider_user_id: "ig-user-1",
        text: "I can share more details here.",
      }),
    ]);
  });

  it("preserves the source comment linkage when a comment conversation moves into DM", async () => {
    const insertLeadEventRows = vi.fn().mockResolvedValue(1);
    const sendDirectMessage = vi.fn().mockResolvedValue({ providerEventId: "mid.comment.handoff" });

    const response = await sendMetaReply({
      request: {
        workspaceId: "123e4567-e89b-12d3-a456-426614174000",
        leadId: "123e4567-e89b-12d3-a456-426614174001",
        providerAccountId: "ig-1",
        channel: "instagram_dm",
        recipientUserId: "ig-user-1",
        sourceCommentId: "comment-1",
        sourcePostId: "post-1",
        reply: "I just sent you the details privately.",
      },
      credentialSecret,
      credentialRepository: {
        findConnectedCredential: vi.fn().mockResolvedValue({
          workspaceId: "123e4567-e89b-12d3-a456-426614174000",
          providerAccountId: "ig-1",
          providerAccountIds: ["ig-1", "page-1"],
          encryptedCredentialRef: encryptCredential({
            userAccessToken: "user-token",
            pageAccessToken: "page-token",
            pageId: "page-1",
            instagramBusinessAccountId: "ig-1",
          }, credentialSecret),
        }),
      },
      leadEventRepository: {
        insertLeadEventRows,
      },
      metaClient: {
        sendDirectMessage,
        replyToComment: vi.fn(),
      },
      now: new Date("2026-04-28T23:12:00.000Z"),
    });

    expect(response).toEqual({
      status: 200,
      body: {
        status: "sent",
        providerEventId: "mid.comment.handoff",
        occurredAt: "2026-04-28T23:12:00.000Z",
        channel: "instagram_dm",
      },
    });
    expect(insertLeadEventRows).toHaveBeenCalledWith([
      expect.objectContaining({
        source_channel: "instagram_dm",
        source_comment_id: "comment-1",
        source_post_id: "post-1",
        provider_user_id: "ig-user-1",
        text: "I just sent you the details privately.",
      }),
    ]);
  });

  it("returns not found when the workspace has no matching Meta integration", async () => {
    const response = await sendMetaReply({
      request: {
        workspaceId: "123e4567-e89b-12d3-a456-426614174000",
        leadId: null,
        providerAccountId: "ig-missing",
        channel: "instagram_comment",
        sourceCommentId: "comment-1",
        reply: "Sending details now.",
      },
      credentialSecret,
      credentialRepository: {
        findConnectedCredential: vi.fn().mockResolvedValue(null),
      },
      leadEventRepository: {
        insertLeadEventRows: vi.fn(),
      },
      metaClient: {
        sendDirectMessage: vi.fn(),
        replyToComment: vi.fn(),
      },
    });

    expect(response).toEqual({
      status: 404,
      body: { error: "integration_not_found" },
    });
  });

  it("does not send when conversation automation is paused", async () => {
    const findConnectedCredential = vi.fn();
    const response = await sendMetaReply({
      request: {
        workspaceId: "123e4567-e89b-12d3-a456-426614174000",
        leadId: "123e4567-e89b-12d3-a456-426614174001",
        providerAccountId: "ig-1",
        channel: "instagram_dm",
        recipientUserId: "ig-user-1",
        reply: "Thanks for reaching out.",
        automationMode: "human_takeover",
      },
      credentialSecret,
      credentialRepository: {
        findConnectedCredential,
      },
      leadEventRepository: {
        insertLeadEventRows: vi.fn(),
      },
      metaClient: {
        sendDirectMessage: vi.fn(),
        replyToComment: vi.fn(),
      },
    });

    expect(response).toEqual({
      status: 400,
      body: { error: "invalid_request" },
    });
    expect(findConnectedCredential).not.toHaveBeenCalled();
  });

  it("uses the server-scoped automation mode instead of trusting the request body", async () => {
    const findConnectedCredential = vi.fn();
    const response = await sendMetaReply({
      request: {
        workspaceId: "123e4567-e89b-12d3-a456-426614174000",
        leadId: "123e4567-e89b-12d3-a456-426614174001",
        providerAccountId: "ig-1",
        channel: "instagram_dm",
        recipientUserId: "ig-user-1",
        reply: "Thanks for reaching out.",
        automationMode: "ai_on",
      },
      automationMode: "human_takeover",
      credentialSecret,
      credentialRepository: {
        findConnectedCredential,
      },
      leadEventRepository: {
        insertLeadEventRows: vi.fn(),
      },
      metaClient: {
        sendDirectMessage: vi.fn(),
        replyToComment: vi.fn(),
      },
    });

    expect(response).toEqual({
      status: 400,
      body: { error: "invalid_request" },
    });
    expect(findConnectedCredential).not.toHaveBeenCalled();
  });
});
