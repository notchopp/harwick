import {
  decideLeadRouting,
  RouteLeadRequestSchema,
  workspaceRoleHasCapability,
  type AuditLogEntry,
  type AuthWorkspaceMembership,
  type LeadRoutingDecision,
  type RouteLeadResponse,
} from "@realty-ops/core";
import { mapRowToAgentRoutingProfile } from "../../lib/supabase/member-routing-profiles";
import type {
  LeadRoutingActionLeadRow,
  LeadRoutingActionMemberRow,
  LeadRoutingActionRepository,
} from "../../lib/supabase/leads";

export type LeadRoutingAuditWriter = {
  insertAuditLog(entry: AuditLogEntry): Promise<void>;
};

export type RouteLeadActionResult =
  | { status: "routed"; response: RouteLeadResponse }
  | { status: "no_assignment"; response: RouteLeadResponse }
  | { status: "forbidden" }
  | { status: "not_found" };

function canRouteLead(viewer: Pick<AuthWorkspaceMembership, "role">): boolean {
  return workspaceRoleHasCapability(viewer.role, "routing.manage")
    || workspaceRoleHasCapability(viewer.role, "leads.manage_all");
}

function findEscalationMember(members: LeadRoutingActionMemberRow[]): string | null {
  return members.find((member) =>
    member.role === "owner"
    || member.role === "admin"
    || member.role === "team_lead"
    || member.role === "lead_manager"
  )?.id ?? null;
}

function decisionReasons(decision: LeadRoutingDecision): string[] {
  return decision.reasons.length > 0 ? decision.reasons : [decision.taskLabel];
}

function confidenceFromScore(matchScore: number): number {
  return Math.max(0, Math.min(1, matchScore / 100));
}

function responseFromDecision(params: {
  leadId: string;
  decision: LeadRoutingDecision;
  routingDecisionId: string;
}): RouteLeadResponse {
  return {
    leadId: params.leadId,
    status: params.decision.status,
    assignedMemberId: params.decision.assignedMemberId,
    assignedDisplayName: params.decision.assignedDisplayName,
    reasons: decisionReasons(params.decision),
    routingDecisionId: params.routingDecisionId,
  };
}

async function insertRoutingDecision(params: {
  repository: LeadRoutingActionRepository;
  workspaceId: string;
  lead: LeadRoutingActionLeadRow;
  decision: LeadRoutingDecision;
  viewer: Pick<AuthWorkspaceMembership, "memberId">;
  auditSource: "leads_page" | "harwick_approval";
}): Promise<string> {
  const now = new Date().toISOString();
  const row = await params.repository.insertRoutingDecision({
    workspace_id: params.workspaceId,
    lead_id: params.lead.id,
    trajectory_id: null,
    step_id: null,
    suggested_member_id: params.decision.assignedMemberId,
    final_member_id: params.decision.status === "assigned" ? params.decision.assignedMemberId : null,
    status: params.decision.status === "assigned" ? "assigned" : "suggested",
    confidence: confidenceFromScore(params.decision.matchScore),
    reason: decisionReasons(params.decision).join("; "),
    evidence: {
      mode: "auto",
      source: params.auditSource,
      decisionStatus: params.decision.status,
      matchScore: params.decision.matchScore,
      sourceOwnerMemberId: params.decision.sourceOwnerMemberId,
      previousAssignedMemberId: params.lead.assigned_agent_id,
      leadSnapshot: {
        leadType: params.lead.lead_type,
        intent: params.lead.intent,
        targetArea: params.lead.target_area,
        budgetMin: params.lead.budget_min,
        budgetMax: params.lead.budget_max,
        score: params.lead.score,
      },
      reasons: decisionReasons(params.decision),
    },
    created_by_actor_type: "member",
    decided_by_member_id: params.decision.status === "assigned" ? params.viewer.memberId : null,
    decided_at: params.decision.status === "assigned" ? now : null,
    override_reason: null,
    updated_at: now,
  });

  return row.id;
}

export type LeadRoutingAuditSource = "leads_page" | "harwick_approval";

export async function routeLeadWithHarwick(params: {
  workspaceId: string;
  leadId: string;
  viewer: Pick<AuthWorkspaceMembership, "memberId" | "role">;
  input: unknown;
  repository: LeadRoutingActionRepository;
  auditRepository: LeadRoutingAuditWriter;
  auditSource?: LeadRoutingAuditSource;
}): Promise<RouteLeadActionResult> {
  RouteLeadRequestSchema.parse(params.input);

  if (!canRouteLead(params.viewer)) {
    return { status: "forbidden" };
  }

  const auditSource: LeadRoutingAuditSource = params.auditSource ?? "leads_page";

  const lead = await params.repository.findLeadForRoutingAction({
    workspaceId: params.workspaceId,
    leadId: params.leadId,
  });

  if (lead === null) {
    return { status: "not_found" };
  }

  const [profiles, members, activeLeadCounts, calendarSignals, sourceOwnerMemberId] = await Promise.all([
    params.repository.listRoutingProfiles(params.workspaceId),
    params.repository.listActiveWorkspaceMembers(params.workspaceId),
    params.repository.listAssignedActiveLeadCounts(params.workspaceId),
    params.repository.listCalendarRoutingSignals(params.workspaceId),
    params.repository.findLeadSourceOwnerMemberId({
      workspaceId: params.workspaceId,
      leadId: params.leadId,
    }),
  ]);
  const membersById = new Map(members.map((member) => [member.id, member]));
  const agentProfiles = profiles.flatMap((profile) => {
    const member = membersById.get(profile.member_id);
    if (member === undefined) {
      return [];
    }

    return [mapRowToAgentRoutingProfile({
      profile,
      displayName: member.display_name,
      activeLeadCount: activeLeadCounts[profile.member_id] ?? 0,
      calendarStatus: calendarSignals[profile.member_id]?.calendarStatus ?? "missing",
      showingMode: calendarSignals[profile.member_id]?.showingMode ?? null,
    })];
  });

  const decision = decideLeadRouting({
    qualification: {
      leadId: lead.id,
      workspaceId: lead.workspace_id,
      leadType: lead.lead_type,
      targetArea: lead.target_area,
      propertyType: null,
      budgetMin: lead.budget_min,
      budgetMax: lead.budget_max,
      timeline: lead.timeline,
      financingStatus: lead.financing_status,
      score: lead.score,
      sourceOwnerMemberId,
    },
    agents: agentProfiles,
    escalationMemberId: findEscalationMember(members),
    roundRobinCursorMemberId: null,
  });

  const routingDecisionId = await insertRoutingDecision({
    repository: params.repository,
    workspaceId: params.workspaceId,
    lead,
    decision,
    viewer: params.viewer,
    auditSource,
  });

  const response = responseFromDecision({
    leadId: lead.id,
    decision,
    routingDecisionId,
  });

  if (decision.status !== "assigned" || decision.assignedMemberId === null) {
    return { status: "no_assignment", response };
  }

  const updatedLead = await params.repository.updateLeadAssignment({
    workspaceId: params.workspaceId,
    leadId: lead.id,
    assignedMemberId: decision.assignedMemberId,
  });

  await params.auditRepository.insertAuditLog({
    workspaceId: params.workspaceId,
    userId: null,
    actorType: "user",
    action: lead.assigned_agent_id === null ? "lead.assigned" : "lead.reassigned",
    resourceType: "lead",
    resourceId: lead.id,
    metadata: {
      mode: "auto",
      routingDecisionId,
      previousAssignedMemberId: lead.assigned_agent_id,
      assignedMemberId: decision.assignedMemberId,
      reasons: decisionReasons(decision),
      source: auditSource,
      approverMemberId: params.viewer.memberId,
    },
  });

  return {
    status: "routed",
    response: {
      ...response,
      leadId: updatedLead.id,
    },
  };
}
