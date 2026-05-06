import { describe, expect, it, vi } from "vitest";
import { buildGoogleCalendarOAuthUrl, createGoogleCalendarClient } from "./google-calendar.js";

describe("Google Calendar integration", () => {
  it("builds a consent URL for offline calendar access", () => {
    const url = new URL(buildGoogleCalendarOAuthUrl({
      clientId: "google-client-id",
      redirectUri: "https://app.example.com/api/integrations/google-calendar/callback",
      state: "state-token",
    }));

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("google-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.example.com/api/integrations/google-calendar/callback");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state-token");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("scope")).toContain("https://www.googleapis.com/auth/calendar.freebusy");
    expect(url.searchParams.get("scope")).toContain("https://www.googleapis.com/auth/calendar.events");
  });

  it("queries Google free/busy with bearer auth and normalized calendar IDs", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      calendars: {
        primary: {
          busy: [
            {
              start: "2026-05-07T14:00:00.000Z",
              end: "2026-05-07T14:30:00.000Z",
            },
          ],
        },
      },
    }), { status: 200 })));
    const client = createGoogleCalendarClient({
      apiBaseUrl: "https://calendar.test",
      fetchImpl,
    });

    await expect(client.queryFreeBusy({
      accessToken: "google-access-token",
      calendarIds: ["primary"],
      timeMin: "2026-05-07T00:00:00.000Z",
      timeMax: "2026-05-14T00:00:00.000Z",
      timeZone: "America/New_York",
    })).resolves.toEqual({
      calendars: [{
        calendarId: "primary",
        busy: [{
          start: "2026-05-07T14:00:00.000Z",
          end: "2026-05-07T14:30:00.000Z",
        }],
      }],
    });

    expect(fetchImpl).toHaveBeenCalledWith("https://calendar.test/freeBusy", {
      method: "POST",
      headers: {
        authorization: "Bearer google-access-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        timeMin: "2026-05-07T00:00:00.000Z",
        timeMax: "2026-05-14T00:00:00.000Z",
        timeZone: "America/New_York",
        items: [{ id: "primary" }],
      }),
    });
  });

  it("raises provider errors without exposing tokens", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response("invalid auth", {
      status: 401,
      statusText: "Unauthorized",
    })));
    const client = createGoogleCalendarClient({
      apiBaseUrl: "https://calendar.test",
      fetchImpl,
    });

    await expect(client.queryFreeBusy({
      accessToken: "secret-token",
      calendarIds: ["primary"],
      timeMin: "2026-05-07T00:00:00.000Z",
      timeMax: "2026-05-14T00:00:00.000Z",
    })).rejects.toThrow("Google Calendar free/busy failed: 401 Unauthorized invalid auth");
  });

  it("exchanges authorization codes for OAuth tokens", async () => {
    let capturedRequest: RequestInit | undefined;
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      capturedRequest = init;
      return Promise.resolve(new Response(JSON.stringify({
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_in: 3600,
      token_type: "Bearer",
      scope: "https://www.googleapis.com/auth/calendar.freebusy",
    }), { status: 200 }));
    });
    const client = createGoogleCalendarClient({ fetchImpl });

    await expect(client.exchangeCodeForTokens({
      clientId: "client-id",
      clientSecret: "client-secret",
      code: "oauth-code",
      redirectUri: "https://app.example.com/callback",
    })).resolves.toEqual({
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_in: 3600,
      token_type: "Bearer",
      scope: "https://www.googleapis.com/auth/calendar.freebusy",
    });

    expect(capturedRequest).toEqual(expect.objectContaining({
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
    }));
    expect(capturedRequest?.body).toBeInstanceOf(URLSearchParams);
    const body = capturedRequest?.body instanceof URLSearchParams ? capturedRequest.body : new URLSearchParams();
    expect(body.get("grant_type")).toBe("authorization_code");
  });

  it("inserts Google Calendar events with external guest notifications", async () => {
    let capturedRequest: RequestInit | undefined;
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      capturedRequest = init;
      return Promise.resolve(new Response(JSON.stringify({
        id: "event-123",
        htmlLink: "https://calendar.google.com/event?eid=event-123",
      }), { status: 200 }));
    });
    const client = createGoogleCalendarClient({
      apiBaseUrl: "https://calendar.test",
      fetchImpl,
    });

    await expect(client.createEvent({
      accessToken: "google-access-token",
      calendarId: "primary",
      eventId: "ro00000000000000000000000000000001",
      summary: "Showing: 123 Main St",
      description: "Approved showing request",
      location: "123 Main St",
      start: "2026-05-07T14:00:00.000Z",
      end: "2026-05-07T14:30:00.000Z",
      timeZone: "America/New_York",
      attendees: [{
        email: "lead@example.com",
        displayName: "Katy Buyer",
      }],
    })).resolves.toEqual({
      eventId: "event-123",
      htmlLink: "https://calendar.google.com/event?eid=event-123",
    });

    expect(fetchImpl).toHaveBeenCalledWith("https://calendar.test/calendars/primary/events?sendUpdates=externalOnly", expect.objectContaining({
      method: "POST",
      headers: {
        authorization: "Bearer google-access-token",
        "content-type": "application/json",
      },
    }));
    const requestBody = capturedRequest?.body;
    expect(typeof requestBody).toBe("string");
    const body = JSON.parse(typeof requestBody === "string" ? requestBody : "{}") as {
      id: string;
      summary: string;
      start: { dateTime: string; timeZone: string };
      attendees: Array<{ email: string; displayName: string }>;
    };
    expect(body.id).toBe("ro00000000000000000000000000000001");
    expect(body.summary).toBe("Showing: 123 Main St");
    expect(body.start).toEqual({
      dateTime: "2026-05-07T14:00:00.000Z",
      timeZone: "America/New_York",
    });
    expect(body.attendees[0]?.email).toBe("lead@example.com");
  });
});
