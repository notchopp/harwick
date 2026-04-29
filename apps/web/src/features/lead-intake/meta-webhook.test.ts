import { describe, expect, it } from "vitest";
import {
  handleMetaWebhookDelivery,
  handleMetaWebhookVerification,
} from "./meta-webhook";

describe("handleMetaWebhookVerification", () => {
  it("returns the Meta challenge body for valid setup requests", () => {
    const response = handleMetaWebhookVerification({
      expectedVerifyToken: "expected-token",
      query: {
        "hub.mode": "subscribe",
        "hub.verify_token": "expected-token",
        "hub.challenge": "challenge-value",
      },
    });

    expect(response).toEqual({
      status: 200,
      body: "challenge-value",
    });
  });

  it("returns a forbidden response for invalid tokens", () => {
    const response = handleMetaWebhookVerification({
      expectedVerifyToken: "expected-token",
      query: {
        "hub.mode": "subscribe",
        "hub.verify_token": "wrong-token",
        "hub.challenge": "challenge-value",
      },
    });

    expect(response).toEqual({
      status: 403,
      body: "invalid_verify_token",
    });
  });
});

describe("handleMetaWebhookDelivery", () => {
  it("normalizes and writes events for matched provider accounts", async () => {
    const writtenTexts: string[] = [];

    const response = await handleMetaWebhookDelivery({
      payload: {
        object: "instagram",
        entry: [
          {
            id: "ig-business-1",
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
      resolveWorkspaceIdByProviderAccountId: (providerAccountId) => {
        return Promise.resolve(providerAccountId === "ig-business-1"
          ? "123e4567-e89b-12d3-a456-426614174000"
          : null);
      },
      writeLeadEvents: (events) => {
        writtenTexts.push(...events.map((event) => event.text ?? ""));
        return Promise.resolve({
          persistedCount: events.length,
          duplicateCount: 0,
          leadUpsertCount: events.length,
        });
      },
    });

    expect(response.status).toBe(200);
    expect(response.body.normalizedEventCount).toBe(1);
    expect(response.body.persistedEventCount).toBe(1);
    expect(writtenTexts).toEqual(["Price?"]);
  });

  it("accepts but does not persist unmatched provider accounts", async () => {
    const response = await handleMetaWebhookDelivery({
      payload: {
        object: "instagram",
        entry: [
          {
            id: "unknown-account",
            time: 1713900000,
            changes: [
              {
                field: "comments",
                value: {
                  comment_id: "comment-1",
                  media_id: "media-1",
                  text: "Price?",
                },
              },
            ],
          },
        ],
      },
      resolveWorkspaceIdByProviderAccountId: () => Promise.resolve(null),
      writeLeadEvents: () => {
        return Promise.reject(
          new Error("writeLeadEvents should not be called for unmatched accounts."),
        );
      },
    });

    expect(response).toEqual({
      status: 202,
      body: {
        accepted: true,
        normalizedEventCount: 0,
        persistedEventCount: 0,
        duplicateEventCount: 0,
        leadUpsertCount: 0,
        unmatchedProviderAccountIds: ["unknown-account"],
      },
    });
  });

  it("hydrates post contexts before writing them", async () => {
    const writtenCaptions: Array<string | null> = [];

    const response = await handleMetaWebhookDelivery({
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
                  text: "price?",
                },
              },
            ],
          },
        ],
      },
      resolveWorkspaceIdByProviderAccountId: (providerAccountId) => {
        return Promise.resolve(providerAccountId === "ig-business-1"
          ? "123e4567-e89b-12d3-a456-426614174000"
          : null);
      },
      hydrateSocialPostContexts: (contexts) => Promise.resolve(
        contexts.map((context) => ({
          ...context,
          caption: "Hydrated caption",
        })),
      ),
      writeSocialPostContexts: (contexts) => {
        writtenCaptions.push(...contexts.map((context) => context.caption));
        return Promise.resolve(contexts.length);
      },
      writeLeadEvents: (events) => {
        return Promise.resolve({
          persistedCount: events.length,
          duplicateCount: 0,
          leadUpsertCount: events.length,
        });
      },
    });

    expect(response.status).toBe(200);
    expect(writtenCaptions).toEqual(["Hydrated caption"]);
  });

  it("rejects malformed payloads before side effects", async () => {
    const response = await handleMetaWebhookDelivery({
      payload: {
        object: "instagram",
        entry: [],
      },
      resolveWorkspaceIdByProviderAccountId: () => {
        return Promise.reject(new Error("resolver should not be called for malformed payloads."));
      },
      writeLeadEvents: () => {
        return Promise.reject(new Error("writer should not be called for malformed payloads."));
      },
    });

    expect(response).toEqual({
      status: 400,
      body: {
        accepted: false,
        normalizedEventCount: 0,
        persistedEventCount: 0,
        duplicateEventCount: 0,
        leadUpsertCount: 0,
        unmatchedProviderAccountIds: [],
        reason: "malformed_payload",
      },
    });
  });
});
