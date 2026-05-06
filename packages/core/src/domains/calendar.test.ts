import { describe, expect, it } from "vitest";
import {
  CalendarAvailabilityResultSchema,
  GoogleCalendarCredentialSchema,
  ShowingApprovalActionRequestSchema,
  StartGoogleCalendarOAuthRequestSchema,
  WorkspaceMemberCalendarConnectionSchema,
} from "./calendar.js";

describe("calendar domain contracts", () => {
  it("validates a workspace member Google Calendar connection", () => {
    const connection = WorkspaceMemberCalendarConnectionSchema.parse({
      id: "123e4567-e89b-12d3-a456-426614174001",
      workspaceId: "123e4567-e89b-12d3-a456-426614174000",
      memberId: "123e4567-e89b-12d3-a456-426614174002",
      provider: "google",
      providerAccountEmail: "agent@example.com",
      calendarId: "primary",
      status: "connected",
      showingMode: "request_approve",
      timezone: "America/New_York",
      lastSyncedAt: null,
      createdAt: "2026-05-06T00:00:00.000Z",
      updatedAt: "2026-05-06T00:00:00.000Z",
    });

    expect(connection.calendarId).toBe("primary");
  });

  it("validates availability results consumed by Harwick tools", () => {
    const result = CalendarAvailabilityResultSchema.parse({
      memberId: "123e4567-e89b-12d3-a456-426614174002",
      provider: "google",
      calendarId: "primary",
      timezone: "America/New_York",
      showingMode: "request_approve",
      availableWindows: [{
        start: "2026-05-07T14:00:00.000Z",
        end: "2026-05-07T14:30:00.000Z",
        label: "Thu, May 7 at 10:00 AM",
      }],
      busyWindows: [],
      synthesized: false,
    });

    expect(result.synthesized).toBe(false);
  });

  it("validates the Google OAuth start request", () => {
    expect(StartGoogleCalendarOAuthRequestSchema.parse({
      memberId: "123e4567-e89b-12d3-a456-426614174002",
    }).memberId).toBe("123e4567-e89b-12d3-a456-426614174002");
  });

  it("validates encrypted Google Calendar credential payloads", () => {
    const credential = GoogleCalendarCredentialSchema.parse({
      version: "google_calendar_oauth_v1",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      tokenType: "Bearer",
      scope: "https://www.googleapis.com/auth/calendar.freebusy",
      expiresAt: "2026-05-06T01:00:00.000Z",
    });

    expect(credential.refreshToken).toBe("refresh-token");
  });

  it("validates showing approval booking requests", () => {
    const request = ShowingApprovalActionRequestSchema.parse({
      action: "approve_and_book",
      start: "2026-05-07T14:00:00.000Z",
      end: "2026-05-07T14:30:00.000Z",
      attendeeEmail: "lead@example.com",
      attendeeName: "Katy Buyer",
    });

    expect(request.action).toBe("approve_and_book");
    expect(() => ShowingApprovalActionRequestSchema.parse({
      action: "approve_and_book",
      start: "2026-05-07T14:30:00.000Z",
      end: "2026-05-07T14:00:00.000Z",
    })).toThrow();
  });
});
