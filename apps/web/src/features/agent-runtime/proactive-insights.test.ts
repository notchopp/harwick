import type { HarwickWorkItemCreate } from "@realty-ops/core";
import { describe, expect, it, vi } from "vitest";
import {
  surfaceProactiveInsights,
  type AmbiguousInboundEvent,
  type DormantLead,
  type ProactiveInsightRepository,
  type UnassignedPriorityLead,
  type WorkspaceMemoryPattern,
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
  workspacePatterns?: WorkspaceMemoryPattern[];
  existingSignalKeys?: Set<string>;
  created?: HarwickWorkItemCreate[];
}): ProactiveInsightRepository {
  return {
    listAmbiguousInboundEvents: vi.fn(() => Promise.resolve(params.ambiguousEvents ?? [])),
    listUnassignedPriorityLeads: vi.fn(() => Promise.resolve(params.unassignedLeads ?? [])),
    listDormantLeads: vi.fn(() => Promise.resolve(params.dormantLeads ?? [])),
    listWorkspaceMemoryPatterns: vi.fn(() => Promise.resolve(params.workspacePatterns ?? [])),
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
    });

    const report = await surfaceProactiveInsights({
      repository,
      now: () => new Date("2026-05-05T12:00:00.000Z"),
      batchSize: 10,
      dormantLeadDays: 5,
    });

    expect(report).toEqual({
      scanned: 4,
      created: 4,
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
        type: "insight",
        targetRole: "team_lead",
        targetMemberId: null,
        priority: "high",
        title: "Priority lead needs assignment",
      }),
      expect.objectContaining({
        type: "insight",
        targetRole: null,
        targetMemberId: agentId,
        title: "Lead has gone quiet",
      }),
      expect.objectContaining({
        type: "insight",
        targetRole: "team_lead",
        targetMemberId: null,
        priority: "high",
        title: "Workspace pattern needs review",
      }),
    ]);
    expect(created.map((item) => item.payload["signalType"])).toEqual([
      "lead_classification_needs_review",
      "unassigned_priority_lead",
      "dormant_active_lead",
      "workspace_memory_pattern",
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
      skippedExisting: 1,
      errors: 0,
    });
    expect(created).toHaveLength(0);
  });
});
