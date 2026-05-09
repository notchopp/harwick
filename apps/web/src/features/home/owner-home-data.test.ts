import { describe, expect, it } from "vitest";
import type {
  ConversationInboxThread,
  HarwickHomeWorkItem,
  RoutingDeskItem,
} from "@realty-ops/core";
import { buildOwnerQueueItems, filterOwnerInboxThreads, prioritizeOwnerRoutingItems } from "./owner-home-data";

function inboxThread(overrides: Partial<ConversationInboxThread> = {}): ConversationInboxThread {
  return {
    id: "123e4567-e89b-12d3-a456-426614174000",
    workspaceId: "223e4567-e89b-12d3-a456-426614174000",
    leadId: "323e4567-e89b-12d3-a456-426614174000",
    reviewId: null,
    name: "Unknown lead",
    initials: "UL",
    lastTouchLabel: "5m",
    unread: false,
    preview: "Can I tour this place tomorrow?",
    source: "instagram",
    sourceLabel: "Instagram",
    channelLabel: "DM",
    sourceContext: "Instagram DM",
    bucket: "dms",
    assignedTo: "Owner review",
    stageLabel: "Review",
    stageTone: "review",
    score: 82,
    scoreLabel: "82 / 100",
    followUpBossContactId: null,
    intentType: "Buyer",
    area: "Houston Heights",
    timeline: "30 days",
    budget: "$650k",
    listingTitle: "123 Main",
    listingDetails: "3 bed",
    listingStatus: "active",
    automationMode: "paused_by_rule",
    automationReason: "Needs owner approval before a showing proposal.",
    aiSynthesis: null,
    messages: [],
    ...overrides,
  };
}

function routingItem(overrides: Partial<RoutingDeskItem> = {}): RoutingDeskItem {
  return {
    leadId: "423e4567-e89b-12d3-a456-426614174000",
    workspaceId: "223e4567-e89b-12d3-a456-426614174000",
    leadName: "Sarah Kim",
    summary: "buyer, Houston Heights, $650k, 30 days",
    source: "Instagram DM",
    sourceOwnerLabel: "workspace",
    qualification: {
      leadId: "423e4567-e89b-12d3-a456-426614174000",
      workspaceId: "223e4567-e89b-12d3-a456-426614174000",
      leadType: "buyer",
      targetArea: "Houston Heights",
      propertyType: null,
      budgetMin: 600000,
      budgetMax: 700000,
      timeline: "30 days",
      financingStatus: "preapproved",
      score: 76,
      sourceOwnerMemberId: null,
    },
    decision: {
      status: "unrouted",
      assignedMemberId: null,
      assignedDisplayName: null,
      sourceOwnerMemberId: null,
      escalationMemberId: null,
      matchScore: 0,
      taskLabel: "owner review needed",
      reasons: ["no available agent matched area, lead type, property type, budget, and capacity"],
    },
    ...overrides,
  };
}

function workItem(overrides: Partial<HarwickHomeWorkItem> = {}): HarwickHomeWorkItem {
  return {
    id: "523e4567-e89b-12d3-a456-426614174000",
    workspaceId: "223e4567-e89b-12d3-a456-426614174000",
    leadId: "323e4567-e89b-12d3-a456-426614174000",
    type: "insight",
    status: "pending",
    priority: "high",
    title: "Hot unassigned lead needs source-credit review",
    summary: "Harwick found a qualified lead with no assigned agent.",
    recommendedAction: "Review assignment",
    reason: "The owner should preserve source credit before routing.",
    targetMemberId: null,
    targetRole: "owner",
    createdAt: "2026-05-08T12:00:00.000Z",
    dueAt: null,
    payload: {},
    ...overrides,
  };
}

describe("owner home data", () => {
  it("keeps only owner-relevant inbox threads", () => {
    const kept = filterOwnerInboxThreads([
      inboxThread(),
      inboxThread({
        id: "223e4567-e89b-12d3-a456-426614174001",
        leadId: "323e4567-e89b-12d3-a456-426614174001",
        assignedTo: "Sarah Kim",
        stageTone: "qualified",
        automationMode: "ai_on",
      }),
    ]);

    expect(kept).toHaveLength(1);
    expect(kept[0]?.assignedTo).toBe("Owner review");
  });

  it("prioritizes unrouted routing rows ahead of assigned ones", () => {
    const sorted = prioritizeOwnerRoutingItems([
      routingItem({
        leadId: "623e4567-e89b-12d3-a456-426614174000",
        decision: {
          status: "assigned",
          assignedMemberId: "723e4567-e89b-12d3-a456-426614174000",
          assignedDisplayName: "Sarah Kim",
          sourceOwnerMemberId: null,
          escalationMemberId: null,
          matchScore: 74,
          taskLabel: "new qualified lead for Sarah Kim",
          reasons: ["area match: Houston Heights"],
        },
      }),
      routingItem(),
    ]);

    expect(sorted[0]?.decision.status).toBe("unrouted");
  });

  it("builds an owner queue around intervention and risk", () => {
    const items = buildOwnerQueueItems({
      workspaceId: "223e4567-e89b-12d3-a456-426614174000",
      conversations: {
        workspaceId: "223e4567-e89b-12d3-a456-426614174000",
        threads: [inboxThread()],
      },
      routingDesk: {
        workspaceId: "223e4567-e89b-12d3-a456-426614174000",
        agents: [],
        items: [routingItem()],
      },
      harwickWorkItems: [workItem()],
      fubConflicts: null,
      operationsFailures: null,
      operations: {
        workspaceId: "223e4567-e89b-12d3-a456-426614174000",
        openTasks: 4,
        urgentTasks: 2,
        failedJobs: 1,
        stuckJobs: 0,
        failedCrmSyncs: 0,
        providerErrors24h: 0,
        lastWorkerSeenAt: "2026-05-08T12:00:00.000Z",
      },
      readiness: {
        workspaceId: "223e4567-e89b-12d3-a456-426614174000",
        status: "degraded",
        items: [{
          key: "worker",
          status: "degraded",
          label: "Worker",
          detail: "Last heartbeat is stale.",
          updatedAt: "2026-05-08T11:00:00.000Z",
        }],
      },
    });

    expect(items[0]?.kind).toBe("operations");
    expect(items.some((item) => item.kind === "harwick")).toBe(true);
    expect(items.some((item) => item.kind === "routing")).toBe(true);
    expect(items.some((item) => item.kind === "inbox")).toBe(true);
  });
});
