import { describe, expect, it } from "vitest";

import type {
  RecentLeadItem,
  RoutingDeskItem,
  TeamPresenceMember,
} from "@realty-ops/core";

import {
  buildHarwickRecentLeadSummary,
  buildHarwickRoutingSummary,
  buildHarwickTeamSummary,
} from "./harwick-assistant-context";

describe("Harwick assistant context summaries", () => {
  it("keeps recent lead summaries action-oriented when a lead is unassigned", () => {
    const lead: RecentLeadItem = {
      id: "11111111-1111-1111-1111-111111111111",
      workspaceId: "22222222-2222-2222-2222-222222222222",
      name: "@ava",
      initials: "A",
      source: "instagram",
      sourceLabel: "Instagram",
      channelLabel: "DM",
      stage: "review",
      stageLabel: "Owner review",
      lastTouchAt: "2026-05-13T12:00:00.000Z",
      lastTouchLabel: "12m ago",
      assignedDisplayName: null,
    };

    expect(buildHarwickRecentLeadSummary(lead)).toBe("@ava — Owner review · Instagram DM · last touch 12m ago · needs routing");
  });

  it("summarizes routing calls without raw assignment noise", () => {
    const item: RoutingDeskItem = {
      leadId: "11111111-1111-1111-1111-111111111111",
      workspaceId: "22222222-2222-2222-2222-222222222222",
      leadName: "Ava",
      summary: "buyer, Bethesda, $700k-$850k, this month",
      source: "Instagram DM",
      sourceOwnerLabel: "workspace",
      qualification: {
        leadId: "11111111-1111-1111-1111-111111111111",
        workspaceId: "22222222-2222-2222-2222-222222222222",
        leadType: "buyer",
        targetArea: "Bethesda",
        propertyType: "single_family",
        budgetMin: 700000,
        budgetMax: 850000,
        timeline: "this month",
        financingStatus: "preapproved",
        score: 82,
        sourceOwnerMemberId: null,
      },
      decision: {
        status: "assigned",
        assignedMemberId: "33333333-3333-3333-3333-333333333333",
        assignedDisplayName: "Sarah",
        sourceOwnerMemberId: null,
        escalationMemberId: null,
        matchScore: 88,
        taskLabel: "Route to Sarah",
        reasons: ["Bethesda coverage and lower active workload"],
      },
    };

    expect(buildHarwickRoutingSummary(item)).toBe(
      "Ava — recommend Sarah · why Bethesda coverage and lower active workload · buyer, Bethesda, $700k-$850k, this month · Instagram DM",
    );
  });

  it("includes workload and active lead pressure in team summaries", () => {
    const member: TeamPresenceMember = {
      id: "11111111-1111-1111-1111-111111111111",
      workspaceId: "22222222-2222-2222-2222-222222222222",
      activeLeadCount: 4,
      avatarUrl: null,
      initials: "SC",
      lastSeen: "active now",
      lastSeenAt: "2026-05-13T12:00:00.000Z",
      name: "Sarah Chen",
      openWork: 3,
      role: "agent",
      roleLabel: "agent",
      status: "online",
    };

    expect(buildHarwickTeamSummary(member)).toBe(
      "Sarah Chen — agent · online · 3 open work · 4 active leads · active now",
    );
  });
});
