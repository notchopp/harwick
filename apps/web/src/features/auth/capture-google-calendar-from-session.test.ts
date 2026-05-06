import { describe, expect, it, vi } from "vitest";
import { captureGoogleCalendarFromSession } from "./capture-google-calendar-from-session";

const SECRET = "test-credential-secret-32-bytes-min!!";

function makeRepo() {
  const calls: unknown[] = [];
  return {
    calls,
    repo: {
      upsertConnectionFromSession(params: unknown): Promise<void> {
        calls.push(params);
        return Promise.resolve();
      },
    },
  };
}

describe("captureGoogleCalendarFromSession", () => {
  it("skips when provider tokens are missing", async () => {
    const { repo, calls } = makeRepo();
    const result = await captureGoogleCalendarFromSession({
      tokens: { providerToken: null, providerRefreshToken: null, providerAccountEmail: null },
      memberships: [{ workspaceId: "w1", memberId: "m1" }],
      credentialSecret: SECRET,
      repository: repo,
    });
    expect(result).toEqual({ status: "skipped", reason: "no_provider_tokens" });
    expect(calls).toHaveLength(0);
  });

  it("skips when refresh token is missing (one-shot consent not granted)", async () => {
    const { repo, calls } = makeRepo();
    const result = await captureGoogleCalendarFromSession({
      tokens: { providerToken: "ya29.fresh", providerRefreshToken: "", providerAccountEmail: "a@b.co" },
      memberships: [{ workspaceId: "w1", memberId: "m1" }],
      credentialSecret: SECRET,
      repository: repo,
    });
    expect(result).toEqual({ status: "skipped", reason: "no_provider_tokens" });
    expect(calls).toHaveLength(0);
  });

  it("skips when user has no workspace memberships yet", async () => {
    const { repo } = makeRepo();
    const result = await captureGoogleCalendarFromSession({
      tokens: { providerToken: "ya29.x", providerRefreshToken: "1//rt", providerAccountEmail: "a@b.co" },
      memberships: [],
      credentialSecret: SECRET,
      repository: repo,
    });
    expect(result).toEqual({ status: "skipped", reason: "no_memberships" });
  });

  it("upserts one connection per workspace membership with encrypted credential", async () => {
    const { repo, calls } = makeRepo();
    const now = new Date("2026-05-06T20:00:00.000Z");
    const result = await captureGoogleCalendarFromSession({
      tokens: {
        providerToken: "ya29.access",
        providerRefreshToken: "1//refresh",
        providerAccountEmail: "agent@brokerage.com",
      },
      memberships: [
        { workspaceId: "w1", memberId: "m1" },
        { workspaceId: "w2", memberId: "m2" },
      ],
      credentialSecret: SECRET,
      repository: repo,
      now,
    });
    expect(result).toEqual({ status: "captured", connectedCount: 2 });
    expect(calls).toHaveLength(2);
    const first = calls[0] as { workspaceId: string; memberId: string; encryptedCredentialRef: string; calendarId: string; timezone: string; syncedAt: string; providerAccountEmail: string | null };
    expect(first.workspaceId).toBe("w1");
    expect(first.memberId).toBe("m1");
    expect(first.calendarId).toBe("primary");
    expect(first.providerAccountEmail).toBe("agent@brokerage.com");
    expect(first.syncedAt).toBe("2026-05-06T20:00:00.000Z");
    expect(first.encryptedCredentialRef.length).toBeGreaterThan(0);
    expect(first.encryptedCredentialRef.includes("ya29.access")).toBe(false);
    expect(first.encryptedCredentialRef.includes("1//refresh")).toBe(false);
  });

  it("uses the provided default timezone when given", async () => {
    const { repo, calls } = makeRepo();
    await captureGoogleCalendarFromSession({
      tokens: { providerToken: "x", providerRefreshToken: "y", providerAccountEmail: null },
      memberships: [{ workspaceId: "w1", memberId: "m1" }],
      credentialSecret: SECRET,
      repository: repo,
      defaultTimezone: "America/Los_Angeles",
    });
    expect((calls[0] as { timezone: string }).timezone).toBe("America/Los_Angeles");
  });

  it("propagates repository errors", async () => {
    const repo = {
      upsertConnectionFromSession(): Promise<void> {
        return Promise.reject(new Error("db boom"));
      },
    };
    await expect(
      captureGoogleCalendarFromSession({
        tokens: { providerToken: "x", providerRefreshToken: "y", providerAccountEmail: null },
        memberships: [{ workspaceId: "w1", memberId: "m1" }],
        credentialSecret: SECRET,
        repository: repo,
      }),
    ).rejects.toThrow("db boom");
  });
});

// keep vi import in use to match repo style
void vi;
