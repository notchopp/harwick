import { describe, expect, it, vi } from "vitest";
import type { VoiceBriefsRepository } from "./voice-briefs";
import {
  buildVoiceDailyBrief,
  buildVoiceShowingBrief,
  submitVoiceShowingDebrief,
} from "./voice-briefs";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const leadId = "22222222-2222-4222-8222-222222222222";

function buildRepository(overrides: Partial<VoiceBriefsRepository> = {}): VoiceBriefsRepository {
  return {
    countActiveConversationsSince: vi.fn().mockResolvedValue(3),
    countUnassignedPriorityLeads: vi.fn().mockResolvedValue(1),
    countNurtureLeads: vi.fn().mockResolvedValue(2),
    listRecentLeadActivity: vi.fn().mockResolvedValue([{
      leadId,
      leadName: "Sarah Chen",
      status: "qualified",
      score: 84,
      lastMessageAt: "2026-05-09T15:40:00.000Z",
    }]),
    listPendingVoiceHandoffs: vi.fn().mockResolvedValue([{
      id: "33333333-3333-4333-8333-333333333333",
      leadId,
      callerName: "Sarah Chen",
      summary: "Asked for this weekend callback.",
      urgency: "hot",
    }]),
    listOpenShowingTasks: vi.fn().mockResolvedValue([{
      id: "44444444-4444-4444-8444-444444444444",
      leadId,
      title: "Approve showing request for Sarah",
      status: "open",
      requestedStartAt: "2026-05-10T19:00:00.000Z",
      requestedEndAt: "2026-05-10T20:00:00.000Z",
    }]),
    findLeadSnapshot: vi.fn().mockResolvedValue({
      id: leadId,
      name: "Sarah Chen",
      status: "appointment_booked",
      targetArea: "Houston Heights",
      timeline: "this month",
      budgetMin: 550000,
      budgetMax: 700000,
      lastMessageAt: "2026-05-09T15:40:00.000Z",
    }),
    findLatestConversationSnippet: vi.fn().mockResolvedValue({
      body: "We can do Saturday at noon.",
      occurredAt: "2026-05-09T15:40:00.000Z",
    }),
    findLatestLeadEventSnippet: vi.fn().mockResolvedValue(null),
    findShowingContext: vi.fn().mockResolvedValue({
      task: {
        id: "44444444-4444-4444-8444-444444444444",
        leadId,
        title: "Approve showing request for Sarah",
        status: "open",
        requestedStartAt: "2026-05-10T19:00:00.000Z",
        requestedEndAt: "2026-05-10T20:00:00.000Z",
      },
      listing: {
        id: "55555555-5555-4555-8555-555555555555",
        address: "1234 River Oaks Blvd",
        price: 680000,
      },
    }),
    createDebriefConversationMessage: vi.fn().mockResolvedValue("66666666-6666-4666-8666-666666666666"),
    createFollowUpTask: vi.fn().mockResolvedValue("77777777-7777-4777-8777-777777777777"),
    updateLeadStatus: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("voice briefs", () => {
  it("builds a daily brief with summary metrics", async () => {
    const result = await buildVoiceDailyBrief({
      workspaceId,
      workspaceName: "Harwick HQ",
      repository: buildRepository(),
      now: () => new Date("2026-05-09T16:00:00.000Z"),
    });

    expect(result.summary).toMatchObject({
      activeConversationsLastHour: 3,
      unassignedPriorityLeads: 1,
      nurtureLeads: 2,
      pendingVoiceHandoffs: 1,
      openShowingTasks: 1,
    });
    expect(result.highlights.length).toBeGreaterThan(0);
  });

  it("returns null when showing brief lead does not exist", async () => {
    const result = await buildVoiceShowingBrief({
      workspaceId,
      query: { leadId },
      repository: buildRepository({
        findLeadSnapshot: vi.fn().mockResolvedValue(null),
      }),
    });

    expect(result).toBeNull();
  });

  it("records showing debrief, updates status, and creates follow-up work", async () => {
    const updateLeadStatus = vi.fn<VoiceBriefsRepository["updateLeadStatus"]>().mockResolvedValue(undefined);
    const createDebriefConversationMessage = vi.fn<VoiceBriefsRepository["createDebriefConversationMessage"]>()
      .mockResolvedValue("66666666-6666-4666-8666-666666666666");
    const result = await submitVoiceShowingDebrief({
      workspaceId,
      workspaceName: "Harwick HQ",
      request: {
        leadId,
        debrief: "Lead asked for lender intro and wants next steps tonight.",
        outcome: "went_well",
      },
      repository: buildRepository({ updateLeadStatus, createDebriefConversationMessage }),
      now: () => new Date("2026-05-09T16:00:00.000Z"),
    });

    expect(result).not.toBeNull();
    expect(result?.statusUpdatedTo).toBe("active_client");
    expect(result?.followUpTaskId).toBe("77777777-7777-4777-8777-777777777777");
    expect(updateLeadStatus).toHaveBeenCalledTimes(1);
    expect(createDebriefConversationMessage).toHaveBeenCalledTimes(1);
  });
});
