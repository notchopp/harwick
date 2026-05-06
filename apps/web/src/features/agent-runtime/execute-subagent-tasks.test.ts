import type { HarwickWorkItemCreate } from "@realty-ops/core";
import { describe, expect, it, vi } from "vitest";
import {
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

describe("executeHarwickSubagentTasks", () => {
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
