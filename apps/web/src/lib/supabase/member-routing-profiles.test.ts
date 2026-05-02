import { describe, expect, it } from "vitest";
import { mapRowToAgentRoutingProfile } from "./member-routing-profiles";
import type { MemberRoutingProfileRow } from "./database.types";

const memberId = "123e4567-e89b-12d3-a456-426614174010";
const workspaceId = "123e4567-e89b-12d3-a456-426614174000";

describe("mapRowToAgentRoutingProfile", () => {
  it("maps a routing profile row to AgentRoutingProfile domain model", () => {
    const row: MemberRoutingProfileRow = {
      id: "123e4567-e89b-12d3-a456-426614174099",
      workspace_id: workspaceId,
      member_id: memberId,
      role_label: "new construction specialist",
      areas: ["Katy", "Cypress"],
      property_types: ["new_construction", "single_family"],
      lead_types: ["buyer"],
      budget_min: 300_000,
      budget_max: 750_000,
      max_active_leads: 12,
      accepts_new_leads: true,
      notification_preference: "sms",
      created_at: "2026-05-02T00:00:00Z",
      updated_at: "2026-05-02T00:00:00Z",
    };

    const result = mapRowToAgentRoutingProfile({
      profile: row,
      displayName: "Sarah K.",
      activeLeadCount: 4,
    });

    expect(result).toMatchObject({
      memberId,
      displayName: "Sarah K.",
      roleLabel: "new construction specialist",
      areas: ["Katy", "Cypress"],
      propertyTypes: ["new_construction", "single_family"],
      leadTypes: ["buyer"],
      budgetMin: 300_000,
      budgetMax: 750_000,
      activeLeadCount: 4,
      maxActiveLeads: 12,
      acceptsNewLeads: true,
      notificationPreference: "sms",
    });
  });

  it("filters out unknown lead types when mapping", () => {
    const row: MemberRoutingProfileRow = {
      id: "123e4567-e89b-12d3-a456-426614174099",
      workspace_id: workspaceId,
      member_id: memberId,
      role_label: "generalist",
      areas: ["Houston"],
      property_types: ["single_family"],
      lead_types: ["buyer", "unknown", "seller"],
      budget_min: null,
      budget_max: null,
      max_active_leads: 8,
      accepts_new_leads: true,
      notification_preference: "app",
      created_at: "2026-05-02T00:00:00Z",
      updated_at: "2026-05-02T00:00:00Z",
    };

    const result = mapRowToAgentRoutingProfile({
      profile: row,
      displayName: "Agent X",
      activeLeadCount: 0,
    });

    expect(result.leadTypes).toEqual(["buyer", "seller"]);
    expect(result.leadTypes).not.toContain("unknown");
  });

  it("handles null budget min and max", () => {
    const row: MemberRoutingProfileRow = {
      id: "123e4567-e89b-12d3-a456-426614174099",
      workspace_id: workspaceId,
      member_id: memberId,
      role_label: "all markets",
      areas: ["Houston"],
      property_types: ["single_family", "condo"],
      lead_types: ["buyer"],
      budget_min: null,
      budget_max: null,
      max_active_leads: 10,
      accepts_new_leads: true,
      notification_preference: "email",
      created_at: "2026-05-02T00:00:00Z",
      updated_at: "2026-05-02T00:00:00Z",
    };

    const result = mapRowToAgentRoutingProfile({
      profile: row,
      displayName: "Agent Y",
      activeLeadCount: 2,
    });

    expect(result.budgetMin).toBeNull();
    expect(result.budgetMax).toBeNull();
  });
});
