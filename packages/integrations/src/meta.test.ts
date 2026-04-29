import { describe, expect, it } from "vitest";
import {
  buildMetaSocialPostContext,
  extractMetaProviderAccountIds,
  normalizeMetaSocialPostContexts,
  normalizeMetaWebhookPayload,
  verifyMetaWebhookChallenge,
} from "./meta.js";

const workspaceId = "123e4567-e89b-12d3-a456-426614174000";

describe("normalizeMetaWebhookPayload", () => {
  it("normalizes Instagram DM events", () => {
    const events = normalizeMetaWebhookPayload({
      workspaceId,
      payload: {
        object: "instagram",
        entry: [
          {
            id: "17841400000000000",
            messaging: [
              {
                sender: { id: "ig-user-1" },
                recipient: { id: "ig-business-1" },
                timestamp: 1713900000000,
                message: { mid: "message-1", text: "  I need a home in Houston  " },
              },
            ],
          },
        ],
      },
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.sourceChannel).toBe("instagram_dm");
    expect(events[0]?.text).toBe("I need a home in Houston");
    expect(events[0]?.providerUserId).toBe("ig-user-1");
  });

  it("normalizes Instagram comment events", () => {
    const events = normalizeMetaWebhookPayload({
      workspaceId,
      payload: {
        object: "instagram",
        entry: [
          {
            id: "17841400000000000",
            time: 1713900000,
            changes: [
              {
                field: "comments",
                value: {
                  comment_id: "comment-1",
                  media_id: "media-1",
                  text: " Price? ",
                  from: { id: "ig-user-2", username: "@BuyerDemo" },
                },
              },
            ],
          },
        ],
      },
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.sourceChannel).toBe("instagram_comment");
    expect(events[0]?.sourceCommentId).toBe("comment-1");
    expect(events[0]?.instagramUsername).toBe("buyerdemo");
  });

  it("normalizes Facebook page comment events", () => {
    const events = normalizeMetaWebhookPayload({
      workspaceId,
      payload: {
        object: "page",
        entry: [
          {
            id: "fb-page-1",
            time: 1713900000,
            changes: [
              {
                field: "feed",
                value: {
                  item: "comment",
                  comment_id: "fb-comment-1",
                  post_id: "fb-post-1",
                  message: "Can you send the price?",
                  from: { id: "fb-user-1", name: "Buyer Demo" },
                },
              },
            ],
          },
        ],
      },
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.sourceChannel).toBe("facebook_comment");
    expect(events[0]?.sourcePostId).toBe("fb-post-1");
    expect(events[0]?.text).toBe("Can you send the price?");
    expect(events[0]?.instagramUsername).toBeNull();
  });

  it("filters events by provider account ID", () => {
    const events = normalizeMetaWebhookPayload({
      workspaceId,
      providerAccountIds: ["ig-business-allowed"],
      payload: {
        object: "instagram",
        entry: [
          {
            id: "ig-business-comment",
            messaging: [
              {
                sender: { id: "ig-user-1" },
                recipient: { id: "ig-business-denied" },
                timestamp: 1713900000000,
                message: { mid: "message-denied", text: "Denied" },
              },
              {
                sender: { id: "ig-user-2" },
                recipient: { id: "ig-business-allowed" },
                timestamp: 1713900000000,
                message: { mid: "message-allowed", text: "Allowed" },
              },
            ],
          },
        ],
      },
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.providerEventId).toBe("message-allowed");
  });
});

describe("normalizeMetaSocialPostContexts", () => {
  it("extracts post context hints from Meta comment payloads", () => {
    const contexts = normalizeMetaSocialPostContexts({
      workspaceId,
      payload: {
        object: "instagram",
        entry: [
          {
            id: "ig-business-1",
            changes: [
              {
                field: "comments",
                value: {
                  comment_id: "comment-1",
                  media_id: "media-1",
                  text: "Send blueprint",
                  caption: "Houston new construction. 5 bed, 3 bath, 3 car garage. $339,990. Buyer Blueprint link in bio.",
                },
              },
            ],
          },
        ],
      },
    });

    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.sourcePostId).toBe("media-1");
    expect(contexts[0]?.ctaLabel).toBe("buyer blueprint");
    expect(contexts[0]?.areasMentioned).toContain("Houston");
    expect(contexts[0]?.listingHints).toContain("$339,990");
  });
});

describe("buildMetaSocialPostContext", () => {
  it("derives context hints from fetched post fields", () => {
    const context = buildMetaSocialPostContext({
      workspaceId,
      providerAccountId: "ig-business-1",
      sourcePostId: "media-1",
      sourceChannel: "instagram_comment",
      caption: "Houston open house with pool and Buyer Blueprint",
      text: null,
      permalink: "https://instagram.example/p/abc",
      mediaType: "IMAGE",
      rawPayload: { id: "media-1" },
    });

    expect(context.ctaLabel).toBe("buyer blueprint");
    expect(context.areasMentioned).toContain("Houston");
    expect(context.listingHints).toContain("pool");
  });
});

describe("verifyMetaWebhookChallenge", () => {
  it("returns the challenge for a valid verify token", () => {
    const result = verifyMetaWebhookChallenge({
      expectedVerifyToken: "expected-token",
      query: {
        "hub.mode": "subscribe",
        "hub.verify_token": "expected-token",
        "hub.challenge": "challenge-value",
      },
    });

    expect(result).toEqual({
      ok: true,
      challenge: "challenge-value",
    });
  });

  it("rejects invalid verify tokens", () => {
    const result = verifyMetaWebhookChallenge({
      expectedVerifyToken: "expected-token",
      query: {
        "hub.mode": "subscribe",
        "hub.verify_token": "wrong-token",
        "hub.challenge": "challenge-value",
      },
    });

    expect(result).toEqual({
      ok: false,
      status: 403,
      reason: "invalid_verify_token",
    });
  });

  it("rejects malformed challenge queries", () => {
    const result = verifyMetaWebhookChallenge({
      expectedVerifyToken: "expected-token",
      query: {
        "hub.mode": "not-subscribe",
      },
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      reason: "malformed_query",
    });
  });
});

describe("extractMetaProviderAccountIds", () => {
  it("extracts entry and recipient account IDs", () => {
    const accountIds = extractMetaProviderAccountIds({
      object: "instagram",
      entry: [
        {
          id: "entry-account",
          messaging: [
            {
              sender: { id: "ig-user-1" },
              recipient: { id: "recipient-account" },
              timestamp: 1713900000000,
              message: { mid: "message-1", text: "Hello" },
            },
          ],
        },
      ],
    });

    expect(accountIds).toEqual(["entry-account", "recipient-account"]);
  });
});
