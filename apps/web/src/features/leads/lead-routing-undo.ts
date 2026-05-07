import {
  workspaceRoleHasCapability,
  type AuditLogEntry,
  type AuthWorkspaceMembership,
} from "@realty-ops/core";

const DEFAULT_UNDO_WINDOW_MINUTES = 10;

export type LeadRoutingUndoCandidate = {
  workspaceId: string;
  leadId: string;
  finalMemberId: string | null;
  decidedAt: string | null;
  previousAssignedMemberId: string | null;
  reason: string;
};

export type LeadRoutingUndoRepository = {
  findRoutingDecisionForUndo(params: {
    workspaceId: string;
    routingDecisionId: string;
  }): Promise<LeadRoutingUndoCandidate | null>;
  setLeadAssignment(params: {
    workspaceId: string;
    leadId: string;
    assignedMemberId: string | null;
  }): Promise<void>;
  insertReversalDecision(params: {
    workspaceId: string;
    leadId: string;
    originalDecisionId: string;
    revertedFromMemberId: string | null;
    restoredAssignedMemberId: string | null;
    actorMemberId: string;
    nowIso: string;
    reason: string;
  }): Promise<{ id: string }>;
};

export type LeadRoutingUndoAuditWriter = {
  insertAuditLog(entry: AuditLogEntry): Promise<void>;
};

export type LeadRoutingUndoResult =
  | { status: "undone"; reversalDecisionId: string; restoredAssignedMemberId: string | null }
  | { status: "not_found" | "forbidden" | "lead_mismatch" | "window_expired" | "no_previous_assignment"; reason: string };

function canUndoRouting(viewer: Pick<AuthWorkspaceMembership, "role">): boolean {
  return workspaceRoleHasCapability(viewer.role, "routing.manage")
    || workspaceRoleHasCapability(viewer.role, "leads.manage_all");
}

function isWithinUndoWindow(decidedAt: string | null, now: Date, windowMinutes: number): boolean {
  if (decidedAt === null) {
    return false;
  }
  const decidedMs = Date.parse(decidedAt);
  if (Number.isNaN(decidedMs)) {
    return false;
  }
  const elapsedMinutes = (now.getTime() - decidedMs) / 60_000;
  return elapsedMinutes <= windowMinutes && elapsedMinutes >= 0;
}

export async function undoLeadRoutingDecision(params: {
  workspaceId: string;
  leadId: string;
  routingDecisionId: string;
  viewer: Pick<AuthWorkspaceMembership, "memberId" | "role">;
  repository: LeadRoutingUndoRepository;
  auditRepository: LeadRoutingUndoAuditWriter;
  undoWindowMinutes?: number;
  now?: () => Date;
}): Promise<LeadRoutingUndoResult> {
  if (!canUndoRouting(params.viewer)) {
    return { status: "forbidden", reason: "Viewer does not have routing.manage capability." };
  }

  const candidate = await params.repository.findRoutingDecisionForUndo({
    workspaceId: params.workspaceId,
    routingDecisionId: params.routingDecisionId,
  });
  if (candidate === null) {
    return { status: "not_found", reason: "Routing decision not found in this workspace." };
  }
  if (candidate.leadId !== params.leadId) {
    return { status: "lead_mismatch", reason: "Routing decision does not belong to this lead." };
  }

  const now = params.now?.() ?? new Date();
  const windowMinutes = params.undoWindowMinutes ?? DEFAULT_UNDO_WINDOW_MINUTES;
  if (!isWithinUndoWindow(candidate.decidedAt, now, windowMinutes)) {
    return { status: "window_expired", reason: `Undo window of ${windowMinutes} minutes has elapsed.` };
  }

  if (candidate.finalMemberId === null) {
    return { status: "no_previous_assignment", reason: "Decision did not assign a member; nothing to undo." };
  }
  if (candidate.previousAssignedMemberId === candidate.finalMemberId) {
    return { status: "no_previous_assignment", reason: "Decision did not change the lead's assignment." };
  }

  const restoredAssignedMemberId = candidate.previousAssignedMemberId;
  const nowIso = now.toISOString();

  await params.repository.setLeadAssignment({
    workspaceId: params.workspaceId,
    leadId: candidate.leadId,
    assignedMemberId: restoredAssignedMemberId,
  });

  const reversal = await params.repository.insertReversalDecision({
    workspaceId: params.workspaceId,
    leadId: candidate.leadId,
    originalDecisionId: params.routingDecisionId,
    revertedFromMemberId: candidate.finalMemberId,
    restoredAssignedMemberId,
    actorMemberId: params.viewer.memberId,
    nowIso,
    reason: `Undid routing decision ${params.routingDecisionId}: restored ${restoredAssignedMemberId ?? "unassigned"}.`,
  });

  await params.auditRepository.insertAuditLog({
    workspaceId: params.workspaceId,
    userId: null,
    actorType: "user",
    action: "lead.reassigned",
    resourceType: "lead",
    resourceId: candidate.leadId,
    metadata: {
      mode: "undo",
      originalDecisionId: params.routingDecisionId,
      reversalDecisionId: reversal.id,
      revertedFromMemberId: candidate.finalMemberId,
      restoredAssignedMemberId,
      actorMemberId: params.viewer.memberId,
      windowMinutes,
      source: "harwick_approval_undo",
    },
  });

  return {
    status: "undone",
    reversalDecisionId: reversal.id,
    restoredAssignedMemberId,
  };
}
