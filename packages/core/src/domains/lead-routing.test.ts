import { describe, expect, it } from "vitest";
import { decideLeadRouting, type AgentRoutingProfile } from "./lead-routing.js";

const leadId = "123e4567-e89b-12d3-a456-426614174001";
const workspaceId = "123e4567-e89b-12d3-a456-426614174000";
const ademolaId = "123e4567-e89b-12d3-a456-426614174010";
const sarahId = "123e4567-e89b-12d3-a456-426614174011";
const ariId = "123e4567-e89b-12d3-a456-426614174012";

const sarahProfile: AgentRoutingProfile = {
  memberId: sarahId,
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
};

const agents: AgentRoutingProfile[] = [
  sarahProfile,
  {
    memberId: ariId,
    displayName: "Ari M.",
    roleLabel: "luxury buyer agent",
    areas: ["River Oaks", "Memorial"],
    propertyTypes: ["luxury", "single_family"],
    leadTypes: ["buyer", "seller"],
    budgetMin: 900_000,
    budgetMax: null,
    activeLeadCount: 3,
    maxActiveLeads: 10,
    acceptsNewLeads: true,
    notificationPreference: "app",
  },
];

describe("decideLeadRouting", () => {
  it("routes a qualified lead to the best area and specialty match while preserving source owner credit", () => {
    expect(decideLeadRouting({
      qualification: {
        leadId,
        workspaceId,
        leadType: "buyer",
        targetArea: "Katy",
        propertyType: "new_construction",
        budgetMin: 450_000,
        budgetMax: 520_000,
        timeline: "60 days",
        financingStatus: "preapproved",
        score: 82,
        sourceOwnerMemberId: ademolaId,
      },
      agents,
      escalationMemberId: ademolaId,
      roundRobinCursorMemberId: null,
    })).toMatchObject({
      status: "assigned",
      assignedMemberId: sarahId,
      assignedDisplayName: "Sarah K.",
      sourceOwnerMemberId: ademolaId,
      escalationMemberId: null,
      taskLabel: "new qualified lead for Sarah K.",
    });
  });

  it("holds low-information leads for more qualification before assignment", () => {
    expect(decideLeadRouting({
      qualification: {
        leadId,
        workspaceId,
        leadType: "unknown",
        targetArea: null,
        propertyType: null,
        budgetMin: null,
        budgetMax: null,
        timeline: null,
        financingStatus: "unknown",
        score: 28,
        sourceOwnerMemberId: null,
      },
      agents,
      escalationMemberId: ademolaId,
      roundRobinCursorMemberId: null,
    })).toMatchObject({
      status: "hold_for_qualification",
      assignedMemberId: null,
      taskLabel: "keep qualifying before assignment",
    });
  });

  it("escalates to the team lead when no available agent cleanly matches", () => {
    expect(decideLeadRouting({
      qualification: {
        leadId,
        workspaceId,
        leadType: "renter",
        targetArea: "Midtown",
        propertyType: "lease",
        budgetMin: 2_000,
        budgetMax: 3_000,
        timeline: "now",
        financingStatus: "unknown",
        score: 76,
        sourceOwnerMemberId: ademolaId,
      },
      agents,
      escalationMemberId: ademolaId,
      roundRobinCursorMemberId: null,
    })).toMatchObject({
      status: "unrouted",
      assignedMemberId: null,
      escalationMemberId: ademolaId,
      taskLabel: "owner review needed",
    });
  });

  it("uses round robin only as a tie breaker between equally matched agents", () => {
    const tiedAgents: AgentRoutingProfile[] = [
      sarahProfile,
      {
        ...sarahProfile,
        memberId: ariId,
        displayName: "Ari M.",
        activeLeadCount: 4,
      },
    ];

    expect(decideLeadRouting({
      qualification: {
        leadId,
        workspaceId,
        leadType: "buyer",
        targetArea: "Katy",
        propertyType: "new_construction",
        budgetMin: 450_000,
        budgetMax: 520_000,
        timeline: "60 days",
        financingStatus: "preapproved",
        score: 82,
        sourceOwnerMemberId: ademolaId,
      },
      agents: tiedAgents,
      escalationMemberId: ademolaId,
      roundRobinCursorMemberId: sarahId,
    })).toMatchObject({
      status: "assigned",
      assignedMemberId: ariId,
      assignedDisplayName: "Ari M.",
    });
  });
});
