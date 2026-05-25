import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// PNG generation is expensive — these tests confirm the 60/min per-IP rate
// limit fires before we hit any Supabase or ImageResponse code path. We mock
// the auth + repository layer to keep the success path inert.

vi.mock("../../../../../../../lib/api/workspace-auth", () => ({
  authorizeWorkspaceRequest: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../../../../../../lib/supabase/listings", () => ({
  createSupabaseListingFactsRepository: vi.fn(),
}));

vi.mock("../../../../../../../lib/supabase/server-client", () => ({
  createServerSupabaseClient: vi.fn(),
}));

// next/og pulls heavy native code; route only reaches it on the success path.
vi.mock("next/og", () => ({
  ImageResponse: class {
    constructor(_node: unknown, init?: { headers?: Record<string, string> }) {
      return new Response("stub", {
        status: 200,
        ...(init?.headers === undefined ? {} : { headers: init.headers }),
      });
    }
  },
}));

import { GET } from "./route";

function buildRequest(ip: string): NextRequest {
  return new NextRequest("https://app.example/api/workspaces/wid/listings/lid/share-card", {
    method: "GET",
    headers: {
      "x-forwarded-for": ip,
    },
  });
}

const params = Promise.resolve({
  workspaceId: "00000000-0000-0000-0000-000000000000",
  listingId: "00000000-0000-0000-0000-000000000000",
});

describe("GET share-card rate limiting", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 429 with Retry-After after exhausting the 60/min budget", async () => {
    const ip = "203.0.113.10";
    for (let i = 0; i < 60; i += 1) {
      const response = await GET(buildRequest(ip), { params });
      // First 60 requests must not be rate-limited; status varies because the
      // mocked workspace-auth returns null (403) — that's expected and proves
      // we passed the rate-limit gate.
      expect(response.status).not.toBe(429);
    }

    const blocked = await GET(buildRequest(ip), { params });
    expect(blocked.status).toBe(429);
    const retryAfter = blocked.headers.get("Retry-After");
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThan(0);

    const payload = (await blocked.json()) as { error?: string };
    expect(payload.error).toBe("rate_limited");
  });

  it("does not affect a different source IP", async () => {
    const fresh = await GET(buildRequest("203.0.113.20"), { params });
    expect(fresh.status).not.toBe(429);
  });
});
