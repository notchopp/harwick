import { describe, expect, it } from "vitest";
import type { MemberRoutingProfileRow, WorkspaceMemberRow } from "../../lib/supabase/database.types";
import type { LeadRow } from "../../lib/supabase/leads";
import { loadRoutingDesk, type RoutingDeskRepository } from "./routing-desk";

const workspaceId = "123e4567-e89b-12d3-a456-426614174000";
const leadId = "123e4567-e89b-12d3-a456-426614174001";
const memberId = "123e4567-e89b-12d3-a456-426614174010";

function lead(overrides: Partial<LeadRow> = {}): LeadRow {
  const now = "2026-05-15T05:00:00.000Z";
  return {
    id: leadId,
    workspace_id: workspaceId,
    status: "hot",
    source_channel: "instagram_dm",
    source_provider_id: null,
    source_post_id: null,
    source_comment_id: null,
    instagram_user_id: null,
    instagram_username: "investorlead",
    full_name: "Investor Lead",
    phone: null,
    email: null,
    lead_type: "investor",
    intent: "high",
    timeline: "30 days",
    budget_min: 250_000,
    budget_max: 450_000,
    target_area: "Houston",
    financing_status: "cash",
    score: 88,
    assigned_agent_id: null,
    follow_up_boss_contact_id: null,
    last_message_at: now,
    next_followup_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function repository(): RoutingDeskRepository {
  const profile = {
    id: "123e4567-e89b-12d3-a456-426614174011",
    workspace_id: workspaceId,
    member_id: memberId,
    role_label: "investor and resale specialist",
    areas: ["Houston"],
    property_types: ["single_family", "townhome", "investment"],
    lead_types: ["investor"],
    budget_min: 150_000,
    budget_max: 600_000,
    max_active_leads: 10,
    accepts_new_leads: true,
    notification_preference: "app",
    created_at: "2026-05-15T05:00:00.000Z",
    updated_at: "2026-05-15T05:00:00.000Z",
  } as MemberRoutingProfileRow;

  return {
    listLeadsForRouting: () => Promise.resolve([lead()]),
    listMemberRoutingProfiles: () => Promise.resolve([profile]),
    listMembersByIds: () => Promise.resolve([{
      id: memberId,
      display_name: "Malik Johnson",
      role: "agent",
      role_label: "Agent",
    } satisfies Pick<WorkspaceMemberRow, "id" | "display_name" | "role" | "role_label">]),
    countActiveLeadsByMember: () => Promise.resolve(new Map([[memberId, 2]])),
  };
}

describe("loadRoutingDesk", () => {
  it("does not crash on investment routing specialties from persisted profiles", async () => {
    const result = await loadRoutingDesk({
      workspaceId,
      repository: repository(),
      limit: 3,
    });

    expect(result.agents[0]?.propertyTypes).toContain("investment");
    expect(result.items[0]?.decision.status).toBe("assigned");
    expect(result.items[0]?.decision.assignedDisplayName).toBe("Malik Johnson");
  });
});
