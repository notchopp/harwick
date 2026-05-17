import { UuidSchema, decideLeadRouting, type AgentRoutingProfile } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";

import { authorizeWorkspaceRequest } from "../../../../../../../lib/api/workspace-auth";
import { createSupabaseLeadRoutingActionRepository } from "../../../../../../../lib/supabase/leads";
import { mapRowToAgentRoutingProfile } from "../../../../../../../lib/supabase/member-routing-profiles";
import { createServerSupabaseClient } from "../../../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

/**
 * Context for the routing-assign sheet on /queue.
 *
 * Returns:
 *   - the lead's name + qualification summary
 *   - Harwick's current automatic recommendation (so operators can one-click
 *     "approve recommendation" without manually picking)
 *   - the full agent roster with their current load and territory/specialty
 *     coverage so the operator can pick someone other than Harwick's pick
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string; leadId: string }> },
) {
  const { workspaceId: rawWorkspaceId, leadId: rawLeadId } = await context.params;
  if (!UuidSchema.safeParse(rawWorkspaceId).success || !UuidSchema.safeParse(rawLeadId).success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const workspaceId = rawWorkspaceId;
  const leadId = rawLeadId;

  const membership = await authorizeWorkspaceRequest({ request, workspaceId });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();
  const repository = createSupabaseLeadRoutingActionRepository(supabase);

  const lead = await repository.findLeadForRoutingAction({ workspaceId, leadId });
  if (lead === null) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const [profiles, members, activeLeadCounts, calendarSignals, sourceOwnerMemberId] = await Promise.all([
    repository.listRoutingProfiles(workspaceId),
    repository.listActiveWorkspaceMembers(workspaceId),
    repository.listAssignedActiveLeadCounts(workspaceId),
    repository.listCalendarRoutingSignals(workspaceId),
    repository.findLeadSourceOwnerMemberId({ workspaceId, leadId }),
  ]);

  const membersById = new Map(members.map((member) => [member.id, member]));
  const agentProfiles: AgentRoutingProfile[] = profiles.flatMap((profile) => {
    const member = membersById.get(profile.member_id);
    if (member === undefined) return [];
    return [mapRowToAgentRoutingProfile({
      profile,
      displayName: member.display_name,
      activeLeadCount: activeLeadCounts[profile.member_id] ?? 0,
      calendarStatus: calendarSignals[profile.member_id]?.calendarStatus ?? "missing",
      showingMode: calendarSignals[profile.member_id]?.showingMode ?? null,
    })];
  });

  const escalationMember = members.find((member) => member.role === "owner") ?? null;

  const recommendation = decideLeadRouting({
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
    escalationMemberId: escalationMember?.id ?? null,
    roundRobinCursorMemberId: null,
  });

  return NextResponse.json({
    lead: {
      id: lead.id,
      fullName: lead.full_name,
      status: lead.status,
      leadType: lead.lead_type,
      targetArea: lead.target_area,
      budgetMin: lead.budget_min,
      budgetMax: lead.budget_max,
      timeline: lead.timeline,
      financingStatus: lead.financing_status,
      score: lead.score,
      assignedAgentId: lead.assigned_agent_id,
    },
    recommendation,
    agents: agentProfiles.map((agent) => ({
      memberId: agent.memberId,
      displayName: agent.displayName,
      role: membersById.get(agent.memberId)?.role ?? "agent",
      activeLeadCount: agent.activeLeadCount,
      maxActiveLeads: agent.maxActiveLeads,
      areas: agent.areas,
      propertyTypes: agent.propertyTypes,
      leadTypes: agent.leadTypes,
      calendarStatus: agent.calendarStatus,
      acceptsNewLeads: agent.acceptsNewLeads,
      atCapacity: agent.activeLeadCount >= agent.maxActiveLeads,
    })),
  });
}
