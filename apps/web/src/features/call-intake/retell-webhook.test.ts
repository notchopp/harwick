import { sign } from "retell-sdk";
import { describe, expect, it } from "vitest";
import { handleRetellWebhookDelivery } from "./retell-webhook";

const retellApiKey = "test-retell-api-key";
const workspaceId = "123e4567-e89b-12d3-a456-426614174000";

async function signedBody(body: unknown) {
  const rawBody = typeof body === "string" ? body : JSON.stringify(body);
  return {
    rawBody,
    signature: await sign(rawBody, retellApiKey),
  };
}

describe("handleRetellWebhookDelivery", () => {
  it("verifies, normalizes, and writes matched Retell call events", async () => {
    const request = await signedBody({
      event: "call_analyzed",
      call: {
        call_id: "call_123",
        agent_id: "agent_123",
        from_number: "+14845551234",
        call_analysis: {
          call_summary: "Buyer wants a tour after work.",
        },
      },
    });

    const writtenTexts: string[] = [];
    const response = await handleRetellWebhookDelivery({
      ...request,
      retellApiKey,
      resolveWorkspaceIdByProviderAccountId: (providerAccountId) => {
        return Promise.resolve(providerAccountId === "agent_123" ? workspaceId : null);
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
    expect(response.body.leadUpsertCount).toBe(1);
    expect(writtenTexts).toEqual(["Buyer wants a tour after work."]);
  });

  it("rejects invalid signatures before side effects", async () => {
    const response = await handleRetellWebhookDelivery({
      rawBody: JSON.stringify({
        event: "call_analyzed",
        call: { call_id: "call_123", agent_id: "agent_123" },
      }),
      signature: "bad-signature",
      retellApiKey,
      resolveWorkspaceIdByProviderAccountId: () => {
        return Promise.reject(new Error("resolver should not be called"));
      },
      writeLeadEvents: () => {
        return Promise.reject(new Error("writer should not be called"));
      },
    });

    expect(response).toEqual({
      status: 401,
      body: {
        accepted: false,
        normalizedEventCount: 0,
        persistedEventCount: 0,
        duplicateEventCount: 0,
        leadUpsertCount: 0,
        unmatchedProviderAccountIds: [],
        reason: "invalid_signature",
      },
    });
  });

  it("accepts but does not persist unmatched Retell agents", async () => {
    const request = await signedBody({
      event: "call_analyzed",
      call: { call_id: "call_123", agent_id: "unknown_agent" },
    });

    const response = await handleRetellWebhookDelivery({
      ...request,
      retellApiKey,
      resolveWorkspaceIdByProviderAccountId: () => Promise.resolve(null),
      writeLeadEvents: () => {
        return Promise.reject(new Error("writer should not be called"));
      },
    });

    expect(response.status).toBe(202);
    expect(response.body.unmatchedProviderAccountIds).toEqual(["unknown_agent"]);
  });
});
