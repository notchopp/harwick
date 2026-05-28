import type {
  ConversationInboxThread,
  RecentLeadItem,
  RoutingDeskItem,
  TeamPresenceMember,
} from "@realty-ops/core";
import { describe, expect, it } from "vitest";
import { buildHarwickAmbientReply, buildTeamWorkspaceThreads } from "./team-page-data";

function createMember(overrides: Partial<TeamPresenceMember> = {}): TeamPresenceMember {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    workspaceId: "00000000-0000-0000-0000-000000000010",
    activeLeadCount: 6,
    avatarUrl: null,
    initials: "SC",
    lastSeen: "active now",
    lastSeenAt: "2026-05-12T13:00:00.000Z",
    name: "Sarah Chen",
    openWork: 3,
    role: "team_lead",
    roleLabel: "team lead",
    status: "online",
    ...overrides,
  };
}

function createRecentLead(overrides: Partial<RecentLeadItem> = {}): RecentLeadItem {
  return {
    id: "00000000-0000-0000-0000-000000000020",
    workspaceId: "00000000-0000-0000-0000-000000000010",
    name: "Jordan Miles",
    initials: "JM",
    source: "instagram",
    sourceLabel: "Instagram",
    channelLabel: "DM",
    stage: "qualified",
    stageLabel: "Qualified",
    lastTouchAt: "2026-05-12T12:30:00.000Z",
    lastTouchLabel: "12m ago",
    assignedDisplayName: "Sarah Chen",
    score: 80,
    ...overrides,
  };
}

function createRoutingItem(overrides: Partial<RoutingDeskItem> = {}): RoutingDeskItem {
  return {
    leadId: "00000000-0000-0000-0000-000000000020",
    workspaceId: "00000000-0000-0000-0000-000000000010",
    leadName: "Jordan Miles",
    summary: "buyer, Heights, $750k-$900k, this month",
    source: "Instagram DM",
    sourceOwnerLabel: "workspace",
    qualification: {
      leadId: "00000000-0000-0000-0000-000000000020",
      workspaceId: "00000000-0000-0000-0000-000000000010",
      leadType: "buyer",
      targetArea: "Heights",
      propertyType: null,
      budgetMin: 750000,
      budgetMax: 900000,
      timeline: "this month",
      financingStatus: "unknown",
      score: 78,
      sourceOwnerMemberId: null,
    },
    decision: {
      status: "assigned",
      assignedMemberId: "00000000-0000-0000-0000-000000000001",
      assignedDisplayName: "Sarah Chen",
      reasons: ["Sarah covers Heights and has room for one more hot lead."],
      sourceOwnerMemberId: null,
      escalationMemberId: null,
      matchScore: 92,
      taskLabel: "Route to Sarah Chen",
      candidates: [],
    },
    ...overrides,
  };
}

function createConversationThread(overrides: Partial<ConversationInboxThread> = {}): ConversationInboxThread {
  return {
    id: "00000000-0000-0000-0000-000000000030",
    workspaceId: "00000000-0000-0000-0000-000000000010",
    leadId: "00000000-0000-0000-0000-000000000020",
    reviewId: "00000000-0000-0000-0000-000000000031",
    name: "Jordan Miles",
    initials: "JM",
    lastTouchLabel: "12m ago",
    unread: true,
    preview: "Can I see anything else like this in Houston?",
    source: "instagram",
    sourceLabel: "Instagram",
    channelLabel: "DM",
    sourceContext: "Instagram DM",
    bucket: "dms",
    assignedTo: "Sarah Chen",
    stageLabel: "Qualified",
    stageTone: "qualified",
    score: 78,
    scoreLabel: "warm",
    followUpBossContactId: null,
    intentType: "buyer",
    area: "Heights",
    timeline: "this month",
    budget: "$750k-$900k",
    listingTitle: "123 Heights Blvd",
    listingDetails: "3 bed · 2 bath",
    listingStatus: "AI action ready",
    automationMode: "ai_on",
    automationReason: "safe to continue",
    aiSynthesis: null,
    messages: [{
      id: "msg-1",
      kind: "lead",
      body: "Can I see anything else like this in Houston?",
      meta: "Lead",
      occurredAt: "2026-05-12T12:30:00.000Z",
      agentTrajectoryId: null,
      agentStepId: null,
    }],
    ...overrides,
  };
}

describe("team page data", () => {
  it("builds seeded threads with core workspace rooms", () => {
    const threads = buildTeamWorkspaceThreads({
      workspaceName: "Harwick Realty",
      members: [createMember(), createMember({
        id: "00000000-0000-0000-0000-000000000002",
        initials: "MH",
        name: "Miles Hart",
        role: "agent",
        roleLabel: "agent",
        openWork: 1,
      })],
      recentLeads: [createRecentLead()],
      routing: [createRoutingItem()],
      conversations: [createConversationThread()],
      nowIso: "2026-05-12T13:15:00.000Z",
    });

    expect(threads.map((thread) => thread.title)).toEqual([
      "General",
      "Lead desk",
      "Harwick watch",
      "Sarah Chen",
      "Miles Hart",
    ]);
    expect(threads[0]?.messages.some((entry) => entry.kind === "harwick")).toBe(true);
  });

  it("answers routing questions in natural language", () => {
    const reply = buildHarwickAmbientReply({
      workspaceName: "Harwick Realty",
      members: [createMember()],
      recentLeads: [createRecentLead()],
      routing: [createRoutingItem()],
      conversations: [createConversationThread()],
      text: "Harwick who should we route next",
      threadTitle: "General",
    });

    expect(reply).toContain("Jordan Miles");
    expect(reply).toContain("Sarah");
  });
});
