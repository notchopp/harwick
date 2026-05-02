import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { AuthSessionSummary } from "@realty-ops/core";
import { authorizeWorkspaceRequest, readBearerToken } from "./workspace-auth";
import { getAuthSessionSummary } from "../supabase/auth";
import { createUserSupabaseClient } from "../supabase/server-client";
import { createCookieSupabaseServerClient } from "../supabase/ssr-server";

vi.mock("../supabase/auth", () => ({
  getAuthSessionSummary: vi.fn(),
}));

vi.mock("../supabase/server-client", () => ({
  createUserSupabaseClient: vi.fn((accessToken: string) => ({ accessToken })),
}));

vi.mock("../supabase/ssr-server", () => ({
  createCookieSupabaseServerClient: vi.fn(),
}));

const baseSession: AuthSessionSummary = {
  user: {
    id: "123e4567-e89b-12d3-a456-426614174000",
    email: "broker@example.com",
    createdAt: "2026-05-01T00:00:00.000Z",
  },
  memberships: [
    {
      workspaceId: "223e4567-e89b-12d3-a456-426614174000",
      workspaceName: "Harwick Realty",
      workspaceSlug: "harwick-realty",
      memberId: "323e4567-e89b-12d3-a456-426614174000",
      role: "team_lead",
      displayName: "Jamie Broker",
    },
  ],
};
const baseMembership = baseSession.memberships[0]!;

describe("readBearerToken", () => {
  it("returns a trimmed bearer token", () => {
    const request = new NextRequest("https://example.test/api", {
      headers: {
        authorization: "Bearer token-123 ",
      },
    });

    expect(readBearerToken(request)).toBe("token-123");
  });

  it("rejects non-bearer authorization headers", () => {
    const request = new NextRequest("https://example.test/api", {
      headers: {
        authorization: "Basic abc123",
      },
    });

    expect(readBearerToken(request)).toBeNull();
  });
});

describe("authorizeWorkspaceRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("authorizes bearer-token requests with a matching workspace membership", async () => {
    vi.mocked(getAuthSessionSummary).mockResolvedValue(baseSession);

    const request = new NextRequest("https://example.test/api", {
      headers: {
        authorization: "Bearer bearer-token",
      },
    });

    await expect(authorizeWorkspaceRequest({
      request,
      workspaceId: baseMembership.workspaceId,
    })).resolves.toEqual(baseMembership);

    expect(createUserSupabaseClient).toHaveBeenCalledWith("bearer-token");
    expect(createCookieSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("falls back to cookie auth when no bearer token is present", async () => {
    vi.mocked(createCookieSupabaseServerClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: baseSession.user.id } },
          error: null,
        }),
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "cookie-token" } },
        }),
      },
    } as unknown as Awaited<ReturnType<typeof createCookieSupabaseServerClient>>);
    vi.mocked(getAuthSessionSummary).mockResolvedValue(baseSession);

    const request = new NextRequest("https://example.test/api");

    await expect(authorizeWorkspaceRequest({
      request,
      workspaceId: baseMembership.workspaceId,
      allowedRoles: new Set(["team_lead"]),
    })).resolves.toEqual(baseMembership);

    expect(createUserSupabaseClient).toHaveBeenCalledWith("cookie-token");
  });

  it("rejects memberships outside the allowed role set", async () => {
    vi.mocked(getAuthSessionSummary).mockResolvedValue(baseSession);

    const request = new NextRequest("https://example.test/api", {
      headers: {
        authorization: "Bearer bearer-token",
      },
    });

    await expect(authorizeWorkspaceRequest({
      request,
      workspaceId: baseMembership.workspaceId,
      allowedRoles: new Set(["owner", "admin"]),
    })).resolves.toBeNull();
  });
});
