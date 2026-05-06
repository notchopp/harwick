import { CalendarAvailabilityWindowSchema } from "@realty-ops/core";
import { z } from "zod";

const GOOGLE_CALENDAR_API_BASE_URL = "https://www.googleapis.com/calendar/v3";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.events",
];

const GoogleFreeBusyResponseSchema = z.object({
  calendars: z.record(z.string(), z.object({
    busy: z.array(z.object({
      start: z.string().trim().min(1),
      end: z.string().trim().min(1),
    })).default([]),
    errors: z.array(z.object({
      domain: z.string().optional(),
      reason: z.string().optional(),
    }).passthrough()).optional(),
  }).passthrough()).default({}),
}).passthrough();

export type GoogleCalendarClientOptions = {
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
};

export type GoogleCalendarBusyWindow = {
  start: string;
  end: string;
};

export type GoogleCalendarFreeBusyResult = {
  calendars: Array<{
    calendarId: string;
    busy: GoogleCalendarBusyWindow[];
  }>;
};

export type GoogleCalendarCreateEventResult = {
  eventId: string;
  htmlLink: string | null;
};

export type GoogleCalendarClient = {
  queryFreeBusy(params: {
    accessToken: string;
    calendarIds: string[];
    timeMin: string;
    timeMax: string;
    timeZone?: string;
  }): Promise<GoogleCalendarFreeBusyResult>;
  exchangeCodeForTokens(params: {
    clientId: string;
    clientSecret: string;
    code: string;
    redirectUri: string;
  }): Promise<GoogleCalendarTokenResponse>;
  refreshAccessToken(params: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  }): Promise<GoogleCalendarTokenResponse>;
  createEvent(params: {
    accessToken: string;
    calendarId: string;
    eventId?: string;
    summary: string;
    description?: string;
    location?: string;
    start: string;
    end: string;
    timeZone: string;
    attendees?: Array<{
      email: string;
      displayName?: string;
    }>;
    sendUpdates?: "all" | "externalOnly" | "none";
  }): Promise<GoogleCalendarCreateEventResult>;
};

const GoogleCalendarTokenResponseSchema = z.object({
  access_token: z.string().trim().min(1),
  refresh_token: z.string().trim().min(1).optional(),
  expires_in: z.number().int().positive().optional(),
  token_type: z.string().trim().min(1).default("Bearer"),
  scope: z.string().trim().min(1).optional(),
}).passthrough();

export type GoogleCalendarTokenResponse = z.infer<typeof GoogleCalendarTokenResponseSchema>;

const GoogleCalendarEventInsertResponseSchema = z.object({
  id: z.string().trim().min(1),
  htmlLink: z.string().trim().url().optional(),
}).passthrough();

export function buildGoogleCalendarOAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes?: string[];
}): string {
  const url = new URL(GOOGLE_OAUTH_AUTHORIZE_URL);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", params.state);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("scope", (params.scopes ?? GOOGLE_CALENDAR_SCOPES).join(" "));
  return url.toString();
}

export function createGoogleCalendarClient(options: GoogleCalendarClientOptions = {}): GoogleCalendarClient {
  const apiBaseUrl = options.apiBaseUrl ?? GOOGLE_CALENDAR_API_BASE_URL;
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async queryFreeBusy(params) {
      if (params.calendarIds.length === 0) {
        return { calendars: [] };
      }

      const response = await fetchImpl(`${apiBaseUrl}/freeBusy`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${params.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          timeMin: params.timeMin,
          timeMax: params.timeMax,
          timeZone: params.timeZone,
          items: params.calendarIds.map((id) => ({ id })),
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`Google Calendar free/busy failed: ${response.status} ${response.statusText} ${detail}`.trim());
      }

      const payload = GoogleFreeBusyResponseSchema.parse(await response.json());
      return {
        calendars: Object.entries(payload.calendars).map(([calendarId, calendar]) => {
          if (calendar.errors !== undefined && calendar.errors.length > 0) {
            throw new Error(`Google Calendar free/busy returned calendar errors for ${calendarId}`);
          }

          return {
            calendarId,
            busy: calendar.busy.map((window) => CalendarAvailabilityWindowSchema.pick({
              start: true,
              end: true,
            }).parse(window)),
          };
        }),
      };
    },

    async exchangeCodeForTokens(params) {
      const body = new URLSearchParams();
      body.set("client_id", params.clientId);
      body.set("client_secret", params.clientSecret);
      body.set("code", params.code);
      body.set("grant_type", "authorization_code");
      body.set("redirect_uri", params.redirectUri);

      const response = await fetchImpl(GOOGLE_OAUTH_TOKEN_URL, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`Google Calendar OAuth token exchange failed: ${response.status} ${response.statusText} ${detail}`.trim());
      }

      return GoogleCalendarTokenResponseSchema.parse(await response.json());
    },

    async refreshAccessToken(params) {
      const body = new URLSearchParams();
      body.set("client_id", params.clientId);
      body.set("client_secret", params.clientSecret);
      body.set("refresh_token", params.refreshToken);
      body.set("grant_type", "refresh_token");

      const response = await fetchImpl(GOOGLE_OAUTH_TOKEN_URL, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`Google Calendar OAuth refresh failed: ${response.status} ${response.statusText} ${detail}`.trim());
      }

      return GoogleCalendarTokenResponseSchema.parse(await response.json());
    },

    async createEvent(params) {
      const url = new URL(`${apiBaseUrl}/calendars/${encodeURIComponent(params.calendarId)}/events`);
      url.searchParams.set("sendUpdates", params.sendUpdates ?? "externalOnly");

      const response = await fetchImpl(url.toString(), {
        method: "POST",
        headers: {
          authorization: `Bearer ${params.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          id: params.eventId,
          summary: params.summary,
          description: params.description,
          location: params.location,
          start: {
            dateTime: params.start,
            timeZone: params.timeZone,
          },
          end: {
            dateTime: params.end,
            timeZone: params.timeZone,
          },
          attendees: params.attendees,
          extendedProperties: {
            private: {
              source: "realty_ops_showing_approval",
            },
          },
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`Google Calendar event insert failed: ${response.status} ${response.statusText} ${detail}`.trim());
      }

      const payload = GoogleCalendarEventInsertResponseSchema.parse(await response.json());
      return {
        eventId: payload.id,
        htmlLink: payload.htmlLink ?? null,
      };
    },
  };
}
