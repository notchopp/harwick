import { describe, expect, it, vi } from "vitest";
import {
  produceOpenHouseReminders,
  type OpenHouseReminderRepository,
} from "./open-house-reminders";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const leadId = "22222222-2222-4222-8222-222222222222";
const listingId = "33333333-3333-4333-8333-333333333333";
const taskId = "44444444-4444-4444-8444-444444444444";
const enrollmentId = "55555555-5555-4555-8555-555555555555";

function makeRepository(overrides: Partial<OpenHouseReminderRepository> = {}) {
  const mocks = {
    listUpcomingOpenHouseRegistrations: vi.fn<OpenHouseReminderRepository["listUpcomingOpenHouseRegistrations"]>().mockResolvedValue([{
      id: taskId,
      workspaceId,
      leadId,
      listingId,
      assignedMemberId: "66666666-6666-4666-8666-666666666666",
      requestedStartAt: "2026-05-07T18:00:00.000Z",
      requestedEndAt: "2026-05-07T19:00:00.000Z",
      dueAt: "2026-05-07T17:00:00.000Z",
    }]),
    findLead: vi.fn<OpenHouseReminderRepository["findLead"]>().mockResolvedValue({
      id: leadId,
      workspaceId,
      fullName: "Noah Smith",
      phone: "+17135550100",
      instagramUserId: null,
      sourceChannel: "manual",
    }),
    findListing: vi.fn<OpenHouseReminderRepository["findListing"]>().mockResolvedValue({
      id: listingId,
      workspaceId,
      address: "1010 Allen Parkway",
      mlsNumber: "MLS-1",
    }),
    upsertReminderEnrollment: vi.fn<OpenHouseReminderRepository["upsertReminderEnrollment"]>().mockResolvedValue(enrollmentId),
    findExistingReminderMessage: vi.fn<OpenHouseReminderRepository["findExistingReminderMessage"]>().mockResolvedValue(null),
    insertReminderMessage: vi.fn<OpenHouseReminderRepository["insertReminderMessage"]>().mockResolvedValue("77777777-7777-4777-8777-777777777777"),
    insertReviewTask: vi.fn<OpenHouseReminderRepository["insertReviewTask"]>().mockResolvedValue(undefined),
  };
  const repo: OpenHouseReminderRepository = {
    ...mocks,
    ...overrides,
  };

  return { repo, mocks };
}

describe("open house reminders", () => {
  it("drafts reviewable reminder messages for upcoming registrations", async () => {
    const { repo, mocks } = makeRepository();

    const report = await produceOpenHouseReminders({
      repository: repo,
      now: () => new Date("2026-05-06T18:00:00.000Z"),
    });

    expect(report).toEqual({
      scanned: 1,
      remindersDrafted: 1,
      remindersAlreadyPresent: 0,
      remindersBlocked: 0,
      skipped: 0,
      errors: 0,
    });
    expect(mocks.upsertReminderEnrollment).toHaveBeenCalledWith({
      workspaceId,
      leadId,
      sequenceKey: `open_house_reminder:${taskId}`,
      nextActionAt: "2026-05-06T18:00:00.000Z",
    });
    expect(mocks.insertReminderMessage).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId,
      leadId,
      enrollmentId,
      channel: "sms",
      status: "drafted",
      body: expect.stringContaining("1010 Allen Parkway") as string,
      scheduledFor: "2026-05-07T18:00:00.000Z",
    }));
    expect(mocks.insertReviewTask).toHaveBeenCalledWith(expect.objectContaining({
      title: "Review open house reminder",
      description: expect.stringContaining("Noah") as string,
      dueAt: "2026-05-07T17:00:00.000Z",
    }));
  });

  it("does not duplicate reminder messages for the same registration enrollment", async () => {
    const { repo, mocks } = makeRepository({
      findExistingReminderMessage: vi.fn().mockResolvedValue({ id: "88888888-8888-4888-8888-888888888888" }),
    });

    const report = await produceOpenHouseReminders({
      repository: repo,
      now: () => new Date("2026-05-06T18:00:00.000Z"),
    });

    expect(report.remindersAlreadyPresent).toBe(1);
    expect(mocks.insertReminderMessage).not.toHaveBeenCalled();
    expect(mocks.insertReviewTask).not.toHaveBeenCalled();
  });

  it("blocks the reminder and surfaces a review task when contact is missing", async () => {
    const { repo, mocks } = makeRepository({
      findLead: vi.fn().mockResolvedValue({
        id: leadId,
        workspaceId,
        fullName: "Noah Smith",
        phone: null,
        instagramUserId: null,
        sourceChannel: "manual",
      }),
    });

    const report = await produceOpenHouseReminders({
      repository: repo,
      now: () => new Date("2026-05-06T18:00:00.000Z"),
    });

    expect(report.remindersBlocked).toBe(1);
    expect(mocks.insertReminderMessage).toHaveBeenCalledWith(expect.objectContaining({
      status: "blocked",
      blockReason: "missing_contact",
      body: null,
    }));
    expect(mocks.insertReviewTask).toHaveBeenCalledWith(expect.objectContaining({
      title: "Open house reminder needs contact",
    }));
  });
});
