import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createFollowUpBossClient,
  verifyFollowUpBossWebhookSignature,
} from "./follow-up-boss.js";

function createResponse(params: {
  ok?: boolean;
  status?: number;
  body?: unknown;
  text?: string;
}) {
  return {
    ok: params.ok ?? true,
    status: params.status ?? 200,
    json: vi.fn().mockResolvedValue(params.body ?? {}),
    text: vi.fn().mockResolvedValue(params.text ?? ""),
  } as unknown as Response;
}

describe("createFollowUpBossClient", () => {
  it("sends qualified leads through the events endpoint", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(createResponse({ body: { id: 123 } }));
    const client = createFollowUpBossClient({
      apiKey: "fub-key",
      fetchImpl,
    });

    await expect(client.sendLeadEvent({
      source: "Realty Ops",
      type: "Property Inquiry",
      message: "Buyer wants a showing in Cypress.",
      person: {
        name: "Maya Lead",
        phones: [{ value: "+17135550123" }],
      },
    })).resolves.toBe("123");

    expect(fetchImpl).toHaveBeenCalledWith("https://api.followupboss.com/v1/events", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining("\"type\":\"Property Inquiry\"") as string,
    }));
  });

  it("throws on failed provider responses", async () => {
    const client = createFollowUpBossClient({
      apiKey: "fub-key",
      fetchImpl: vi.fn().mockResolvedValue(createResponse({
        ok: false,
        status: 401,
        text: "unauthorized",
      })),
    });

    await expect(client.sendLeadEvent({
      source: "Realty Ops",
      type: "General Inquiry",
      message: "Lead wants help.",
      person: { name: "Lead" },
    })).rejects.toThrow("Follow Up Boss event sync failed");
  });

  it("registers webhook subscriptions with system headers", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(createResponse({
      body: {
        id: 77,
        status: "Active",
        event: "peopleUpdated",
        url: "https://example.com/api/follow-up-boss/webhook/token",
      },
    }));
    const client = createFollowUpBossClient({
      apiKey: "fub-key",
      fetchImpl,
    });

    await expect(client.createWebhookSubscription({
      event: "peopleUpdated",
      url: "https://example.com/api/follow-up-boss/webhook/token",
      system: "RealtyOps:workspace",
      systemKey: "1234567890abcdef",
    })).resolves.toEqual({
      id: "77",
      status: "Active",
      event: "peopleUpdated",
      url: "https://example.com/api/follow-up-boss/webhook/token",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.followupboss.com/v1/webhooks",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-System": "RealtyOps:workspace",
          "X-System-Key": "1234567890abcdef",
        }) as Record<string, string>,
      }),
    );
  });

  it("fetches webhook resource URIs through the API client", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(createResponse({
      body: {
        people: [{ id: 123 }],
      },
    }));
    const client = createFollowUpBossClient({
      apiKey: "fub-key",
      fetchImpl,
    });

    await expect(client.fetchResource("/people?id=123")).resolves.toEqual({
      people: [{ id: 123 }],
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.followupboss.com/v1/people?id=123",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });
});

describe("verifyFollowUpBossWebhookSignature", () => {
  it("accepts valid signatures", () => {
    const rawBody = JSON.stringify({
      eventId: "event-1",
      eventCreated: "2026-04-28T15:24:07+00:00",
      event: "peopleUpdated",
      resourceIds: [1234],
      uri: "https://api.followupboss.com/v1/people?id=1234",
    });
    const systemKey = "1234567890abcdef";
    const signature = createHmac("sha256", systemKey)
      .update(Buffer.from(rawBody, "utf8").toString("base64"), "utf8")
      .digest("hex");

    expect(verifyFollowUpBossWebhookSignature({
      rawBody,
      signature,
      systemKey,
    })).toBe(true);
  });

  it("rejects invalid signatures", () => {
    expect(verifyFollowUpBossWebhookSignature({
      rawBody: "{}",
      signature: "invalid",
      systemKey: "1234567890abcdef",
    })).toBe(false);
  });
});
