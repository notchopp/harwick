import { describe, expect, it, vi } from "vitest";
import { createMetaMessagingClient } from "./meta-messaging.js";

function createResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(""),
  } as unknown as Response;
}

describe("createMetaMessagingClient", () => {
  it("sends direct messages through the page messages endpoint", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(createResponse({
      message_id: "mid.123",
    }));
    const client = createMetaMessagingClient({ fetchImpl });

    await expect(client.sendDirectMessage({
      pageId: "page-1",
      recipientUserId: "ig-user-1",
      accessToken: "page-token",
      reply: "Thanks for reaching out.",
    })).resolves.toEqual({
      providerEventId: "mid.123",
    });
    const firstCall = fetchImpl.mock.calls[0];
    const calledUrl = firstCall?.[0];
    const calledInit = firstCall?.[1];
    expect(calledUrl instanceof URL ? calledUrl.toString() : calledUrl).toBe(
      "https://graph.facebook.com/v20.0/page-1/messages?access_token=page-token",
    );
    expect(calledInit).toEqual({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_type: "RESPONSE",
        recipient: { id: "ig-user-1" },
        message: { text: "Thanks for reaching out." },
      }),
    });
  });

  it("replies to comments through the replies endpoint", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(createResponse({
      id: "comment-reply-1",
    }));
    const client = createMetaMessagingClient({ fetchImpl });

    await expect(client.replyToComment({
      commentId: "comment-1",
      accessToken: "page-token",
      reply: "Sending details now.",
    })).resolves.toEqual({
      providerEventId: "comment-reply-1",
    });
    const firstCall = fetchImpl.mock.calls[0];
    const calledUrl = firstCall?.[0];
    const calledInit = firstCall?.[1];
    expect(calledUrl instanceof URL ? calledUrl.toString() : calledUrl).toBe(
      "https://graph.facebook.com/v20.0/comment-1/replies?access_token=page-token",
    );
    expect(calledInit).toEqual({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "Sending details now.",
      }),
    });
  });
});
