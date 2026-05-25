import { describe, expect, it, vi } from "vitest";

import {
  buildInvitationEmailPayload,
  sendInvitationEmail,
} from "./send-invitation-email";

describe("buildInvitationEmailPayload", () => {
  it("renders the brand-voice subject and text", () => {
    const payload = buildInvitationEmailPayload({
      to: "tenant@example.com",
      workspaceName: "Prestige Realty",
      inviterDisplayName: "Alex",
      inviteUrl: "https://harwick.lol/invite/abc123",
    });

    expect(payload.subject).toBe("Prestige Realty invited you to Harwick");
    expect(payload.text).toContain("hey — Alex just added you to Prestige Realty on harwick.");
    expect(payload.text).toContain("https://harwick.lol/invite/abc123");
    expect(payload.text).toContain("takes about 90 seconds.");
    expect(payload.from).toBe("Harwick <invites@harwick.lol>");
    expect(payload.to).toBe("tenant@example.com");
  });

  it("falls back to a generic inviter label when display name is missing", () => {
    const payload = buildInvitationEmailPayload({
      to: "new@example.com",
      workspaceName: "Workspace",
      inviterDisplayName: null,
      inviteUrl: "https://harwick.lol/invite/token",
    });
    expect(payload.text).toContain("someone on the team just added you");
  });

  it("escapes HTML so workspace names with special characters don't break the markup", () => {
    const payload = buildInvitationEmailPayload({
      to: "x@example.com",
      workspaceName: "<script>alert('boom')</script>",
      inviterDisplayName: "Quote\"er",
      inviteUrl: "https://harwick.lol/invite/safe",
    });
    expect(payload.html).not.toContain("<script>");
    expect(payload.html).toContain("&lt;script&gt;");
    expect(payload.html).toContain("Quote&quot;er");
  });

  it("supports overriding the from address", () => {
    const payload = buildInvitationEmailPayload({
      to: "to@example.com",
      workspaceName: "W",
      inviterDisplayName: "A",
      inviteUrl: "https://harwick.lol/invite/t",
      fromAddress: "Test <test@harwick.lol>",
    });
    expect(payload.from).toBe("Test <test@harwick.lol>");
  });
});

describe("sendInvitationEmail", () => {
  it("returns skipped (and does not call fetch) when the API key is missing", async () => {
    const fetchImpl = vi.fn();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const result = await sendInvitationEmail({
        to: "x@example.com",
        workspaceName: "W",
        inviterDisplayName: "A",
        inviteUrl: "https://harwick.lol/invite/abc",
        apiKey: undefined,
        fetchImpl,
      });
      expect(result).toEqual({ status: "skipped", reason: "no_api_key" });
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("POSTs the brand-voice payload to Resend and returns the provider id", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(""),
      json: () => Promise.resolve({ id: "msg_abc123" }),
    });

    const result = await sendInvitationEmail({
      to: "tenant@example.com",
      workspaceName: "Prestige Realty",
      inviterDisplayName: "Alex",
      inviteUrl: "https://harwick.lol/invite/abc",
      apiKey: "re_test_key",
      fetchImpl,
    });

    expect(result).toEqual({ status: "sent", providerMessageId: "msg_abc123" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>)["authorization"]).toBe("Bearer re_test_key");
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");

    expect(typeof init.body).toBe("string");
    if (typeof init.body !== "string") {
      throw new Error("Expected JSON request body");
    }

    const body = JSON.parse(init.body) as {
      from: string;
      to: string;
      subject: string;
      text: string;
      html: string;
    };
    expect(body.from).toBe("Harwick <invites@harwick.lol>");
    expect(body.to).toBe("tenant@example.com");
    expect(body.subject).toBe("Prestige Realty invited you to Harwick");
    expect(body.text).toContain("hey — Alex just added you");
    expect(body.html).toContain("https://harwick.lol/invite/abc");
  });

  it("returns a failed result (not throw) when Resend responds non-2xx", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: () => Promise.resolve("invalid_from_address"),
    });

    const result = await sendInvitationEmail({
      to: "tenant@example.com",
      workspaceName: "W",
      inviterDisplayName: "A",
      inviteUrl: "https://harwick.lol/invite/abc",
      apiKey: "re_test_key",
      fetchImpl,
    });

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.statusCode).toBe(422);
      expect(result.message).toContain("422");
    }
  });

  it("catches network errors and returns failed instead of throwing", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const result = await sendInvitationEmail({
      to: "tenant@example.com",
      workspaceName: "W",
      inviterDisplayName: "A",
      inviteUrl: "https://harwick.lol/invite/abc",
      apiKey: "re_test_key",
      fetchImpl,
    });
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.statusCode).toBeNull();
      expect(result.message).toContain("network down");
    }
  });
});
