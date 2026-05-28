import { describe, expect, it, vi } from "vitest";
import type { LeadsPageRepository } from "./leads-data";
import { loadLeadsPageData } from "./leads-data";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";

function buildRepository(): LeadsPageRepository {
  return {
    listLeads: vi.fn().mockResolvedValue([
      {
        id: "33333333-3333-4333-8333-333333333333",
        workspace_id: workspaceId,
        status: "new",
        source_channel: "instagram_comment",
        source_provider_id: "ig-1",
        source_post_id: null,
        source_comment_id: "comment-1",
        instagram_user_id: "user-1",
        instagram_username: "price_only",
        full_name: null,
        phone: null,
        email: null,
        lead_type: "unknown",
        intent: "unknown",
        timeline: null,
        budget_min: null,
        budget_max: null,
        target_area: null,
        financing_status: "unknown",
        score: 0,
        assigned_agent_id: null,
        follow_up_boss_contact_id: null,
        last_message_at: "2026-04-30T12:14:00.000Z",
        next_followup_at: null,
        created_at: "2026-04-30T12:10:00.000Z",
        updated_at: "2026-04-30T12:14:00.000Z",
      },
      {
        id: "44444444-4444-4444-8444-444444444444",
        workspace_id: workspaceId,
        status: "qualified",
        source_channel: "instagram_dm",
        source_provider_id: "ig-2",
        source_post_id: null,
        source_comment_id: null,
        instagram_user_id: "user-2",
        instagram_username: "marcus_t",
        full_name: "Marcus Thompson",
        phone: null,
        email: null,
        lead_type: "buyer",
        intent: "medium",
        timeline: "30-60 days",
        budget_min: 800000,
        budget_max: 900000,
        target_area: "Coral Gables",
        financing_status: "preapproved",
        score: 72,
        assigned_agent_id: memberId,
        follow_up_boss_contact_id: "fub-1",
        last_message_at: "2026-04-30T12:14:00.000Z",
        next_followup_at: null,
        created_at: "2026-04-30T12:10:00.000Z",
        updated_at: "2026-04-30T12:14:00.000Z",
      },
      {
        id: "55555555-5555-4555-8555-555555555555",
        workspace_id: workspaceId,
        status: "nurture",
        source_channel: "facebook_dm",
        source_provider_id: "fb-1",
        source_post_id: null,
        source_comment_id: null,
        instagram_user_id: null,
        instagram_username: null,
        full_name: "Tonya Williams",
        phone: null,
        email: null,
        lead_type: "buyer",
        intent: "low",
        timeline: null,
        budget_min: null,
        budget_max: null,
        target_area: "Waterfront",
        financing_status: "unknown",
        score: 24,
        assigned_agent_id: null,
        follow_up_boss_contact_id: null,
        last_message_at: "2026-04-30T12:14:00.000Z",
        next_followup_at: "2026-05-01T12:14:00.000Z",
        created_at: "2026-04-30T12:10:00.000Z",
        updated_at: "2026-04-30T12:14:00.000Z",
      },
    ]),
    listWorkspaceMembers: vi.fn().mockResolvedValue([
      {
        id: memberId,
        display_name: "Sarah Kim",
        role: "agent",
      },
    ]),
    listListingFacts: vi.fn().mockResolvedValue([]),
    findLatestLeadMessage: vi.fn().mockImplementation(({ leadId }) => {
      return Promise.resolve(
        leadId === "44444444-4444-4444-8444-444444444444" ? "Is this still available?" : "Following up",
      );
    }),
    findLatestSocialReviewForLead: vi.fn().mockImplementation(({ leadId }) => {
      return Promise.resolve(
        leadId === "44444444-4444-4444-8444-444444444444"
          ? {
              id: "66666666-6666-4666-8666-666666666666",
              automationMode: "human_takeover",
              automationReason: "agent is replying live",
            }
          : null,
      );
    }),
    loadLeadTimeline: vi.fn().mockResolvedValue([]),
  };
}

describe("loadLeadsPageData", () => {
  it("keeps only actionable Harwick leads in the inbox", async () => {
    const data = await loadLeadsPageData({
      workspaceId,
      viewer: {
        memberId,
        role: "admin",
      },
      repository: buildRepository(),
    });

    expect(data.items.map((item) => item.name)).toEqual([
      "Marcus Thompson",
      "Tonya Williams",
    ]);
    expect(data.items.map((item) => item.stage)).toEqual([
      "hot",
      "nurture",
    ]);
    expect(data.items[0]).toMatchObject({
      assignedMemberId: memberId,
      reviewId: "66666666-6666-4666-8666-666666666666",
      automationMode: "human_takeover",
      automationReason: "agent is replying live",
    });
  });

  it("keeps agent-visible leads scoped to the assigned member as a defense-in-depth check", async () => {
    const data = await loadLeadsPageData({
      workspaceId,
      viewer: {
        memberId,
        role: "agent",
      },
      repository: buildRepository(),
    });

    expect(data.items.map((item) => item.name)).toEqual(["Marcus Thompson"]);
  });
});
