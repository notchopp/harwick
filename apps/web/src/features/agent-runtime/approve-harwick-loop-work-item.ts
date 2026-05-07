import { HarwickWorkItemActionPlanSchema } from "@realty-ops/core";
import { z } from "zod";

const LoopProposedToolCallSchema = z.object({
  tool: z.string().trim().min(1).max(80),
  reason: z.string().trim().min(1).max(240),
  requiresApproval: z.boolean(),
  payload: z.record(z.string(), z.unknown()).default({}),
});

const LoopApprovalPayloadSchema = z.object({
  signalType: z.literal("harwick_loop_due"),
  signalKey: z.string().trim().min(1).max(240),
  loopId: z.string().uuid(),
  loopName: z.string().trim().min(1).max(120),
  instruction: z.string().trim().min(1).max(4000),
  outputMode: z.enum(["work_item", "draft", "agent_loop"]),
  toolAllowlist: z.array(z.string().trim().min(1).max(80)).default([]),
  draftBody: z.string().trim().min(1).max(2000).nullable().optional(),
  proposedToolCalls: z.array(LoopProposedToolCallSchema).max(8).default([]),
  agentLoopBrief: z.string().trim().min(1).max(1000).nullable().optional(),
});

const SubagentTypeSchema = z.enum(["research", "writer", "calendar", "routing"]);
const PrioritySchema = z.enum(["low", "normal", "high", "urgent"]);

type LoopProposedToolCall = z.infer<typeof LoopProposedToolCallSchema>;
type LoopApprovalPayload = z.infer<typeof LoopApprovalPayloadSchema>;

export type HarwickLoopWorkItemForApproval = {
  id: string;
  workspaceId: string;
  leadId: string | null;
  trajectoryId: string | null;
  stepId: string | null;
  type: string;
  status: string;
  priority: "low" | "normal" | "high" | "urgent";
  payload: Record<string, unknown>;
};

export type HarwickLoopApprovalRepository = {
  getLoopWorkItemForApproval(params: {
    workspaceId: string;
    workItemId: string;
  }): Promise<HarwickLoopWorkItemForApproval | null>;
  enqueueLoopSubagentTask(params: {
    workspaceId: string;
    leadId: string | null;
    trajectoryId: string | null;
    stepId: string | null;
    subagentType: "research" | "writer" | "calendar" | "routing";
    priority: "low" | "normal" | "high" | "urgent";
    title: string;
    instructions: string;
    payload: Record<string, unknown>;
    nowIso: string;
  }): Promise<{ taskId: string }>;
  completeLoopWorkItemApproval(params: {
    workspaceId: string;
    workItemId: string;
    actorMemberId: string;
    payload: Record<string, unknown>;
    nowIso: string;
  }): Promise<void>;
};

export type HarwickLoopApprovedToolExecution = {
  tool: string;
  status: "queued" | "skipped" | "executed" | "no_assignment" | "forbidden";
  reason: string;
  taskId?: string;
  routingDecisionId?: string;
  assignedMemberId?: string | null;
  undoExpiresAt?: string;
  output: Record<string, unknown>;
};

export type HarwickRouteLeadApprovalAdapter = {
  executeRouteLead(params: {
    workspaceId: string;
    leadId: string;
    approverMemberId: string;
    callPayload: Record<string, unknown>;
    nowIso: string;
  }): Promise<{
    status: "executed" | "no_assignment" | "forbidden";
    routingDecisionId: string | null;
    assignedMemberId: string | null;
    reasons: string[];
    undoExpiresAt: string;
  }>;
};

export type HarwickLoopApprovalResult =
  | {
      status: "approved";
      workItemId: string;
      signalType: string;
      loopId: string | null;
      loopName: string | null;
      executed: HarwickLoopApprovedToolExecution[];
    }
  | {
      status: "not_found" | "not_loop_approval" | "already_resolved" | "invalid_payload";
      workItemId: string;
      reason: string;
    };

function readPayloadString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

const GenericApprovalPayloadSchema = z.object({
  signalType: z.string().trim().min(1).max(120),
  signalKey: z.string().trim().min(1).max(240),
  actionPlan: HarwickWorkItemActionPlanSchema.optional(),
  loopId: z.string().uuid().nullable().optional(),
  loopName: z.string().trim().min(1).max(120).nullable().optional(),
  instruction: z.string().trim().min(1).max(4000).nullable().optional(),
  outputMode: z.enum(["work_item", "draft", "agent_loop"]).nullable().optional(),
  toolAllowlist: z.array(z.string().trim().min(1).max(80)).default([]),
  draftBody: z.string().trim().min(1).max(2000).nullable().optional(),
  agentLoopBrief: z.string().trim().min(1).max(1000).nullable().optional(),
});

function readSubagentType(call: LoopProposedToolCall): "research" | "writer" | "calendar" | "routing" {
  return SubagentTypeSchema.catch("research").parse(
    readPayloadString(call.payload, "subagentType") ?? readPayloadString(call.payload, "type") ?? "research",
  );
}

function readPriority(
  call: LoopProposedToolCall,
  fallback: "low" | "normal" | "high" | "urgent",
): "low" | "normal" | "high" | "urgent" {
  return PrioritySchema.catch(fallback).parse(readPayloadString(call.payload, "priority") ?? fallback);
}

function isOpenForApproval(status: string): boolean {
  return status === "pending" || status === "surfaced" || status === "seen";
}

type ParsedApprovalPayload = {
  signalType: string;
  signalKey: string;
  actionPlan: z.infer<typeof HarwickWorkItemActionPlanSchema>;
  loopId: string | null;
  loopName: string | null;
  instruction: string | null;
  outputMode: "work_item" | "draft" | "agent_loop";
  toolAllowlist: string[];
  draftBody: string | null;
  agentLoopBrief: string | null;
};

function parseLoopActionPlan(payload: LoopApprovalPayload): z.infer<typeof HarwickWorkItemActionPlanSchema> {
  return HarwickWorkItemActionPlanSchema.parse({
    executionBrief: payload.agentLoopBrief
      ?? payload.instruction,
    requiresApproval: true,
    internalSafeOnly: false,
    proposedToolCalls: payload.proposedToolCalls,
  });
}

function parseApprovalPayload(payload: Record<string, unknown>): ParsedApprovalPayload | null {
  const generic = GenericApprovalPayloadSchema.safeParse(payload);
  if (generic.success && generic.data.actionPlan !== undefined) {
    return {
      signalType: generic.data.signalType,
      signalKey: generic.data.signalKey,
      actionPlan: generic.data.actionPlan,
      loopId: generic.data.loopId ?? null,
      loopName: generic.data.loopName ?? null,
      instruction: generic.data.instruction ?? null,
      outputMode: generic.data.outputMode ?? "work_item",
      toolAllowlist: generic.data.toolAllowlist,
      draftBody: generic.data.draftBody ?? null,
      agentLoopBrief: generic.data.agentLoopBrief ?? null,
    };
  }

  const loop = LoopApprovalPayloadSchema.safeParse(payload);
  if (!loop.success) {
    return null;
  }

  return {
    signalType: loop.data.signalType,
    signalKey: loop.data.signalKey,
    actionPlan: parseLoopActionPlan(loop.data),
    loopId: loop.data.loopId,
    loopName: loop.data.loopName,
    instruction: loop.data.instruction,
    outputMode: loop.data.outputMode,
    toolAllowlist: loop.data.toolAllowlist,
    draftBody: loop.data.draftBody ?? null,
    agentLoopBrief: loop.data.agentLoopBrief ?? null,
  };
}

const APPROVAL_OPENED_EXTERNAL_TOOLS = new Set(["route_lead"]);

function canExecuteApprovedTool(call: LoopProposedToolCall, payload: ParsedApprovalPayload): boolean {
  if (!call.requiresApproval) return false;
  if (call.tool === "dispatch_subagent") return true;
  if (APPROVAL_OPENED_EXTERNAL_TOOLS.has(call.tool)) return true;
  if (payload.actionPlan.internalSafeOnly) return false;
  return payload.toolAllowlist.includes(call.tool);
}

async function executeApprovedToolCall(params: {
  repository: HarwickLoopApprovalRepository;
  routeLeadAdapter: HarwickRouteLeadApprovalAdapter | null;
  workItem: HarwickLoopWorkItemForApproval;
  payload: ParsedApprovalPayload;
  call: LoopProposedToolCall;
  actorMemberId: string;
  nowIso: string;
}): Promise<HarwickLoopApprovedToolExecution> {
  if (!canExecuteApprovedTool(params.call, params.payload)) {
    return {
      tool: params.call.tool,
      status: "skipped",
      reason: "This Harwick tool call was not approval-marked or allowed for safe execution.",
      output: { proposedPayload: params.call.payload },
    };
  }

  if (params.call.tool === "route_lead") {
    if (params.routeLeadAdapter === null || params.workItem.leadId === null) {
      return {
        tool: params.call.tool,
        status: "skipped",
        reason: params.workItem.leadId === null
          ? "Cannot execute route_lead: work item is not bound to a lead."
          : "Cannot execute route_lead: adapter is not wired in this environment.",
        output: { proposedPayload: params.call.payload },
      };
    }

    const result = await params.routeLeadAdapter.executeRouteLead({
      workspaceId: params.workItem.workspaceId,
      leadId: params.workItem.leadId,
      approverMemberId: params.actorMemberId,
      callPayload: params.call.payload,
      nowIso: params.nowIso,
    });

    const execution: HarwickLoopApprovedToolExecution = {
      tool: params.call.tool,
      status: result.status,
      reason: params.call.reason,
      assignedMemberId: result.assignedMemberId,
      undoExpiresAt: result.undoExpiresAt,
      output: {
        leadId: params.workItem.leadId,
        routingDecisionId: result.routingDecisionId,
        assignedMemberId: result.assignedMemberId,
        reasons: result.reasons,
        undoExpiresAt: result.undoExpiresAt,
      },
    };
    if (result.routingDecisionId !== null) {
      execution.routingDecisionId = result.routingDecisionId;
    }
    return execution;
  }

  if (params.call.tool !== "dispatch_subagent") {
    return {
      tool: params.call.tool,
      status: "skipped",
      reason: "External tool execution is intentionally held until provider-backed validation is complete.",
      output: { proposedPayload: params.call.payload },
    };
  }

  const subagentType = readSubagentType(params.call);
  const title = readPayloadString(params.call.payload, "title")
    ?? `${params.payload.loopName ?? "Harwick approval"}: ${subagentType} follow-through`;
  const instructions = readPayloadString(params.call.payload, "instructions")
    ?? params.payload.actionPlan.executionBrief
    ?? params.payload.agentLoopBrief
    ?? params.payload.instruction
    ?? "Review the approved Harwick work item and continue with bounded specialist follow-through.";
  const task = await params.repository.enqueueLoopSubagentTask({
    workspaceId: params.workItem.workspaceId,
    leadId: params.workItem.leadId,
    trajectoryId: params.workItem.trajectoryId,
    stepId: params.workItem.stepId,
    subagentType,
    priority: readPriority(params.call, params.workItem.priority),
    title,
    instructions,
    payload: {
      source: "harwick_loop_approval",
      signalType: params.payload.signalType,
      loopId: params.payload.loopId,
      loopName: params.payload.loopName,
      signalKey: params.payload.signalKey,
      reason: params.call.reason,
      proposedPayload: params.call.payload,
    },
    nowIso: params.nowIso,
  });

  return {
    tool: params.call.tool,
    status: "queued",
    reason: params.call.reason,
    taskId: task.taskId,
    output: { taskId: task.taskId, subagentType, title },
  };
}

export async function approveHarwickLoopWorkItem(params: {
  workspaceId: string;
  workItemId: string;
  actorMemberId: string;
  repository: HarwickLoopApprovalRepository;
  routeLeadAdapter?: HarwickRouteLeadApprovalAdapter | null;
  now?: () => Date;
}): Promise<HarwickLoopApprovalResult> {
  const workItem = await params.repository.getLoopWorkItemForApproval({
    workspaceId: params.workspaceId,
    workItemId: params.workItemId,
  });
  if (workItem === null) {
    return {
      status: "not_found",
      workItemId: params.workItemId,
      reason: "No Harwick work item exists for this workspace and id.",
    };
  }
  if (workItem.type !== "approval") {
    return {
      status: "not_loop_approval",
      workItemId: workItem.id,
      reason: "Only Harwick approval work items can run approval execution.",
    };
  }
  if (!isOpenForApproval(workItem.status)) {
    return {
      status: "already_resolved",
      workItemId: workItem.id,
      reason: `Work item is already ${workItem.status}.`,
    };
  }

  const payload = parseApprovalPayload(workItem.payload);
  if (payload === null) {
    return {
      status: "invalid_payload",
      workItemId: workItem.id,
      reason: "Work item does not contain a valid Harwick approval payload.",
    };
  }

  const nowIso = (params.now?.() ?? new Date()).toISOString();
  const routeLeadAdapter = params.routeLeadAdapter ?? null;
  const executed = payload.actionPlan.proposedToolCalls.length > 0
    ? await Promise.all(payload.actionPlan.proposedToolCalls.map((call) =>
        executeApprovedToolCall({
          repository: params.repository,
          routeLeadAdapter,
          workItem,
          payload,
          call,
          actorMemberId: params.actorMemberId,
          nowIso,
        })
      ))
    : [];

  const approvalPayload = {
    ...workItem.payload,
    approvalExecution: {
      approvedByMemberId: params.actorMemberId,
      approvedAt: nowIso,
      signalType: payload.signalType,
      executionMode: payload.outputMode,
      draftApproved: payload.outputMode === "draft",
      executed,
    },
    ...(payload.signalType === "harwick_loop_due" ? {
      loopApproval: {
        approvedByMemberId: params.actorMemberId,
        approvedAt: nowIso,
        executionMode: payload.outputMode,
        draftApproved: payload.outputMode === "draft",
        executed,
      },
    } : {}),
  };

  await params.repository.completeLoopWorkItemApproval({
    workspaceId: params.workspaceId,
    workItemId: workItem.id,
    actorMemberId: params.actorMemberId,
    payload: approvalPayload,
    nowIso,
  });

  return {
    status: "approved",
    workItemId: workItem.id,
    signalType: payload.signalType,
    loopId: payload.loopId,
    loopName: payload.loopName,
    executed,
  };
}
