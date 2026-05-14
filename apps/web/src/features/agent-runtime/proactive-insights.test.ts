import type { HarwickWorkItemCreate } from "@realty-ops/core";
import { describe, expect, it, vi } from "vitest";
import {
  surfaceProactiveInsights,
  type AmbiguousInboundEvent,
  type CrossChannelLeadSignal,
  type DormantLead,
  type ClosedWonLeadOpportunity,
  type ProactiveInsightRepository,
  type SocialLifecycleOpportunity,
  type StalledShowingApproval,
  type UnassignedPriorityLead,
  type VoicePostCallOpportunity,
  type WorkspaceMemoryPattern,
  type WorkspaceMemoryReviewStats,
} from "./proactive-insights";

const workspaceId = "00000000-0000-0000-0000-000000000001";
const leadId = "00000000-0000-0000-0000-000000000002";
const agentId = "00000000-0000-0000-0000-000000000003";
const hotLeadId = "00000000-0000-0000-0000-000000000004";
const dormantLeadId = "00000000-0000-0000-0000-000000000005";

function createRepository(params: {
    ambiguousEvents?: AmbiguousInboundEvent[];
    unassignedLeads?: UnassignedPriorityLead[];
    dormantLeads?: DormantLead[];
    socialLifecycleSignals?: SocialLifecycleOpportunity[];
    crossChannelSignals?: CrossChannelLeadSignal[];
    voicePostCallSignals?: VoicePostCallOpportunity[];
    stalledShowingApprovals?: StalledShowingApproval[];
    closedWonLeads?: ClosedWonLeadOpportunity[];
    workspacePatterns?: WorkspaceMemoryPattern[];
    memoryReviewStats?: WorkspaceMemoryReviewStats[];
    existingSignalKeys?: Set<string>;
    created?: HarwickWorkItemCreate[];
  }): ProactiveInsightRepository {
  return {
    listAmbiguousInboundEvents: vi.fn(() => Promise.resolve(params.ambiguousEvents ?? [])),
    listUnassignedPriorityLeads: vi.fn(() => Promise.resolve(params.unassignedLeads ?? [])),
    listDormantLeads: vi.fn(() => Promise.resolve(params.dormantLeads ?? [])),
    listSocialLifecycleOpportunities: vi.fn(() => Promise.resolve(params.socialLifecycleSignals ?? [])),
    listCrossChannelLeadSignals: vi.fn(() => Promise.resolve(params.crossChannelSignals ?? [])),
    listVoicePostCallOpportunities: vi.fn(() => Promise.resolve(params.voicePostCallSignals ?? [])),
    listStalledShowingApprovals: vi.fn(() => Promise.resolve(params.stalledShowingApprovals ?? [])),
    listClosedWonLeadOpportunities: vi.fn(() => Promise.resolve(params.closedWonLeads ?? [])),
    listWorkspaceMemoryPatterns: vi.fn(() => Promise.resolve(params.workspacePatterns ?? [])),
    listWorkspaceMemoryReviewStats: vi.fn(() => Promise.resolve(params.memoryReviewStats ?? [])),
    findOpenInsightBySignalKey: vi.fn((input: { workspaceId: string; signalKey: string }) =>
      Promise.resolve(params.existingSignalKeys?.has(input.signalKey) === true ? { id: "existing-item" } : null)
    ),
    createWorkItem: vi.fn((item: HarwickWorkItemCreate) => {
      params.created?.push(item);
      return Promise.resolve({ workItemId: "work-item-id" });
    }),
  };
}

describe("surfaceProactiveInsights", () => {
  it("creates role and member-targeted insight work items from live signals", async () => {
    const created: HarwickWorkItemCreate[] = [];
    const repository = createRepository({
      created,
      ambiguousEvents: [{
        id: "lead-event-1",
        workspaceId,
        leadId,
        text: "Maybe. How much?",
        occurredAt: "2026-05-05T12:00:00.000Z",
        sourceChannel: "instagram_dm",
        confidence: 0.42,
        reasonCode: "ambiguous_intent",
        leadHint: "buyer",
      }],
      unassignedLeads: [{
        id: hotLeadId,
        workspaceId,
        status: "hot",
        score: 82,
        leadType: "buyer",
        fullName: "Sarah Jones",
        targetArea: "Katy",
        timeline: "this month",
        lastMessageAt: "2026-05-05T11:00:00.000Z",
      }],
      dormantLeads: [{
        id: dormantLeadId,
        workspaceId,
        status: "qualified",
        score: 64,
        leadType: "seller",
        fullName: "Jordan Lee",
        targetArea: "Houston",
        timeline: "summer",
        lastMessageAt: "2026-04-29T12:00:00.000Z",
        assignedAgentId: agentId,
      }],
      workspacePatterns: [{
        id: "00000000-0000-0000-0000-000000000006",
        workspaceId,
        memoryType: "routing",
        title: "Noah is closing Katy buyers better than default routing",
        body: "Operators keep moving high-budget Katy buyers to Noah after Harwick suggests other agents.",
        source: "distillation_worker",
        confidence: 0.86,
        lastObservedAt: "2026-05-05T10:00:00.000Z",
        updatedAt: "2026-05-05T10:05:00.000Z",
      }],
      memoryReviewStats: [{
        workspaceId,
        pendingCount: 6,
        approvedCount: 2,
        dismissedCount: 0,
        latestObservedAt: "2026-05-05T11:30:00.000Z",
      }],
    });

    const report = await surfaceProactiveInsights({
      repository,
      now: () => new Date("2026-05-05T12:00:00.000Z"),
      batchSize: 10,
      dormantLeadDays: 5,
    });

    expect(report).toEqual({
      scanned: 5,
      created: 5,
      refined: 0,
      skippedExisting: 0,
      errors: 0,
    });
    expect(created).toEqual([
      expect.objectContaining({
        type: "insight",
        targetRole: "operator",
        targetMemberId: null,
        title: "Review ambiguous inbound",
      }),
      expect.objectContaining({
        type: "approval",
        targetRole: "team_lead",
        targetMemberId: null,
        priority: "high",
        title: "Priority lead needs assignment",
      }),
      expect.objectContaining({
        type: "approval",
        targetRole: null,
        targetMemberId: agentId,
        title: "Lead has gone quiet",
      }),
      expect.objectContaining({
        type: "approval",
        targetRole: "team_lead",
        targetMemberId: null,
        priority: "high",
        title: "Workspace pattern needs review",
      }),
      expect.objectContaining({
        type: "insight",
        targetRole: "team_lead",
        targetMemberId: null,
        priority: "normal",
        title: "Workspace memory review is backing up",
      }),
    ]);
    expect(created.map((item) => item.payload["signalType"])).toEqual([
      "lead_classification_needs_review",
      "unassigned_priority_lead",
      "dormant_active_lead",
      "workspace_memory_pattern",
      "workspace_memory_review_quality",
    ]);
  });

  it("does not duplicate open insights for the same signal key", async () => {
    const created: HarwickWorkItemCreate[] = [];
    const repository = createRepository({
      created,
      existingSignalKeys: new Set([`unassigned_priority_lead:${hotLeadId}:hot`]),
      unassignedLeads: [{
        id: hotLeadId,
        workspaceId,
        status: "hot",
        score: 82,
        leadType: "buyer",
        fullName: "Sarah Jones",
        targetArea: "Katy",
        timeline: "this month",
        lastMessageAt: "2026-05-05T11:00:00.000Z",
      }],
    });

    const report = await surfaceProactiveInsights({
      repository,
      now: () => new Date("2026-05-05T12:00:00.000Z"),
    });

    expect(report).toEqual({
      scanned: 1,
      created: 0,
      refined: 0,
      skippedExisting: 1,
      errors: 0,
    });
    expect(created).toHaveLength(0);
  });

  it("uses small-model narrative refinement when provided", async () => {
    const created: HarwickWorkItemCreate[] = [];
    const repository = createRepository({
      created,
      unassignedLeads: [{
        id: hotLeadId,
        workspaceId,
        status: "hot",
        score: 82,
        leadType: "buyer",
        fullName: "Sarah Jones",
        targetArea: "Katy",
        timeline: "this month",
        lastMessageAt: "2026-05-05T11:00:00.000Z",
      }],
    });
    const intelligenceClient = {
      refineWorkItem: vi.fn(() => Promise.resolve({
        title: "Route Sarah while the signal is warm",
        summary: "Sarah is hot, scored 82, and has no assigned agent.",
        recommendedAction: "Pick the best available Katy agent",
        reason: "The lead is qualified enough to route now.",
        priority: "urgent" as const,
        targetRole: "team_lead" as const,
        notification: {
          level: "interrupt" as const,
          mode: "interrupt_now" as const,
          reason: "This hot unassigned lead should interrupt the routing owner.",
        },
        audienceReason: "This belongs with the team lead because assignment is still unresolved.",
      })),
    };

    const report = await surfaceProactiveInsights({
      repository,
      intelligenceClient,
      now: () => new Date("2026-05-05T12:00:00.000Z"),
    });

    expect(report).toEqual({
      scanned: 1,
      created: 1,
      refined: 1,
      skippedExisting: 0,
      errors: 0,
    });
    expect(created[0]).toEqual(expect.objectContaining({
      type: "approval",
      title: "Route Sarah while the signal is warm",
      summary: "Sarah is hot, scored 82, and has no assigned agent.",
      recommendedAction: "Pick the best available Katy agent",
      reason: "The lead is qualified enough to route now.",
      priority: "urgent",
    }));
    expect(created[0]?.payload["intelligence"]).toMatchObject({
      source: "small_model",
      notification: {
        mode: "interrupt_now",
      },
    });
  });

  it("surfaces lifecycle, identity, and voice cognition opportunities on the same work-item spine", async () => {
    const created: HarwickWorkItemCreate[] = [];
    const repository = createRepository({
      created,
      socialLifecycleSignals: [{
        id: leadId,
        workspaceId,
        status: "engaged",
        score: 61,
        leadType: "buyer",
        fullName: "Avery Stone",
        targetArea: "Houston",
        timeline: "30 days",
        lastMessageAt: "2026-05-05T11:00:00.000Z",
        assignedAgentId: null,
        sourceChannel: "instagram_dm",
        trigger: "post_message",
        latestEventAt: "2026-05-05T11:00:00.000Z",
        sourceCommentId: null,
      }],
      crossChannelSignals: [{
        workspaceId,
        leadId,
        fullName: "Avery Stone",
        assignedAgentId: null,
        leadStatus: "qualified",
        channels: ["instagram_comment", "instagram_dm", "voice"],
        latestOccurredAt: "2026-05-05T11:30:00.000Z",
      }],
      voicePostCallSignals: [{
        workspaceId,
        handoffId: "00000000-0000-0000-0000-000000000007",
        leadId,
        callerName: "Avery Stone",
        summary: "Caller wants to tour this week and asked about financing options.",
        urgency: "high",
        createdAt: "2026-05-05T11:45:00.000Z",
        targetArea: "Houston",
        timeline: "this week",
        budget: "$500k-$650k",
        financingStatus: "prequalified",
        leadType: "buyer",
      }],
    });

    const report = await surfaceProactiveInsights({
      repository,
      now: () => new Date("2026-05-05T12:00:00.000Z"),
    });

    expect(report).toEqual({
      scanned: 3,
      created: 3,
      refined: 0,
      skippedExisting: 0,
      errors: 0,
    });
    expect(created.map((item) => item.payload["signalType"])).toEqual([
      "social_lifecycle_trigger",
      "cross_channel_identity_signal",
      "voice_post_call_cognition",
    ]);
    expect(created[0]).toEqual(expect.objectContaining({
      title: "Social conversation needs next step",
      targetRole: "operator",
    }));
    expect(created[1]).toEqual(expect.objectContaining({
      title: "Lead is active across multiple channels",
      priority: "high",
    }));
    expect(created[2]).toEqual(expect.objectContaining({
      title: "Voice handoff needs post-call brief",
      targetRole: "team_lead",
    }));
  });

  it("expands the feed with stalled showing approvals and post-close follow-up cues", async () => {
    const created: HarwickWorkItemCreate[] = [];
    const repository = createRepository({
      created,
      stalledShowingApprovals: [{
        workspaceId,
        taskId: "00000000-0000-0000-0000-000000000008",
        leadId,
        leadName: "Avery Stone",
        assignedMemberId: agentId,
        taskTitle: "Approve Saturday showing",
        requestedAt: "2026-05-04T12:00:00.000Z",
        dueAt: null,
        requestedStartAt: "2026-05-10T15:00:00.000Z",
        targetArea: "Houston",
        timeline: "this week",
        sourceChannel: "instagram_dm",
      }],
      closedWonLeads: [{
        workspaceId,
        leadId,
        fullName: "Avery Stone",
        assignedAgentId: agentId,
        status: "closed_won",
        sourceChannel: "voice",
        targetArea: "Houston",
        timeline: "closed",
        closedAt: "2026-05-05T11:45:00.000Z",
      }],
    });

    const report = await surfaceProactiveInsights({
      repository,
      now: () => new Date("2026-05-05T12:00:00.000Z"),
    });

    expect(report).toEqual({
      scanned: 2,
      created: 2,
      refined: 0,
      skippedExisting: 0,
      errors: 0,
    });
    expect(created.map((item) => item.payload["signalType"])).toEqual([
      "stalled_showing_approval",
      "lead_closed_follow_up",
    ]);
    expect(created[0]).toEqual(expect.objectContaining({
      title: "Showing approval is stalled",
      targetMemberId: agentId,
    }));
    expect(created[1]).toEqual(expect.objectContaining({
      title: "Closed lead needs follow-up plan",
      targetMemberId: agentId,
    }));
  });

  it("surfaces high workspace memory dismissal rates as quality insights", async () => {
    const created: HarwickWorkItemCreate[] = [];
    const repository = createRepository({
      created,
      memoryReviewStats: [{
        workspaceId,
        pendingCount: 1,
        approvedCount: 2,
        dismissedCount: 4,
        latestObservedAt: "2026-05-05T11:30:00.000Z",
      }],
    });

    const report = await surfaceProactiveInsights({
      repository,
      now: () => new Date("2026-05-05T12:00:00.000Z"),
    });

    expect(report).toEqual({
      scanned: 1,
      created: 1,
      refined: 0,
      skippedExisting: 0,
      errors: 0,
    });
    const item = created[0];
    expect(item).toBeDefined();
    if (item === undefined) {
      throw new Error("Expected a workspace memory quality insight");
    }
    expect(item.title).toBe("Workspace memory quality needs attention");
    expect(item.priority).toBe("high");
    expect(item.targetRole).toBe("team_lead");
    expect(item.payload["signalType"]).toBe("workspace_memory_review_quality");
    expect(item.payload["dismissedPercent"]).toBe(67);
  });
});
