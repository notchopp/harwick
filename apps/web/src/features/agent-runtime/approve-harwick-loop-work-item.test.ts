import { describe, expect, it, vi } from "vitest";
import {
  approveHarwickLoopWorkItem,
  type HarwickLoopApprovalRepository,
  type HarwickLoopWorkItemForApproval,
} from "./approve-harwick-loop-work-item";

const workspaceId = "00000000-0000-0000-0000-000000000001";
const memberId = "00000000-0000-0000-0000-000000000002";
const workItemId = "00000000-0000-0000-0000-000000000003";
const loopId = "00000000-0000-0000-0000-000000000004";

function workItem(overrides: Partial<HarwickLoopWorkItemForApproval> = {}): HarwickLoopWorkItemForApproval {
  return {
    id: workItemId,
    workspaceId,
    leadId: null,
    trajectoryId: null,
    stepId: null,
    type: "approval",
    status: "pending",
    priority: "high",
    payload: {
      signalType: "harwick_loop_due",
      signalKey: `harwick_loop_due:${loopId}:2026-05-06T12:00:00.000Z`,
      loopId,
      loopName: "Friday queue review",
      instruction: "Review stale queue items and propose the next action for each owner.",
      outputMode: "agent_loop",
      toolAllowlist: [],
      proposedToolCalls: [{
        tool: "dispatch_subagent",
        reason: "Have the research specialist summarize stale queue items.",
        requiresApproval: true,
        payload: {
          subagentType: "research",
          title: "Research stale queue items",
          instructions: "Find the stale work items and summarize who owns them.",
        },
      }],
      agentLoopBrief: "Review stale queue items.",
    },
    ...overrides,
  };
}

type MockHarwickLoopApprovalRepository = HarwickLoopApprovalRepository & {
  getLoopWorkItemForApproval: ReturnType<typeof vi.fn<HarwickLoopApprovalRepository["getLoopWorkItemForApproval"]>>;
  enqueueLoopSubagentTask: ReturnType<typeof vi.fn<HarwickLoopApprovalRepository["enqueueLoopSubagentTask"]>>;
  completeLoopWorkItemApproval: ReturnType<typeof vi.fn<HarwickLoopApprovalRepository["completeLoopWorkItemApproval"]>>;
};

function repository(item: HarwickLoopWorkItemForApproval | null): MockHarwickLoopApprovalRepository {
  return {
    getLoopWorkItemForApproval: vi.fn<HarwickLoopApprovalRepository["getLoopWorkItemForApproval"]>(() => Promise.resolve(item)),
    enqueueLoopSubagentTask: vi.fn<HarwickLoopApprovalRepository["enqueueLoopSubagentTask"]>(() => Promise.resolve({
      taskId: "00000000-0000-0000-0000-000000000005",
    })),
    completeLoopWorkItemApproval: vi.fn<HarwickLoopApprovalRepository["completeLoopWorkItemApproval"]>(() => Promise.resolve()),
  };
}

describe("approveHarwickLoopWorkItem", () => {
  it("queues approved dispatch_subagent loop tool calls and completes the work item", async () => {
    const repo = repository(workItem());

    const result = await approveHarwickLoopWorkItem({
      workspaceId,
      workItemId,
      actorMemberId: memberId,
      repository: repo,
      now: () => new Date("2026-05-06T12:30:00.000Z"),
    });

    expect(result.status).toBe("approved");
    expect(repo.enqueueLoopSubagentTask).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId,
      leadId: null,
      subagentType: "research",
      priority: "high",
      title: "Research stale queue items",
      instructions: "Find the stale work items and summarize who owns them.",
      nowIso: "2026-05-06T12:30:00.000Z",
    }));
    expect(repo.completeLoopWorkItemApproval).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId,
      workItemId,
      actorMemberId: memberId,
    }));
    const completeArgs = repo.completeLoopWorkItemApproval.mock.calls[0]?.[0];
    const loopApproval = completeArgs?.payload["loopApproval"];
    expect(loopApproval).toMatchObject({
      approvedByMemberId: memberId,
      approvedAt: "2026-05-06T12:30:00.000Z",
      executionMode: "agent_loop",
      executed: [expect.objectContaining({
        tool: "dispatch_subagent",
        status: "queued",
        taskId: "00000000-0000-0000-0000-000000000005",
      })],
    });
  });

  it("skips external tool execution even after approval until provider validation lands", async () => {
    const repo = repository(workItem({
      payload: {
        signalType: "harwick_loop_due",
        signalKey: `harwick_loop_due:${loopId}:2026-05-06T12:00:00.000Z`,
        loopId,
        loopName: "CRM sync check",
        instruction: "Sync stale qualified leads.",
        outputMode: "agent_loop",
        toolAllowlist: ["sync_follow_up_boss"],
        proposedToolCalls: [{
          tool: "sync_follow_up_boss",
          reason: "Sync the stale qualified lead to FUB.",
          requiresApproval: true,
          payload: { leadId: "lead-1" },
        }],
        agentLoopBrief: "Sync stale qualified leads.",
      },
    }));

    const result = await approveHarwickLoopWorkItem({
      workspaceId,
      workItemId,
      actorMemberId: memberId,
      repository: repo,
    });

    expect(result.status).toBe("approved");
    expect(repo.enqueueLoopSubagentTask).not.toHaveBeenCalled();
    const completeArgs = repo.completeLoopWorkItemApproval.mock.calls[0]?.[0];
    expect(completeArgs?.payload["loopApproval"]).toMatchObject({
      executed: [expect.objectContaining({
        tool: "sync_follow_up_boss",
        status: "skipped",
      })],
    });
  });

  it("does not execute stale or malformed work items", async () => {
    const alreadyResolved = await approveHarwickLoopWorkItem({
      workspaceId,
      workItemId,
      actorMemberId: memberId,
      repository: repository(workItem({ status: "completed" })),
    });
    expect(alreadyResolved.status).toBe("already_resolved");

    const invalid = await approveHarwickLoopWorkItem({
      workspaceId,
      workItemId,
      actorMemberId: memberId,
      repository: repository(workItem({ payload: { signalType: "not_loop" } })),
    });
    expect(invalid.status).toBe("invalid_payload");
  });

  it("records generic approval plans and only executes internal-safe follow-through", async () => {
    const repo = repository(workItem({
      payload: {
        signalType: "unassigned_priority_lead",
        signalKey: "unassigned_priority_lead:lead-1:hot",
        actionPlan: {
          executionBrief: "Review assignment fit and gather routing context before a human assigns the lead.",
          requiresApproval: true,
          internalSafeOnly: false,
          proposedToolCalls: [
            {
              tool: "dispatch_subagent",
              reason: "Gather routing context first.",
              requiresApproval: true,
              payload: {
                subagentType: "routing",
                title: "Review lead routing fit",
                instructions: "Review the highest-fit agent for this lead.",
              },
            },
            {
              tool: "route_lead",
              reason: "Assign the lead after review.",
              requiresApproval: true,
              payload: {},
            },
          ],
        },
      },
    }));

    const result = await approveHarwickLoopWorkItem({
      workspaceId,
      workItemId,
      actorMemberId: memberId,
      repository: repo,
      now: () => new Date("2026-05-06T12:45:00.000Z"),
    });

    expect(result.status).toBe("approved");
    if (result.status !== "approved") {
      throw new Error("expected approval result");
    }
    expect(result.signalType).toBe("unassigned_priority_lead");
    expect(result.loopId).toBeNull();
    expect(repo.enqueueLoopSubagentTask).toHaveBeenCalledTimes(1);
    const completeArgs = repo.completeLoopWorkItemApproval.mock.calls[0]?.[0];
    expect(completeArgs?.payload["approvalExecution"]).toMatchObject({
      signalType: "unassigned_priority_lead",
      executed: [
        expect.objectContaining({
          tool: "dispatch_subagent",
          status: "queued",
        }),
        expect.objectContaining({
          tool: "route_lead",
          status: "skipped",
        }),
      ],
    });
  });
});
