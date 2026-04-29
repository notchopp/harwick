import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { handleFollowUpBossWebhookDelivery } from "./follow-up-boss-webhook";

const callbackToken = "callback-token";
const subscriptionId = "123e4567-e89b-12d3-a456-426614174010";
const workspaceId = "123e4567-e89b-12d3-a456-426614174011";
const systemKey = "1234567890abcdef";

function sign(rawBody: string) {
  return createHmac("sha256", systemKey)
    .update(Buffer.from(rawBody, "utf8").toString("base64"), "utf8")
    .digest("hex");
}

describe("handleFollowUpBossWebhookDelivery", () => {
  it("stores validated backsync events", async () => {
    const rawBody = JSON.stringify({
      eventId: "event-1",
      eventCreated: "2026-04-28T15:24:07+00:00",
      event: "peopleUpdated",
      resourceIds: [1234],
      uri: "https://api.followupboss.com/v1/people?id=1234",
    });
    const writeBacksyncEvent = vi.fn().mockResolvedValue({
      backsyncEventId: "123e4567-e89b-12d3-a456-426614174012",
      inserted: true,
    });

    await expect(handleFollowUpBossWebhookDelivery({
      callbackToken,
      rawBody,
      signature: sign(rawBody),
      resolveSubscription: () => Promise.resolve({
        subscriptionId,
        workspaceId,
        eventType: "peopleUpdated",
        systemKey,
      }),
      writeBacksyncEvent,
      credentialsReady: true,
    })).resolves.toEqual({
      status: 200,
      body: {
        accepted: true,
        persistedBacksyncEventCount: 1,
        duplicateEventCount: 0,
      },
    });

    expect(writeBacksyncEvent).toHaveBeenCalledWith({
      workspaceId,
      subscriptionId,
      notification: expect.objectContaining({
        event: "peopleUpdated",
      }) as Record<string, unknown>,
    });
  });

  it("rejects invalid signatures", async () => {
    await expect(handleFollowUpBossWebhookDelivery({
      callbackToken,
      rawBody: "{}",
      signature: "bad-signature",
      resolveSubscription: () => Promise.resolve({
        subscriptionId,
        workspaceId,
        eventType: "peopleUpdated",
        systemKey,
      }),
      writeBacksyncEvent: vi.fn(),
      credentialsReady: true,
    })).resolves.toEqual({
      status: 401,
      body: {
        accepted: false,
        persistedBacksyncEventCount: 0,
        duplicateEventCount: 0,
        reason: "invalid_signature",
      },
    });
  });

  it("accepts stale or unknown callback tokens without retry loops", async () => {
    await expect(handleFollowUpBossWebhookDelivery({
      callbackToken,
      rawBody: "{}",
      signature: null,
      resolveSubscription: () => Promise.resolve(null),
      writeBacksyncEvent: vi.fn(),
      credentialsReady: true,
    })).resolves.toEqual({
      status: 202,
      body: {
        accepted: true,
        persistedBacksyncEventCount: 0,
        duplicateEventCount: 0,
        reason: "unknown_subscription",
      },
    });
  });
});
