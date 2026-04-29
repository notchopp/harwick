import { sign } from "retell-sdk";
import { describe, expect, it } from "vitest";
import {
  normalizeRetellWebhookPayload,
  sanitizeRetellWebhookPayloadForStorage,
  type RetellWebhookPayload,
  verifyRetellWebhookSignature,
} from "./retell.js";

const workspaceId = "123e4567-e89b-12d3-a456-426614174000";

describe("normalizeRetellWebhookPayload", () => {
  it("normalizes analyzed calls into internal lead events", () => {
    const events = normalizeRetellWebhookPayload({
      workspaceId,
      payload: {
        event: "call_analyzed",
        call: {
          call_id: "call_123",
          agent_id: "agent_123",
          direction: "inbound",
          from_number: "(484) 555-1234",
          to_number: "+12155550123",
          end_timestamp: 1777046400000,
          call_analysis: {
            call_summary: " Caller wants a new build tour this weekend. ",
          },
        },
      },
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      workspaceId,
      provider: "retell",
      eventType: "call_completed",
      sourceChannel: "call",
      providerEventId: "call_123:call_analyzed",
      providerAccountId: "agent_123",
      providerUserId: "+14845551234",
      phone: "+14845551234",
      text: "Caller wants a new build tour this weekend.",
    });
  });

  it("does not persist transcript text when summary is absent", () => {
    const events = normalizeRetellWebhookPayload({
      workspaceId,
      payload: {
        event: "call_ended",
        call: {
          call_id: "call_456",
          agent_id: "agent_456",
          transcript_object: [
            { role: "agent", content: "How can I help?" },
            { role: "user", content: "I want to sell my house." },
          ],
        },
      },
    });

    expect(events[0]?.text).toBeNull();
    expect(JSON.stringify(events[0]?.rawPayload)).not.toContain("I want to sell my house.");
  });

  it("sanitizes post-call analysis and strips raw transcripts from storage payloads", () => {
    const payload = {
      event: "call_analyzed",
      call: {
        call_id: "call_999",
        agent_id: "agent_999",
        from_number: "(713) 555-0123",
        transcript: "Full sensitive transcript should not persist.",
        transcript_object: [
          { role: "agent", content: "Sensitive transcript object should not persist." },
        ],
        metadata: {
          token: "secret-token",
        },
        call_analysis: {
          call_summary: "  Caller wants a pool home in Katy.  ",
          custom_analysis_data: {
            lead_summary: " Buyer is ready this month. ",
            lead_type: "buyer",
            intent: "high",
            financing_status: "preapproved",
            target_area: " Katy ",
            call_outcome: "handoff_requested",
            unknown_field: "should be ignored",
          },
        },
      },
    } satisfies RetellWebhookPayload;

    const events = normalizeRetellWebhookPayload({
      workspaceId,
      payload,
    });
    const storagePayload = sanitizeRetellWebhookPayloadForStorage(payload);

    expect(events[0]?.text).toBe("Caller wants a pool home in Katy.");
    expect(events[0]?.rawPayload).toMatchObject({
      call: {
        from_number: "+17135550123",
        call_analysis: {
          callSummary: "Caller wants a pool home in Katy.",
          leadSummary: "Buyer is ready this month.",
          leadType: "buyer",
          intent: "high",
          financingStatus: "preapproved",
          targetArea: "Katy",
        },
      },
      extractedLead: {
        leadType: "buyer",
        intent: "high",
      },
    });
    expect(JSON.stringify(storagePayload)).not.toContain("transcript");
    expect(JSON.stringify(storagePayload)).not.toContain("secret-token");
  });

  it("does not create lead events for call_started", () => {
    const events = normalizeRetellWebhookPayload({
      workspaceId,
      payload: {
        event: "call_started",
        call: {
          call_id: "call_789",
          agent_id: "agent_789",
        },
      },
    });

    expect(events).toEqual([]);
  });
});

describe("verifyRetellWebhookSignature", () => {
  it("verifies Retell signatures against the raw body", async () => {
    const rawBody = JSON.stringify({ event: "call_ended", call: { call_id: "call_123" } });
    const apiKey = "test-retell-api-key";
    const signature = await sign(rawBody, apiKey);

    await expect(verifyRetellWebhookSignature({
      rawBody,
      signature,
      apiKey,
    })).resolves.toBe(true);
  });

  it("rejects missing signatures", async () => {
    await expect(verifyRetellWebhookSignature({
      rawBody: "{}",
      signature: null,
      apiKey: "test-retell-api-key",
    })).resolves.toBe(false);
  });
});
