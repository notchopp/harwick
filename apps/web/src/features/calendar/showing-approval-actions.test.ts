import { describe, expect, it, vi } from "vitest";
import type { GoogleCalendarClient } from "@realty-ops/integrations";
import { encryptCredential } from "../../lib/credentials";
import type {
  ActiveMemberCalendarConnection,
  MemberCalendarConnectionRepository,
} from "../../lib/supabase/member-calendar-connections";
import { actOnShowingApproval, type ShowingApprovalRepository } from "./showing-approval-actions";

const workspaceId = "00000000-0000-0000-0000-000000000001";
const taskId = "00000000-0000-0000-0000-000000000002";
const leadId = "00000000-0000-0000-0000-000000000003";
const memberId = "00000000-0000-0000-0000-000000000004";

function createRepository(overrides: Partial<ShowingApprovalRepository> = {}) {
  const mocks = {
    findShowingTask: vi.fn<ShowingApprovalRepository["findShowingTask"]>(() => Promise.resolve({
      id: taskId,
      workspaceId,
      leadId,
      listingId: null,
      taskType: "request_showing_approval",
      status: "open",
      title: "Showing approval: 123 Main St",
      description: "Lead asked to see 123 Main St.",
      assignedMemberId: memberId,
      requestedStartAt: null,
      requestedEndAt: null,
    })),
    findLead: vi.fn<ShowingApprovalRepository["findLead"]>(() => Promise.resolve({
      id: leadId,
      assignedAgentId: memberId,
      fullName: "Katy Buyer",
      email: "lead@example.com",
      phone: "555-0100",
    })),
    completeShowingTask: vi.fn<ShowingApprovalRepository["completeShowingTask"]>(() => Promise.resolve()),
    dismissShowingTask: vi.fn<ShowingApprovalRepository["dismissShowingTask"]>(() => Promise.resolve()),
    markLeadAppointmentBooked: vi.fn<ShowingApprovalRepository["markLeadAppointmentBooked"]>(() => Promise.resolve()),
    ...overrides,
  };
  return {
    repository: mocks satisfies ShowingApprovalRepository,
    mocks,
  };
}

function createCalendarConnectionRepository(
  overrides: Partial<MemberCalendarConnectionRepository> = {},
): MemberCalendarConnectionRepository {
  const connection: ActiveMemberCalendarConnection = {
    id: "00000000-0000-0000-0000-000000000005",
    workspaceId,
    memberId,
    provider: "google",
    providerAccountEmail: "agent@example.com",
    calendarId: "primary",
    status: "connected",
    showingMode: "request_approve",
    timezone: "America/New_York",
    encryptedCredentialRef: encryptCredential({
      version: "google_calendar_oauth_v1",
      accessToken: "google-access-token",
      refreshToken: "refresh-token",
      tokenType: "Bearer",
      scope: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy",
      expiresAt: "2026-05-06T13:00:00.000Z",
    }, "test-secret"),
    lastSyncedAt: null,
    createdAt: "2026-05-06T00:00:00.000Z",
    updatedAt: "2026-05-06T00:00:00.000Z",
  };
  return {
    findActiveConnection: vi.fn(() => Promise.resolve(connection)),
    updateEncryptedCredential: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

describe("actOnShowingApproval", () => {
  it("approves and books a showing on the assigned member Google Calendar", async () => {
    const { repository, mocks } = createRepository();
    const calendarConnectionRepository = createCalendarConnectionRepository();
    const calendarClient = {
      createEvent: vi.fn(() => Promise.resolve({
        eventId: "google-event-1",
        htmlLink: "https://calendar.google.com/event?eid=google-event-1",
      })),
    } satisfies Pick<GoogleCalendarClient, "createEvent">;

    await expect(actOnShowingApproval({
      workspaceId,
      taskId,
      memberId,
      memberRole: "agent",
      request: {
        action: "approve_and_book",
        start: "2026-05-07T14:00:00.000Z",
        end: "2026-05-07T14:30:00.000Z",
        location: "123 Main St",
        note: "Confirmed by agent.",
      },
      repository,
      calendarConnectionRepository,
      calendarClient,
      credentialSecret: "test-secret",
      now: () => new Date("2026-05-06T12:00:00.000Z"),
    })).resolves.toEqual({
      status: "booked",
      taskId,
      leadId,
      memberId,
      provider: "google",
      calendarId: "primary",
      calendarEventId: "google-event-1",
      start: "2026-05-07T14:00:00.000Z",
      end: "2026-05-07T14:30:00.000Z",
    });

    expect(calendarClient.createEvent).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: "google-access-token",
      calendarId: "primary",
      eventId: "ro00000000000000000000000000000002",
      summary: "Showing approval: 123 Main St",
      location: "123 Main St",
      start: "2026-05-07T14:00:00.000Z",
      end: "2026-05-07T14:30:00.000Z",
      timeZone: "America/New_York",
      attendees: [{
        email: "lead@example.com",
        displayName: "Katy Buyer",
      }],
    }));
    expect(mocks.completeShowingTask).toHaveBeenCalledWith({
      workspaceId,
      taskId,
      approvedByMemberId: memberId,
      approvedAt: "2026-05-06T12:00:00.000Z",
      start: "2026-05-07T14:00:00.000Z",
      end: "2026-05-07T14:30:00.000Z",
      calendarProvider: "google",
      calendarId: "primary",
      calendarEventId: "google-event-1",
    });
    expect(mocks.markLeadAppointmentBooked).toHaveBeenCalledWith({
      workspaceId,
      leadId,
      updatedAt: "2026-05-06T12:00:00.000Z",
    });
  });

  it("dismisses a showing task without writing a calendar event", async () => {
    const { repository, mocks } = createRepository();
    const calendarClient = {
      createEvent: vi.fn(() => Promise.resolve({
        eventId: "google-event-1",
        htmlLink: null,
      })),
    } satisfies Pick<GoogleCalendarClient, "createEvent">;

    await expect(actOnShowingApproval({
      workspaceId,
      taskId,
      memberId,
      memberRole: "agent",
      request: {
        action: "dismiss",
        reason: "Lead picked a different property.",
      },
      repository,
      calendarConnectionRepository: createCalendarConnectionRepository(),
      calendarClient,
      credentialSecret: "test-secret",
      now: () => new Date("2026-05-06T12:00:00.000Z"),
    })).resolves.toEqual({
      status: "dismissed",
      taskId,
      reason: "Lead picked a different property.",
    });

    expect(calendarClient.createEvent).not.toHaveBeenCalled();
    expect(mocks.dismissShowingTask).toHaveBeenCalledWith({
      workspaceId,
      taskId,
      dismissedAt: "2026-05-06T12:00:00.000Z",
      reason: "Lead picked a different property.",
    });
  });

  it("returns null when no member calendar is connected", async () => {
    await expect(actOnShowingApproval({
      workspaceId,
      taskId,
      memberId,
      memberRole: "agent",
      request: {
        action: "approve_and_book",
        start: "2026-05-07T14:00:00.000Z",
        end: "2026-05-07T14:30:00.000Z",
      },
      repository: createRepository().repository,
      calendarConnectionRepository: createCalendarConnectionRepository({
        findActiveConnection: vi.fn(() => Promise.resolve(null)),
      }),
      calendarClient: {
        createEvent: vi.fn(),
      },
      credentialSecret: "test-secret",
    })).resolves.toBeNull();
  });

  it("does not let an unrelated agent approve another member showing task", async () => {
    const unrelatedMemberId = "00000000-0000-0000-0000-000000000099";
    await expect(actOnShowingApproval({
      workspaceId,
      taskId,
      memberId: unrelatedMemberId,
      memberRole: "agent",
      request: {
        action: "approve_and_book",
        start: "2026-05-07T14:00:00.000Z",
        end: "2026-05-07T14:30:00.000Z",
      },
      repository: createRepository().repository,
      calendarConnectionRepository: createCalendarConnectionRepository(),
      calendarClient: {
        createEvent: vi.fn(),
      },
      credentialSecret: "test-secret",
    })).resolves.toBeNull();
  });
});
