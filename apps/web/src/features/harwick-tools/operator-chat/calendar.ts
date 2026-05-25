import {
  GoogleCalendarCredentialSchema,
  type GoogleCalendarCredential,
} from "@realty-ops/core";
import { createGoogleCalendarClient } from "@realty-ops/integrations";
import { z } from "zod";

import { decryptCredential, encryptCredential } from "../../../lib/credentials";
import { getServerEnvironment } from "../../../lib/server-env";
import { createSupabaseMemberCalendarConnectionRepository, type ActiveMemberCalendarConnection } from "../../../lib/supabase/member-calendar-connections";
import { defineHarwickTool, type HarwickToolDefinition, type HarwickToolDeps } from "../registry";

/**
 * Real calendar tools, backed by the operator's connected Google Calendar.
 *
 *   - check_availability      Free/busy read across a window
 *   - propose_showing_times   Find candidate slots between two parties' calendars
 *   - schedule_showing        Insert a real event (member's connected calendar)
 *   - block_focus_time        Insert a self-only event to protect focus blocks
 *
 * All four use the same access-token decrypt + refresh path that the existing
 * showing-approval action runs through, so behavior is consistent.
 */

const CREDENTIAL_REFRESH_BUFFER_MS = 60_000;

function isCredentialExpiringSoon(credential: GoogleCalendarCredential, now: Date): boolean {
  if (credential.expiresAt === null) return false;
  return Date.parse(credential.expiresAt) - now.getTime() < CREDENTIAL_REFRESH_BUFFER_MS;
}

type AccessTokenContext = {
  accessToken: string;
  calendarId: string;
  timezone: string;
  connection: ActiveMemberCalendarConnection;
};

async function getOperatorCalendarAccess(
  deps: HarwickToolDeps,
  memberId: string,
): Promise<AccessTokenContext | { error: string }> {
  const env = getServerEnvironment();
  if (env.GOOGLE_CALENDAR_CLIENT_ID === undefined || env.GOOGLE_CALENDAR_CLIENT_SECRET === undefined) {
    return { error: "Google Calendar OAuth is not configured for this workspace." };
  }
  if (env.CREDENTIAL_ENCRYPTION_KEY === undefined) {
    return { error: "Credential encryption key not configured." };
  }

  const repo = createSupabaseMemberCalendarConnectionRepository(deps.supabase);
  const connection = await repo.findActiveConnection({
    workspaceId: deps.workspaceId,
    memberId,
  });
  if (connection === null) {
    return { error: "No connected calendar for this member. Connect Google Calendar in Settings first." };
  }

  let credential = GoogleCalendarCredentialSchema.parse(
    decryptCredential<unknown>(connection.encryptedCredentialRef, env.CREDENTIAL_ENCRYPTION_KEY),
  );
  const now = new Date();

  if (isCredentialExpiringSoon(credential, now) && credential.refreshToken !== null) {
    const calendarClient = createGoogleCalendarClient();
    const refreshed = await calendarClient.refreshAccessToken({
      clientId: env.GOOGLE_CALENDAR_CLIENT_ID,
      clientSecret: env.GOOGLE_CALENDAR_CLIENT_SECRET,
      refreshToken: credential.refreshToken,
    });
    credential = GoogleCalendarCredentialSchema.parse({
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? credential.refreshToken,
      tokenType: refreshed.token_type,
      scope: refreshed.scope ?? credential.scope,
      expiresAt: refreshed.expires_in === undefined
        ? null
        : new Date(now.getTime() + refreshed.expires_in * 1000).toISOString(),
    });
    await repo.updateEncryptedCredential({
      connectionId: connection.id,
      encryptedCredentialRef: encryptCredential(credential, env.CREDENTIAL_ENCRYPTION_KEY),
      syncedAt: now.toISOString(),
    });
  }

  return {
    accessToken: credential.accessToken,
    calendarId: connection.calendarId,
    timezone: connection.timezone,
    connection,
  };
}

export const checkAvailabilityTool = defineHarwickTool({
  name: "check_availability",
  description: "Read the operator's connected Google Calendar over a window and return busy blocks. Use BEFORE proposing showing times so you're not suggesting times the operator is busy. Defaults to the next 7 days from the operator's timezone.",
  scopes: ["operator_chat", "lead_conversation"],
  approval: "internal_safe",
  inputSchema: z.object({
    memberId: z.string().uuid().nullable().default(null).describe("Member whose calendar to check. Default null = the requesting operator."),
    fromIso: z.string().nullable().default(null).describe("ISO datetime to start the window. Null = now."),
    toIso: z.string().nullable().default(null).describe("ISO datetime to end the window. Null = now + 7 days."),
  }),
  async execute(input, deps: HarwickToolDeps) {
    const memberId = input.memberId ?? deps.operatorMemberId;
    const access = await getOperatorCalendarAccess(deps, memberId);
    if ("error" in access) {
      return { kind: "availability", available: false, busy: [], note: access.error };
    }

    const now = new Date();
    const fromIso = input.fromIso ?? now.toISOString();
    const toIso = input.toIso ?? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const calendarClient = createGoogleCalendarClient();
    try {
      const result = await calendarClient.queryFreeBusy({
        accessToken: access.accessToken,
        calendarIds: [access.calendarId],
        timeMin: fromIso,
        timeMax: toIso,
        timeZone: access.timezone,
      });
      const busyForCalendar = result.calendars.find((c) => c.calendarId === access.calendarId)?.busy ?? [];
      return {
        kind: "availability",
        memberId,
        calendarId: access.calendarId,
        timezone: access.timezone,
        window: { from: fromIso, to: toIso },
        busy: busyForCalendar,
        busyCount: busyForCalendar.length,
      };
    } catch (error) {
      return { kind: "availability", available: false, busy: [], note: error instanceof Error ? error.message : "calendar_read_failed" };
    }
  },
});

export const proposeShowingTimesTool = defineHarwickTool({
  name: "propose_showing_times",
  description: "Given a calendar window and a lead's stated availability hints (in natural language), return up to 4 candidate showing slots that don't conflict with the operator's calendar. Use this when a lead asks for a tour but didn't pick a time. Returns slots in 1-hour blocks during business hours.",
  scopes: ["operator_chat", "lead_conversation"],
  approval: "internal_safe",
  inputSchema: z.object({
    memberId: z.string().uuid().nullable().default(null),
    durationMinutes: z.number().int().min(15).max(180).default(60),
    fromIso: z.string().nullable().default(null),
    toIso: z.string().nullable().default(null),
    preferredHourStart: z.number().int().min(0).max(23).default(10).describe("Earliest hour-of-day to propose. Defaults to 10am."),
    preferredHourEnd: z.number().int().min(1).max(24).default(18).describe("Latest hour-of-day to propose. Defaults to 6pm."),
  }),
  async execute(input, deps: HarwickToolDeps) {
    const memberId = input.memberId ?? deps.operatorMemberId;
    const access = await getOperatorCalendarAccess(deps, memberId);
    if ("error" in access) {
      return { kind: "showing_slots", count: 0, slots: [], note: access.error };
    }

    const now = new Date();
    const fromIso = input.fromIso ?? now.toISOString();
    const toIso = input.toIso ?? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const calendarClient = createGoogleCalendarClient();
    const result = await calendarClient.queryFreeBusy({
      accessToken: access.accessToken,
      calendarIds: [access.calendarId],
      timeMin: fromIso,
      timeMax: toIso,
      timeZone: access.timezone,
    });
    const busy = (result.calendars.find((c) => c.calendarId === access.calendarId)?.busy ?? [])
      .map((window) => ({ start: Date.parse(window.start), end: Date.parse(window.end) }));

    // Walk hour by hour through business hours, pick the first 4 that don't
    // intersect a busy block.
    const slots: Array<{ startIso: string; endIso: string; humanLabel: string }> = [];
    const startTime = new Date(fromIso);
    const endTime = new Date(toIso);
    const cursor = new Date(startTime);
    cursor.setMinutes(0, 0, 0);

    while (cursor < endTime && slots.length < 4) {
      const hour = cursor.getHours();
      if (hour >= input.preferredHourStart && hour + Math.ceil(input.durationMinutes / 60) <= input.preferredHourEnd) {
        const slotStart = cursor.getTime();
        const slotEnd = slotStart + input.durationMinutes * 60 * 1000;
        const conflicts = busy.some((window) => window.start < slotEnd && window.end > slotStart);
        if (!conflicts) {
          const startIso = new Date(slotStart).toISOString();
          const endIso = new Date(slotEnd).toISOString();
          slots.push({
            startIso,
            endIso,
            humanLabel: new Date(slotStart).toLocaleString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              timeZone: access.timezone,
            }),
          });
        }
      }
      cursor.setHours(cursor.getHours() + 1);
    }

    return {
      kind: "showing_slots",
      memberId,
      timezone: access.timezone,
      count: slots.length,
      slots,
    };
  },
});

export const scheduleShowingTool = defineHarwickTool({
  name: "schedule_showing",
  description: "Actually create a real calendar event on the operator's connected calendar. Use after you've proposed times and the operator (or lead) has accepted one. Returns the event id + link so you can share it back. This is APPROVAL-REQUIRED — Harwick should only call this once the operator has confirmed.",
  scopes: ["operator_chat", "lead_conversation"],
  approval: "approval_required",
  inputSchema: z.object({
    memberId: z.string().uuid().nullable().default(null),
    summary: z.string().min(3).max(200).describe("Event title. Example: 'Showing — 1234 Oak Ave with Danielle Lee'."),
    description: z.string().max(2000).optional(),
    location: z.string().max(300).optional(),
    startIso: z.string().describe("ISO datetime when the showing starts."),
    endIso: z.string().describe("ISO datetime when the showing ends."),
    attendeeEmail: z.string().email().nullable().default(null),
    attendeeName: z.string().max(120).nullable().default(null),
  }),
  async execute(input, deps: HarwickToolDeps) {
    const memberId = input.memberId ?? deps.operatorMemberId;
    const access = await getOperatorCalendarAccess(deps, memberId);
    if ("error" in access) {
      return { kind: "showing_event", created: false, error: access.error };
    }

    const calendarClient = createGoogleCalendarClient();
    try {
      const attendees = input.attendeeEmail === null
        ? []
        : [{ email: input.attendeeEmail, ...(input.attendeeName === null ? {} : { displayName: input.attendeeName }) }];

      const event = await calendarClient.createEvent({
        accessToken: access.accessToken,
        calendarId: access.calendarId,
        summary: input.summary,
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.location === undefined ? {} : { location: input.location }),
        start: input.startIso,
        end: input.endIso,
        timeZone: access.timezone,
        ...(attendees.length === 0 ? {} : { attendees }),
        sendUpdates: attendees.length === 0 ? "none" : "all",
      });

      return {
        kind: "showing_event",
        created: true,
        eventId: event.eventId,
        htmlLink: event.htmlLink,
        summary: input.summary,
        startIso: input.startIso,
        endIso: input.endIso,
      };
    } catch (error) {
      return { kind: "showing_event", created: false, error: error instanceof Error ? error.message : "event_create_failed" };
    }
  },
});

export const blockFocusTimeTool = defineHarwickTool({
  name: "block_focus_time",
  description: "Block the operator's own calendar with a focus-time event so they don't get pulled into meetings during a window. Use when the operator asks for protected time ('block 2-4pm for prep') or when Harwick infers a clash that needs guarding. Self-only event, no attendees.",
  scopes: ["operator_chat"],
  approval: "auto_safe",
  inputSchema: z.object({
    summary: z.string().min(3).max(120).default("Focus block").describe("What the block is for."),
    startIso: z.string(),
    endIso: z.string(),
  }),
  async execute(input, deps: HarwickToolDeps) {
    const access = await getOperatorCalendarAccess(deps, deps.operatorMemberId);
    if ("error" in access) {
      return { kind: "focus_block", created: false, error: access.error };
    }

    const calendarClient = createGoogleCalendarClient();
    try {
      const event = await calendarClient.createEvent({
        accessToken: access.accessToken,
        calendarId: access.calendarId,
        summary: input.summary,
        start: input.startIso,
        end: input.endIso,
        timeZone: access.timezone,
        sendUpdates: "none",
      });
      return {
        kind: "focus_block",
        created: true,
        eventId: event.eventId,
        htmlLink: event.htmlLink,
        startIso: input.startIso,
        endIso: input.endIso,
      };
    } catch (error) {
      return { kind: "focus_block", created: false, error: error instanceof Error ? error.message : "event_create_failed" };
    }
  },
});

export const CALENDAR_TOOLS: HarwickToolDefinition[] = [
  checkAvailabilityTool,
  proposeShowingTimesTool,
  scheduleShowingTool,
  blockFocusTimeTool,
];
