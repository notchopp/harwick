import type { HarwickLoop, HarwickWorkItemCreate } from "@realty-ops/core";
import { describe, expect, it, vi } from "vitest";
import type { HarwickLoopRepository } from "../../lib/supabase/harwick-loops";
import {
  computeNextHarwickLoopRunAt,
  executeDueHarwickLoops,
} from "./execute-harwick-loops";

const workspaceId = "00000000-0000-0000-0000-000000000001";
const memberId = "00000000-0000-0000-0000-000000000002";
const loopId = "00000000-0000-0000-0000-000000000003";

function createLoop(overrides: Partial<HarwickLoop> = {}): HarwickLoop {
  return {
    id: loopId,
    workspaceId,
    createdByMemberId: memberId,
    name: "Monday market pulse",
    instruction: "Every Monday, review workspace memories and surface the highest-signal market update.",
    triggerType: "schedule",
    scheduleSpec: "every Monday 9am",
    eventType: null,
    status: "active",
    approvalMode: "approval_required",
    outputMode: "work_item",
    toolAllowlist: ["workspace_memory.search"],
    nextRunAt: "2026-05-04T13:00:00.000Z",
    lastRunAt: null,
    lastRunStatus: null,
    createdAt: "2026-05-01T12:00:00.000Z",
    updatedAt: "2026-05-01T12:00:00.000Z",
    ...overrides,
  };
}

function createLoopRepository(params: {
  loops?: HarwickLoop[];
  runId?: string;
}): { repository: HarwickLoopRepository; completeRun: ReturnType<typeof vi.fn> } {
  const completeRun = vi.fn(() => Promise.resolve());
  const repository: HarwickLoopRepository = {
    listWorkspaceLoops: vi.fn(() => Promise.resolve([])),
    createLoop: vi.fn(() => Promise.resolve(createLoop())),
    updateLoop: vi.fn(() => Promise.resolve(createLoop())),
    listDueScheduledLoops: vi.fn(() => Promise.resolve(params.loops ?? [createLoop()])),
    createRun: vi.fn(() => Promise.resolve({
      runId: params.runId ?? "00000000-0000-0000-0000-000000000004",
    })),
    completeRun,
  };
  return { repository, completeRun };
}

describe("computeNextHarwickLoopRunAt", () => {
  it("computes interval cadences", () => {
    expect(computeNextHarwickLoopRunAt(
      "every 2 hours",
      new Date("2026-05-06T12:00:00.000Z"),
    )).toBe("2026-05-06T14:00:00.000Z");
  });

  it("computes named weekly cadences with a time", () => {
    expect(computeNextHarwickLoopRunAt(
      "every Monday 9am",
      new Date("2026-05-06T12:00:00.000Z"),
    )).toBe("2026-05-11T09:00:00.000Z");
  });
});

describe("executeDueHarwickLoops", () => {
  it("surfaces due loops as reviewable Harwick work items", async () => {
    const created: HarwickWorkItemCreate[] = [];
    const { repository: loopRepository, completeRun } = createLoopRepository({});
    const createWorkItem = vi.fn((item: HarwickWorkItemCreate) => {
      created.push(item);
      return Promise.resolve({ workItemId: "00000000-0000-0000-0000-000000000005" });
    });

    const report = await executeDueHarwickLoops({
      loopRepository,
      workItemRepository: {
        findOpenInsightBySignalKey: vi.fn(() => Promise.resolve(null)),
        createWorkItem,
      },
      plannerClient: {
        planWorkItem: vi.fn(() => Promise.resolve({
          title: "Loop due: Monday market pulse",
          summary: "Review the market pattern and decide whether to brief agents.",
          recommendedAction: "Review loop output",
          reason: "The recurring instruction is due and should be reviewed before action.",
          priority: "high" as const,
          targetRole: "team_lead" as const,
          draftBody: null,
          proposedToolCalls: [],
          agentLoopBrief: null,
        })),
      },
      now: () => new Date("2026-05-06T12:00:00.000Z"),
    });

    expect(report).toEqual({
      scanned: 1,
      completed: 1,
      surfaced: 1,
      drafted: 0,
      plannedAgentLoops: 0,
      skippedExisting: 0,
      failed: 0,
    });
    expect(created[0]).toEqual(expect.objectContaining({
      workspaceId,
      leadId: null,
      type: "approval",
      targetRole: "team_lead",
      priority: "high",
      title: "Loop due: Monday market pulse",
    }));
    expect(created[0]?.payload["signalKey"]).toBe(
      "harwick_loop_due:00000000-0000-0000-0000-000000000003:2026-05-04T13:00:00.000Z",
    );
    expect(completeRun).toHaveBeenCalledWith(expect.objectContaining({
      status: "completed",
      nextRunAt: "2026-05-11T09:00:00.000Z",
    }));
  });

  it("skips duplicate open loop work for the same scheduled occurrence", async () => {
    const createWorkItem = vi.fn();
    const { repository: loopRepository } = createLoopRepository({});

    const report = await executeDueHarwickLoops({
      loopRepository,
      workItemRepository: {
        findOpenInsightBySignalKey: vi.fn(() => Promise.resolve({ id: "existing" })),
        createWorkItem,
      },
      now: () => new Date("2026-05-06T12:00:00.000Z"),
    });

    expect(report).toEqual({
      scanned: 1,
      completed: 1,
      surfaced: 0,
      drafted: 0,
      plannedAgentLoops: 0,
      skippedExisting: 1,
      failed: 0,
    });
    expect(createWorkItem).not.toHaveBeenCalled();
  });

  it("marks runs failed when planning or surfacing fails", async () => {
    const { repository: loopRepository, completeRun } = createLoopRepository({});

    const report = await executeDueHarwickLoops({
      loopRepository,
      workItemRepository: {
        findOpenInsightBySignalKey: vi.fn(() => Promise.resolve(null)),
        createWorkItem: vi.fn(),
      },
      plannerClient: {
        planWorkItem: vi.fn(() => Promise.reject(new Error("small model unavailable"))),
      },
      now: () => new Date("2026-05-06T12:00:00.000Z"),
    });

    expect(report.failed).toBe(1);
    expect(completeRun).toHaveBeenCalledWith(expect.objectContaining({
      status: "failed",
      errorMessage: "small model unavailable",
      nextRunAt: "2026-05-04T13:00:00.000Z",
    }));
  });

  it("turns draft-mode loops into reviewable draft payloads", async () => {
    const created: HarwickWorkItemCreate[] = [];
    const { repository: loopRepository } = createLoopRepository({
      loops: [createLoop({
        outputMode: "draft",
        approvalMode: "auto_execute",
        name: "Closed lead thank-you",
        instruction: "Draft a thank-you message for every closed lead and suggest a 6-month check-in.",
      })],
    });

    const report = await executeDueHarwickLoops({
      loopRepository,
      workItemRepository: {
        findOpenInsightBySignalKey: vi.fn(() => Promise.resolve(null)),
        createWorkItem: vi.fn((item: HarwickWorkItemCreate) => {
          created.push(item);
          return Promise.resolve({ workItemId: "00000000-0000-0000-0000-000000000005" });
        }),
      },
      plannerClient: {
        planWorkItem: vi.fn(() => Promise.resolve({
          title: "Draft ready: closed lead thank-you",
          summary: "Harwick drafted the recurring thank-you follow-up for review.",
          recommendedAction: "Review draft",
          reason: "Closed-lead nurture should be reviewed before sending until autonomous sends are validated.",
          priority: "normal" as const,
          targetRole: "operator" as const,
          draftBody: "Thank you again for trusting us with the sale. I’ll check back in six months.",
          proposedToolCalls: [],
          agentLoopBrief: null,
        })),
      },
      now: () => new Date("2026-05-06T12:00:00.000Z"),
    });

    expect(report.drafted).toBe(1);
    expect(created[0]).toEqual(expect.objectContaining({
      type: "approval",
      recommendedAction: "Review draft",
    }));
    expect(created[0]?.payload).toMatchObject({
      outputMode: "draft",
      draftBody: "Thank you again for trusting us with the sale. I’ll check back in six months.",
      requiresOperatorApproval: true,
    });
  });

  it("turns agent-loop-mode loops into approval-first execution plans", async () => {
    const created: HarwickWorkItemCreate[] = [];
    const { repository: loopRepository } = createLoopRepository({
      loops: [createLoop({
        outputMode: "agent_loop",
        approvalMode: "auto_execute",
        name: "Friday queue review",
        instruction: "Review the work queue and decide who needs follow-up.",
      })],
    });

    const report = await executeDueHarwickLoops({
      loopRepository,
      workItemRepository: {
        findOpenInsightBySignalKey: vi.fn(() => Promise.resolve(null)),
        createWorkItem: vi.fn((item: HarwickWorkItemCreate) => {
          created.push(item);
          return Promise.resolve({ workItemId: "00000000-0000-0000-0000-000000000005" });
        }),
      },
      plannerClient: {
        planWorkItem: vi.fn(() => Promise.resolve({
          title: "Execution plan ready: Friday queue review",
          summary: "Harwick prepared the loop as a bounded agent execution plan.",
          recommendedAction: "Approve execution plan",
          reason: "The loop wants to chain work, so operator approval is required before external effects.",
          priority: "high" as const,
          targetRole: "team_lead" as const,
          draftBody: null,
          proposedToolCalls: [{
            tool: "dispatch_subagent",
            reason: "summarize stale work items",
            requiresApproval: true,
            payload: { subagentType: "research" },
          }],
          agentLoopBrief: "Review stale queue items, identify owners, and propose next steps.",
        })),
      },
      now: () => new Date("2026-05-06T12:00:00.000Z"),
    });

    expect(report.plannedAgentLoops).toBe(1);
    expect(created[0]).toEqual(expect.objectContaining({
      type: "approval",
      recommendedAction: "Approve execution plan",
    }));
    expect(created[0]?.payload).toMatchObject({
      outputMode: "agent_loop",
      agentLoopBrief: "Review stale queue items, identify owners, and propose next steps.",
      requiresOperatorApproval: true,
    });
    expect(created[0]?.payload["proposedToolCalls"]).toEqual([{
      tool: "dispatch_subagent",
      reason: "summarize stale work items",
      requiresApproval: true,
      payload: { subagentType: "research" },
    }]);
  });
});
