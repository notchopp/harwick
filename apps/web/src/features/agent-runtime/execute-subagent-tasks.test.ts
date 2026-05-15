import type { HarwickWorkItemCreate } from "@realty-ops/core";
import { describe, expect, it, vi } from "vitest";
import {
  executeHarwickSubagentTask,
  executeHarwickSubagentTasks,
  type HarwickSubagentTask,
  type HarwickSubagentTaskRepository,
} from "./execute-subagent-tasks";

const workspaceId = "00000000-0000-0000-0000-000000000001";
const leadId = "00000000-0000-0000-0000-000000000002";
const assignedMemberId = "00000000-0000-0000-0000-000000000003";

function createTask(overrides: Partial<HarwickSubagentTask> = {}): HarwickSubagentTask {
  return {
    id: "00000000-0000-0000-0000-000000000010",
    workspaceId,
    leadId,
    trajectoryId: "00000000-0000-0000-0000-000000000011",
    stepId: "00000000-0000-0000-0000-000000000012",
    subagentType: "writer",
    priority: "high",
    title: "Draft follow-up",
    instructions: "Summarize the strongest next follow-up angle.",
    payload: { source: "harwick_ai_tool" },
    createdAt: "2026-05-05T12:00:00.000Z",
    ...overrides,
  };
}

function createTaskRepository(params: {
  tasks?: HarwickSubagentTask[];
  claimed?: boolean;
  assignedMemberId?: string | null;
}): HarwickSubagentTaskRepository {
  return {
    listQueuedTasks: vi.fn(() => Promise.resolve(params.tasks ?? [createTask()])),
    markTaskRunning: vi.fn(() => Promise.resolve(params.claimed ?? true)),
    markTaskCompleted: vi.fn(() => Promise.resolve()),
    markTaskFailed: vi.fn(() => Promise.resolve()),
    resolveLeadAssignedMember: vi.fn(() => Promise.resolve(params.assignedMemberId ?? assignedMemberId)),
  };
}

// Minimal valid rich-result body for the test fixtures. Real subagents return
// 2-10 specific findings; the tests only need the schema to pass.
const richResultExtras = {
  findings: [
    {
      subject: "Lead Danielle",
      observation: "Danielle responded to last week's Oak Ave DM within 2 hours and asked about closing timeline.",
      implication: "Hot intent — same-day follow-up converts ~3x better than next-day for this profile.",
      confidence: 0.8,
    },
    {
      subject: "Lead Keisha",
      observation: "Keisha has gone 14 days without a touch after asking about financing.",
      implication: "Drop-off risk; financing questions tend to cool off after 10+ days of silence.",
      confidence: 0.7,
    },
  ],
  nextSteps: [
    {
      who: "Sarah",
      action: "Send Danielle a Calendly link with 3 Saturday showing slots for 1234 Oak Ave.",
      why: "She named the listing and the weekend specifically.",
      urgency: "now" as const,
    },
  ],
  blockers: [],
  dataGaps: [],
};

describe("executeHarwickSubagentTasks", () => {
  it("executes one known task immediately for interactive chat", async () => {
    const created: HarwickWorkItemCreate[] = [];
    const taskRepository = createTaskRepository({});
    const report = await executeHarwickSubagentTask({
      task: createTask({ title: "Deep lead research" }),
      taskRepository,
      workItemRepository: {
        findOpenInsightBySignalKey: vi.fn(() => Promise.resolve(null)),
        createWorkItem: vi.fn((item: HarwickWorkItemCreate) => {
          created.push(item);
          return Promise.resolve({ workItemId: "work-item-1" });
        }),
      },
      executorClient: {
        executeTask: vi.fn(() => Promise.resolve({
          summary: "Danielle and Keisha both need next-touch research.",
          recommendation: "Prioritize Danielle first",
          reason: "Danielle has the freshest high-intent social signal.",
          confidence: 0.78,
          priority: "high" as const,
          ...richResultExtras,
        })),
      },
      now: () => new Date("2026-05-05T12:00:00.000Z"),
    });

    expect(report).toMatchObject({
      status: "completed",
      result: {
        summary: "Danielle and Keisha both need next-touch research.",
        recommendation: "Prioritize Danielle first",
        reason: "Danielle has the freshest high-intent social signal.",
        confidence: 0.78,
        priority: "high",
      },
      surfaced: true,
    });
    expect(created[0]?.title).toBe("Subagent result: Deep lead research");
  });

  it("coerces numeric confidence returned as a model string", async () => {
    const taskRepository = createTaskRepository({});
    const report = await executeHarwickSubagentTask({
      task: createTask({ title: "Team load analysis" }),
      taskRepository,
      workItemRepository: {
        findOpenInsightBySignalKey: vi.fn(() => Promise.resolve({ id: "existing" })),
        createWorkItem: vi.fn(),
      },
      executorClient: {
        executeTask: vi.fn(() => Promise.resolve({
          summary: "Priya has the highest current load.",
          recommendation: "Shift one new lead away from Priya",
          reason: "The workload distribution is uneven.",
          confidence: "0.76",
          priority: "normal" as const,
          ...richResultExtras,
        } as never)),
      },
      now: () => new Date("2026-05-05T12:00:00.000Z"),
    });

    expect(report).toEqual(expect.objectContaining({
      status: "completed",
      surfaced: false,
    }));
    expect(report.status === "completed" ? report.result.confidence : null).toBe(0.76);
  });

  it("falls back to neutral confidence when the model returns nan", async () => {
    const taskRepository = createTaskRepository({});
    const report = await executeHarwickSubagentTask({
      task: createTask({ title: "Detailed team workload assessment" }),
      taskRepository,
      workItemRepository: {
        findOpenInsightBySignalKey: vi.fn(() => Promise.resolve({ id: "existing" })),
        createWorkItem: vi.fn(),
      },
      executorClient: {
        executeTask: vi.fn(() => Promise.resolve({
          summary: "Team load is unclear from the current payload.",
          recommendation: "Review team load manually",
          reason: "The payload has enough names for a review but no reliable load metric.",
          confidence: "nan",
          priority: "normal" as const,
          ...richResultExtras,
        } as never)),
      },
      now: () => new Date("2026-05-05T12:00:00.000Z"),
    });

    expect(report).toEqual(expect.objectContaining({
      status: "completed",
      surfaced: false,
    }));
    expect(report.status === "completed" ? report.result.confidence : null).toBe(0.5);
  });

  it("completes a queued task and surfaces its result to the assigned agent", async () => {
    const created: HarwickWorkItemCreate[] = [];
    const taskRepository = createTaskRepository({});
    const createWorkItem = vi.fn((item: HarwickWorkItemCreate) => {
      created.push(item);
      return Promise.resolve({ workItemId: "work-item-1" });
    });
    const report = await executeHarwickSubagentTasks({
      taskRepository,
      workItemRepository: {
        findOpenInsightBySignalKey: vi.fn(() => Promise.resolve(null)),
        createWorkItem,
      },
      executorClient: {
        executeTask: vi.fn(() => Promise.resolve({
          summary: "Send a concise follow-up focused on Katy timing.",
          recommendation: "Send the Katy follow-up",
          reason: "The lead has a clear location signal.",
          confidence: 0.82,
          priority: "urgent" as const,
          ...richResultExtras,
        })),
      },
      now: () => new Date("2026-05-05T12:00:00.000Z"),
    });

    expect(report).toEqual({
      scanned: 1,
      completed: 1,
      surfaced: 1,
      skippedClaimed: 0,
      skippedExisting: 0,
      failed: 0,
    });
    expect(created[0]).toEqual(expect.objectContaining({
      workspaceId,
      leadId,
      targetMemberId: assignedMemberId,
      targetRole: "agent",
      priority: "urgent",
      title: "Subagent result: Draft follow-up",
      recommendedAction: "Send the Katy follow-up",
    }));
    expect(created[0]?.payload["signalKey"]).toBe("harwick_subagent_result:00000000-0000-0000-0000-000000000010");
  });

  it("targets routing results to team leads when no assigned agent should own them", async () => {
    const created: HarwickWorkItemCreate[] = [];
    const createWorkItem = vi.fn((item: HarwickWorkItemCreate) => {
      created.push(item);
      return Promise.resolve({ workItemId: "work-item-1" });
    });
    await executeHarwickSubagentTasks({
      taskRepository: createTaskRepository({
        tasks: [createTask({
          subagentType: "routing",
          title: "Review agent fit",
        })],
      }),
      workItemRepository: {
        findOpenInsightBySignalKey: vi.fn(() => Promise.resolve(null)),
        createWorkItem,
      },
      now: () => new Date("2026-05-05T12:00:00.000Z"),
    });

    expect(created[0]).toEqual(expect.objectContaining({
      targetMemberId: null,
      targetRole: "team_lead",
      type: "approval",
      recommendedAction: "Review routing recommendation",
    }));
    expect(created[0]?.payload["actionPlan"]).toMatchObject({
      proposedToolCalls: [
        expect.objectContaining({
          tool: "route_lead",
        }),
      ],
    });
  });

  it("skips surfacing when an open insight already exists for the task", async () => {
    const createWorkItem = vi.fn();
    const report = await executeHarwickSubagentTasks({
      taskRepository: createTaskRepository({}),
      workItemRepository: {
        findOpenInsightBySignalKey: vi.fn(() => Promise.resolve({ id: "existing" })),
        createWorkItem,
      },
      now: () => new Date("2026-05-05T12:00:00.000Z"),
    });

    expect(report).toEqual({
      scanned: 1,
      completed: 1,
      surfaced: 0,
      skippedClaimed: 0,
      skippedExisting: 1,
      failed: 0,
    });
    expect(createWorkItem).not.toHaveBeenCalled();
  });

  it("marks failed tasks when execution throws", async () => {
    const taskRepository = createTaskRepository({});
    const report = await executeHarwickSubagentTasks({
      taskRepository,
      workItemRepository: {
        findOpenInsightBySignalKey: vi.fn(() => Promise.resolve(null)),
        createWorkItem: vi.fn(),
      },
      executorClient: {
        executeTask: vi.fn(() => Promise.reject(new Error("model unavailable"))),
      },
      now: () => new Date("2026-05-05T12:00:00.000Z"),
    });

    expect(report).toEqual({
      scanned: 1,
      completed: 0,
      surfaced: 0,
      skippedClaimed: 0,
      skippedExisting: 0,
      failed: 1,
    });
    expect(report.failed).toBe(1);
  });
});
