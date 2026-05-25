import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

// The retell webhook route applies an IP-keyed rate limit (60/min) BEFORE
// invoking the inner signature-verifying handler. These tests exercise the
// 429 guard without reaching into Supabase/Retell.

vi.mock("../webhook", () => ({
  postRetellWebhook: vi.fn().mockResolvedValue({
    status: 200,
    body: { result: "ok" },
  }),
}));

import { postRetellWebhook } from "../webhook";

function buildRequest(ip: string): NextRequest {
  return new NextRequest("https://app.example/api/retell/webhook", {
    method: "POST",
    headers: {
      "x-forwarded-for": ip,
      "content-type": "application/json",
      "x-retell-signature": "stub",
    },
    body: JSON.stringify({ event: "noop" }),
  });
}

describe("POST /api/retell/webhook rate limiting", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("allows requests under the 60/min ceiling", async () => {
    const response = await POST(buildRequest("198.51.100.10"));
    expect(response.status).toBe(200);
    expect(postRetellWebhook).toHaveBeenCalledTimes(1);
  });

  it("returns 429 with Retry-After once the per-IP ceiling is exceeded", async () => {
    const ip = "198.51.100.20";
    // Burn through the 60-per-minute budget.
    for (let i = 0; i < 60; i += 1) {
      const ok = await POST(buildRequest(ip));
      expect(ok.status).toBe(200);
    }

    const blocked = await POST(buildRequest(ip));
    expect(blocked.status).toBe(429);
    const retryAfter = blocked.headers.get("Retry-After");
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThan(0);

    const payload = (await blocked.json()) as { accepted?: boolean; reason?: string };
    expect(payload.reason).toBe("rate_limited");
  });

  it("scopes the rate-limit bucket per source IP", async () => {
    // Different IP should not be affected even after another IP exhausted its quota.
    const fresh = await POST(buildRequest("198.51.100.30"));
    expect(fresh.status).toBe(200);
  });
});
