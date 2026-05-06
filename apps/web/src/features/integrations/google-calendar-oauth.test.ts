import { describe, expect, it, vi } from "vitest";
import { decryptCredential } from "../../lib/credentials";
import {
  handleGoogleCalendarOAuthCallback,
  startGoogleCalendarOAuth,
  type GoogleCalendarOAuthRepository,
} from "./google-calendar-oauth";

describe("Google Calendar OAuth feature", () => {
  it("creates a pending member-scoped OAuth connection", async () => {
    const repository = {
      createPendingConnection: vi.fn(() => Promise.resolve()),
      connectCalendar: vi.fn(() => Promise.resolve(null)),
    } satisfies GoogleCalendarOAuthRepository;

    const result = await startGoogleCalendarOAuth({
      request: {},
      workspaceId: "123e4567-e89b-12d3-a456-426614174000",
      defaultMemberId: "123e4567-e89b-12d3-a456-426614174001",
      clientId: "google-client-id",
      redirectUri: "https://app.example.com/api/integrations/google-calendar/callback",
      repository,
    });

    expect(result.status).toBe(200);
    expect(result.body.authorizationUrl).toContain("https://accounts.google.com/o/oauth2/v2/auth");
    expect(repository.createPendingConnection).toHaveBeenCalledWith({
      workspaceId: "123e4567-e89b-12d3-a456-426614174000",
      memberId: "123e4567-e89b-12d3-a456-426614174001",
      oauthState: expect.any(String) as string,
    });
  });

  it("exchanges callback code and stores encrypted calendar credentials", async () => {
    let encryptedCredentialRef = "";
    const repository = {
      createPendingConnection: vi.fn(() => Promise.resolve()),
      connectCalendar: vi.fn((params: Parameters<GoogleCalendarOAuthRepository["connectCalendar"]>[0]) => {
        encryptedCredentialRef = params.encryptedCredentialRef;
        return Promise.resolve({
          workspaceId: "123e4567-e89b-12d3-a456-426614174000",
          memberId: "123e4567-e89b-12d3-a456-426614174001",
        });
      }),
    } satisfies GoogleCalendarOAuthRepository;
    const oauthClient = {
      exchangeCodeForTokens: vi.fn(() => Promise.resolve({
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 3600,
        token_type: "Bearer",
        scope: "https://www.googleapis.com/auth/calendar.freebusy",
      })),
    };

    const result = await handleGoogleCalendarOAuthCallback({
      query: {
        state: "oauth-state",
        code: "oauth-code",
      },
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "https://app.example.com/api/integrations/google-calendar/callback",
      oauthClient,
      repository,
      credentialSecret: "credential-secret-value",
      appBaseUrl: "https://app.example.com/integrations",
      now: new Date("2026-05-06T00:00:00.000Z"),
    });

    expect(result).toEqual({
      status: 302,
      body: {
        redirectUrl: "https://app.example.com/integrations?google_calendar=connected",
      },
    });
    expect(oauthClient.exchangeCodeForTokens).toHaveBeenCalledWith({
      clientId: "client-id",
      clientSecret: "client-secret",
      code: "oauth-code",
      redirectUri: "https://app.example.com/api/integrations/google-calendar/callback",
    });
    expect(repository.connectCalendar).toHaveBeenCalledWith(expect.objectContaining({
      oauthState: "oauth-state",
      calendarId: "primary",
      timezone: "America/New_York",
    }));
    expect(decryptCredential(encryptedCredentialRef, "credential-secret-value")).toEqual({
      version: "google_calendar_oauth_v1",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      tokenType: "Bearer",
      scope: "https://www.googleapis.com/auth/calendar.freebusy",
      expiresAt: "2026-05-06T01:00:00.000Z",
    });
  });
});
