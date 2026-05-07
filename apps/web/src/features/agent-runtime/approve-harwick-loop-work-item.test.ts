import { describe, expect, it, vi } from "vitest";
import {
  approveHarwickLoopWorkItem,
  type HarwickLoopApprovalRepository,
  type HarwickLoopWorkItemForApproval,
  type HarwickOpenHouseApprovalAdapter,
  type HarwickPauseAutomationApprovalAdapter,
  type HarwickRouteLeadApprovalAdapter,
  type HarwickShowingApprovalAdapter,
  type HarwickSyncFubApprovalAdapter,
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

  it("executes route_lead when an adapter is wired and the work item has a leadId", async () => {
    const leadId = "00000000-0000-0000-0000-000000000020";
    const routingDecisionId = "00000000-0000-0000-0000-000000000021";
    const newlyAssignedMemberId = "00000000-0000-0000-0000-000000000022";
    const repo = repository(workItem({
      leadId,
      payload: {
        signalType: "unassigned_priority_lead",
        signalKey: `unassigned_priority_lead:${leadId}:hot`,
        actionPlan: {
          executionBrief: "Assign this lead to the best-fit available agent.",
          requiresApproval: true,
          internalSafeOnly: false,
          proposedToolCalls: [{
            tool: "route_lead",
            reason: "Assign the lead now that a qualified agent has capacity.",
            requiresApproval: true,
            payload: {},
          }],
        },
      },
    }));
    const adapterCalls: unknown[] = [];
    const routeLeadAdapter: HarwickRouteLeadApprovalAdapter = {
      executeRouteLead(params) {
        adapterCalls.push(params);
        return Promise.resolve({
          status: "executed",
          routingDecisionId,
          assignedMemberId: newlyAssignedMemberId,
          reasons: ["best capacity match", "primary area overlap"],
          undoExpiresAt: "2026-05-06T12:55:00.000Z",
        });
      },
    };

    const result = await approveHarwickLoopWorkItem({
      workspaceId,
      workItemId,
      actorMemberId: memberId,
      repository: repo,
      routeLeadAdapter,
      now: () => new Date("2026-05-06T12:45:00.000Z"),
    });

    expect(result.status).toBe("approved");
    if (result.status !== "approved") throw new Error("expected approval result");
    expect(adapterCalls).toHaveLength(1);
    expect(adapterCalls[0]).toMatchObject({
      workspaceId,
      leadId,
      approverMemberId: memberId,
      nowIso: "2026-05-06T12:45:00.000Z",
    });
    expect(result.executed[0]).toMatchObject({
      tool: "route_lead",
      status: "executed",
      routingDecisionId,
      assignedMemberId: newlyAssignedMemberId,
      undoExpiresAt: "2026-05-06T12:55:00.000Z",
    });
  });

  it("skips route_lead when the work item has no leadId, even with an adapter wired", async () => {
    const repo = repository(workItem({
      leadId: null,
      payload: {
        signalType: "unassigned_priority_lead",
        signalKey: "unassigned_priority_lead:none",
        actionPlan: {
          executionBrief: "Route this lead.",
          requiresApproval: true,
          internalSafeOnly: false,
          proposedToolCalls: [{
            tool: "route_lead",
            reason: "Route the lead.",
            requiresApproval: true,
            payload: {},
          }],
        },
      },
    }));
    const routeLeadAdapter: HarwickRouteLeadApprovalAdapter = {
      executeRouteLead() {
        throw new Error("adapter should not be invoked when leadId is null");
      },
    };
    const result = await approveHarwickLoopWorkItem({
      workspaceId,
      workItemId,
      actorMemberId: memberId,
      repository: repo,
      routeLeadAdapter,
    });
    expect(result.status).toBe("approved");
    if (result.status !== "approved") throw new Error("expected approval result");
    expect(result.executed[0]).toMatchObject({
      tool: "route_lead",
      status: "skipped",
    });
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

  it("executes sync_follow_up_boss via the adapter and reports the workflow job id", async () => {
    const leadId = "00000000-0000-0000-0000-000000000030";
    const workflowJobId = "00000000-0000-0000-0000-000000000031";
    const repo = repository(workItem({
      leadId,
      payload: {
        signalType: "qualified_lead_ready_to_sync",
        signalKey: `qualified_lead:${leadId}`,
        actionPlan: {
          executionBrief: "Sync the qualified lead to FUB.",
          requiresApproval: true,
          internalSafeOnly: false,
          proposedToolCalls: [{
            tool: "sync_follow_up_boss",
            reason: "Lead is now qualified; push to CRM.",
            requiresApproval: true,
            payload: { note: "qualified-by-harwick" },
          }],
        },
      },
    }));
    const calls: unknown[] = [];
    const syncFollowUpBoss: HarwickSyncFubApprovalAdapter = {
      executeSyncFollowUpBoss(params) {
        calls.push(params);
        return Promise.resolve({
          status: "executed",
          workflowJobId,
          idempotencyKey: `fub_sync:${leadId}`,
          reason: "FUB sync job enqueued.",
        });
      },
    };
    const result = await approveHarwickLoopWorkItem({
      workspaceId,
      workItemId,
      actorMemberId: memberId,
      repository: repo,
      adapters: { syncFollowUpBoss },
    });
    expect(result.status).toBe("approved");
    if (result.status !== "approved") throw new Error("expected approval");
    expect(calls).toHaveLength(1);
    expect(result.executed[0]).toMatchObject({
      tool: "sync_follow_up_boss",
      status: "executed",
      output: { workflowJobId, idempotencyKey: `fub_sync:${leadId}` },
    });
  });

  it("executes request_showing_approval via the adapter and surfaces the lead task id", async () => {
    const leadId = "00000000-0000-0000-0000-000000000040";
    const taskId = "00000000-0000-0000-0000-000000000041";
    const repo = repository(workItem({
      leadId,
      payload: {
        signalType: "showing_proposal_ready",
        signalKey: `showing_proposal:${leadId}`,
        actionPlan: {
          executionBrief: "Request a showing approval task.",
          requiresApproval: true,
          internalSafeOnly: false,
          proposedToolCalls: [{
            tool: "request_showing_approval",
            reason: "Buyer wants to tour Saturday at 11am.",
            requiresApproval: true,
            payload: {
              listing: "123 Maple",
              requestedStart: "2026-05-09T15:00:00.000Z",
              requestedEnd: "2026-05-09T15:45:00.000Z",
            },
          }],
        },
      },
    }));
    const requestShowingApproval: HarwickShowingApprovalAdapter = {
      executeRequestShowingApproval() {
        return Promise.resolve({
          status: "executed",
          taskId,
          listing: "123 Maple",
          requestedStart: "2026-05-09T15:00:00.000Z",
          requestedEnd: "2026-05-09T15:45:00.000Z",
        });
      },
    };
    const result = await approveHarwickLoopWorkItem({
      workspaceId,
      workItemId,
      actorMemberId: memberId,
      repository: repo,
      adapters: { requestShowingApproval },
    });
    expect(result.status).toBe("approved");
    if (result.status !== "approved") throw new Error("expected approval");
    expect(result.executed[0]).toMatchObject({
      tool: "request_showing_approval",
      status: "executed",
      taskId,
    });
  });

  it("executes register_open_house via the adapter", async () => {
    const leadId = "00000000-0000-0000-0000-000000000050";
    const taskId = "00000000-0000-0000-0000-000000000051";
    const repo = repository(workItem({
      leadId,
      payload: {
        signalType: "open_house_invite",
        signalKey: `open_house:${leadId}`,
        actionPlan: {
          executionBrief: "Register the lead for the upcoming open house.",
          requiresApproval: true,
          internalSafeOnly: false,
          proposedToolCalls: [{
            tool: "register_open_house",
            reason: "Lead asked to attend Sunday's open house.",
            requiresApproval: true,
            payload: { listing: "456 Oak", eventDate: "2026-05-10" },
          }],
        },
      },
    }));
    const registerOpenHouse: HarwickOpenHouseApprovalAdapter = {
      executeRegisterOpenHouse() {
        return Promise.resolve({
          status: "executed",
          taskId,
          listing: "456 Oak",
          eventDate: "2026-05-10",
        });
      },
    };
    const result = await approveHarwickLoopWorkItem({
      workspaceId,
      workItemId,
      actorMemberId: memberId,
      repository: repo,
      adapters: { registerOpenHouse },
    });
    expect(result.status).toBe("approved");
    if (result.status !== "approved") throw new Error("expected approval");
    expect(result.executed[0]).toMatchObject({
      tool: "register_open_house",
      status: "executed",
      taskId,
    });
  });

  it("executes pause_automation via the adapter and records the automation state id", async () => {
    const leadId = "00000000-0000-0000-0000-000000000060";
    const automationStateId = "00000000-0000-0000-0000-000000000061";
    const repo = repository(workItem({
      leadId,
      payload: {
        signalType: "needs_human",
        signalKey: `needs_human:${leadId}`,
        actionPlan: {
          executionBrief: "Pause Harwick on this conversation.",
          requiresApproval: true,
          internalSafeOnly: false,
          proposedToolCalls: [{
            tool: "pause_automation",
            reason: "Lead asked to speak with a human.",
            requiresApproval: true,
            payload: { reason: "Lead requested a human." },
          }],
        },
      },
    }));
    const pauseAutomation: HarwickPauseAutomationApprovalAdapter = {
      executePauseAutomation(params) {
        expect(params.callPayload["reason"]).toBe("Lead requested a human.");
        return Promise.resolve({
          status: "executed",
          automationStateId,
          reason: "Lead requested a human.",
        });
      },
    };
    const result = await approveHarwickLoopWorkItem({
      workspaceId,
      workItemId,
      actorMemberId: memberId,
      repository: repo,
      adapters: { pauseAutomation },
    });
    expect(result.status).toBe("approved");
    if (result.status !== "approved") throw new Error("expected approval");
    expect(result.executed[0]).toMatchObject({
      tool: "pause_automation",
      status: "executed",
      output: { automationStateId },
    });
  });

  it("skips newly opened tools cleanly when no adapter is wired", async () => {
    const leadId = "00000000-0000-0000-0000-000000000070";
    const repo = repository(workItem({
      leadId,
      payload: {
        signalType: "needs_action",
        signalKey: `needs_action:${leadId}`,
        actionPlan: {
          executionBrief: "Multiple actions proposed.",
          requiresApproval: true,
          internalSafeOnly: false,
          proposedToolCalls: [
            {
              tool: "sync_follow_up_boss",
              reason: "Sync to CRM.",
              requiresApproval: true,
              payload: {},
            },
            {
              tool: "register_open_house",
              reason: "Register for open house.",
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
    });
    expect(result.status).toBe("approved");
    if (result.status !== "approved") throw new Error("expected approval");
    expect(result.executed.every((e) => e.status === "skipped")).toBe(true);
  });
});
