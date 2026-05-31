import { createGoogleCalendarClient } from "@realty-ops/integrations";

import {
  isCalendarAccess,
  loadCalendarAccessForMember,
  type CalendarAccess,
} from "./calendar-access";

/**
 * High-level calendar actions that wrap loadCalendarAccessForMember +
 * the Google Calendar client. Callable from anywhere — buyer-chat tools,
 * operator-chat tools, routing logic.
 *
 *   - findAvailableSlots: walks business-hours windows, returns slots that
 *     don't intersect the member's busy blocks
 *   - isSlotAvailable: yes/no for a specific (start, end) — used by
 *     propose_showing_window to validate a buyer's requested time
 *   - createShowingEvent: insert event with attendees + Google Meet link
 *   - parallelFreeBusy: query multiple members' free/busy in parallel for
 *     availability-aware routing
 */

export type Slot = {
  startIso: string;
  endIso: string;
  humanLabel: string;
};

type BusyBlock = { start: number; end: number };

async function readBusyBlocks(
  access: CalendarAccess,
  fromIso: string,
  toIso: string,
): Promise<BusyBlock[]> {
  const calendarClient = createGoogleCalendarClient();
  const result = await calendarClient.queryFreeBusy({
    accessToken: access.accessToken,
    calendarIds: [access.calendarId],
    timeMin: fromIso,
    timeMax: toIso,
    timeZone: access.timezone,
  });
  return (result.calendars.find((c) => c.calendarId === access.calendarId)?.busy ?? []).map(
    (window) => ({ start: Date.parse(window.start), end: Date.parse(window.end) }),
  );
}

export async function findAvailableSlots(params: {
  workspaceId: string;
  memberId: string;
  fromIso: string;
  toIso: string;
  durationMinutes: number;
  preferredHourStart?: number;
  preferredHourEnd?: number;
  limit?: number;
}): Promise<{ slots: Slot[]; timezone: string | null; error?: string }> {
  const access = await loadCalendarAccessForMember({
    workspaceId: params.workspaceId,
    memberId: params.memberId,
  });
  if (!isCalendarAccess(access)) {
    return { slots: [], timezone: null, error: access.error };
  }

  const preferredHourStart = params.preferredHourStart ?? 10;
  const preferredHourEnd = params.preferredHourEnd ?? 18;
  const limit = params.limit ?? 4;
  const busy = await readBusyBlocks(access, params.fromIso, params.toIso);

  const slots: Slot[] = [];
  const startTime = new Date(params.fromIso);
  const endTime = new Date(params.toIso);
  const cursor = new Date(startTime);
  cursor.setMinutes(0, 0, 0);

  while (cursor < endTime && slots.length < limit) {
    const hour = cursor.getHours();
    if (
      hour >= preferredHourStart
      && hour + Math.ceil(params.durationMinutes / 60) <= preferredHourEnd
    ) {
      const slotStart = cursor.getTime();
      const slotEnd = slotStart + params.durationMinutes * 60 * 1000;
      const conflicts = busy.some((window) => window.start < slotEnd && window.end > slotStart);
      if (!conflicts) {
        slots.push({
          startIso: new Date(slotStart).toISOString(),
          endIso: new Date(slotEnd).toISOString(),
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

  return { slots, timezone: access.timezone };
}

export async function isSlotAvailable(params: {
  workspaceId: string;
  memberId: string;
  startIso: string;
  endIso: string;
}): Promise<{ available: boolean; timezone: string | null; error?: string }> {
  const access = await loadCalendarAccessForMember({
    workspaceId: params.workspaceId,
    memberId: params.memberId,
  });
  if (!isCalendarAccess(access)) {
    return { available: false, timezone: null, error: access.error };
  }
  const start = Date.parse(params.startIso);
  const end = Date.parse(params.endIso);
  // Pad the busy query a bit wider than the slot so adjacent meetings show up.
  const paddingMs = 30 * 60 * 1000;
  const busy = await readBusyBlocks(
    access,
    new Date(start - paddingMs).toISOString(),
    new Date(end + paddingMs).toISOString(),
  );
  const conflicts = busy.some((window) => window.start < end && window.end > start);
  return { available: !conflicts, timezone: access.timezone };
}

export async function createShowingEvent(params: {
  workspaceId: string;
  memberId: string;
  summary: string;
  description?: string;
  location?: string;
  startIso: string;
  endIso: string;
  attendeeEmail?: string | null;
  attendeeName?: string | null;
}): Promise<
  | { ok: true; eventId: string; htmlLink: string }
  | { ok: false; error: string }
> {
  const access = await loadCalendarAccessForMember({
    workspaceId: params.workspaceId,
    memberId: params.memberId,
  });
  if (!isCalendarAccess(access)) {
    return { ok: false, error: access.error };
  }

  const calendarClient = createGoogleCalendarClient();
  try {
    const attendees =
      params.attendeeEmail === null || params.attendeeEmail === undefined
        ? []
        : [
            {
              email: params.attendeeEmail,
              ...(params.attendeeName === null || params.attendeeName === undefined
                ? {}
                : { displayName: params.attendeeName }),
            },
          ];
    const event = await calendarClient.createEvent({
      accessToken: access.accessToken,
      calendarId: access.calendarId,
      summary: params.summary,
      ...(params.description === undefined ? {} : { description: params.description }),
      ...(params.location === undefined ? {} : { location: params.location }),
      start: params.startIso,
      end: params.endIso,
      timeZone: access.timezone,
      ...(attendees.length === 0 ? {} : { attendees }),
      sendUpdates: attendees.length === 0 ? "none" : "all",
    });
    return { ok: true, eventId: event.eventId, htmlLink: event.htmlLink ?? "" };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "event_create_failed",
    };
  }
}

export type MemberAvailability = {
  memberId: string;
  hasCalendar: boolean;
  slotsAvailable: number;
  firstSlot: Slot | null;
  timezone: string | null;
};

/**
 * Parallel free/busy query across multiple members. Used by availability-
 * aware routing — when an unassigned lead asks for a showing, we ask all
 * eligible team members "can you take this Tuesday 4pm?" simultaneously
 * and route to the first one with an open slot.
 *
 * Members without a connected calendar get hasCalendar: false. Caller
 * decides whether to fall back to area-only routing for those.
 */
export async function parallelFreeBusy(params: {
  workspaceId: string;
  memberIds: string[];
  fromIso: string;
  toIso: string;
  durationMinutes: number;
  preferredHourStart?: number;
  preferredHourEnd?: number;
}): Promise<MemberAvailability[]> {
  const results = await Promise.all(
    params.memberIds.map(async (memberId): Promise<MemberAvailability> => {
      const result = await findAvailableSlots({
        workspaceId: params.workspaceId,
        memberId,
        fromIso: params.fromIso,
        toIso: params.toIso,
        durationMinutes: params.durationMinutes,
        ...(params.preferredHourStart === undefined ? {} : { preferredHourStart: params.preferredHourStart }),
        ...(params.preferredHourEnd === undefined ? {} : { preferredHourEnd: params.preferredHourEnd }),
        limit: 1,
      });
      return {
        memberId,
        hasCalendar: result.error !== "no_calendar_connection",
        slotsAvailable: result.slots.length,
        firstSlot: result.slots[0] ?? null,
        timezone: result.timezone,
      };
    }),
  );
  return results;
}
