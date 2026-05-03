import type { AgentRoutingSettingsRepository } from "../../lib/supabase/agent-routing-settings";
import type { RealtyOpsSupabaseClient } from "../../lib/supabase/server-client";

export type LeadRoutingContext = {
  leadId: string;
  workspaceId: string;
  score: number;
  leadType: "buyer" | "seller" | "renter" | "investor" | "unknown";
  intent: "high" | "medium" | "low" | "spam" | "unknown";
  budgetMin: number | null;
  budgetMax: number | null;
  targetArea: string | null;
  sourceChannel: string;
};

export type RoutingDecision = {
  shouldAutoRoute: boolean;
  assignedMemberId: string | null;
  reason: string;
};

/**
 * Determine if a lead should be auto-routed based on score and agent settings.
 * 
 * Threshold: score >= 60 for auto-route
 * Below 60: goes to shared pool or nurture
 */
export async function makeRoutingDecision(
  context: LeadRoutingContext,
  routingSettingsRepository: AgentRoutingSettingsRepository,
): Promise<RoutingDecision> {
  // Score threshold for auto-routing
  const AUTO_ROUTE_THRESHOLD = 60;

  if (context.score < AUTO_ROUTE_THRESHOLD) {
    return {
      shouldAutoRoute: false,
      assignedMemberId: null,
      reason: `Score ${context.score} below threshold (${AUTO_ROUTE_THRESHOLD})`,
    };
  }

  // Get all routing settings for workspace
  const agentSettings = await routingSettingsRepository.getByWorkspaceId(context.workspaceId);

  if (agentSettings.length === 0) {
    return {
      shouldAutoRoute: false,
      assignedMemberId: null,
      reason: "No agent routing settings configured",
    };
  }

  // Find matching agents
  const matchingAgents = agentSettings.filter((settings: typeof agentSettings[number]) => {
    // Check auto-assign enabled
    if (!settings.auto_assign_enabled) {
      return false;
    }

    // Check specialization match
    if (settings.specializations.length > 0) {
      const leadTypeMatch = settings.specializations.some(
        (spec: string) => spec === context.leadType || spec === context.intent,
      );
      if (!leadTypeMatch) {
        return false;
      }
    }

    // Check budget range match
    if (context.budgetMin !== null || context.budgetMax !== null) {
      const leadBudgetMid = context.budgetMax !== null && context.budgetMin !== null
        ? (context.budgetMin + context.budgetMax) / 2
        : context.budgetMax ?? context.budgetMin;

      if (leadBudgetMid !== null) {
        const agentBudgetMin = settings.min_budget ?? 0;
        const agentBudgetMax = settings.max_budget ?? Number.MAX_SAFE_INTEGER;

        if (leadBudgetMid < agentBudgetMin || leadBudgetMid > agentBudgetMax) {
          return false;
        }
      }
    }

    // Check territory match (if target area provided)
    if (context.targetArea !== null && settings.territories.length > 0) {
      const areaMatch = settings.territories.some(
        (territory: string) => context.targetArea?.includes(territory),
      );
      if (!areaMatch) {
        return false;
      }
    }

    return true;
  });

  if (matchingAgents.length === 0) {
    return {
      shouldAutoRoute: false,
      assignedMemberId: null,
      reason: "No matching agents for this lead profile",
    };
  }

  // For now, assign to first matching agent
  // TODO: Implement workload balancing (check current active lead count)
  const assignedAgent = matchingAgents[0];

  if (!assignedAgent) {
    return {
      shouldAutoRoute: false,
      assignedMemberId: null,
      reason: "No matching agents for this lead profile",
    };
  }

  return {
    shouldAutoRoute: true,
    assignedMemberId: assignedAgent.member_id,
    reason: `Matched to agent: ${assignedAgent.member_id} (score ${context.score})`,
  };
}

/**
 * Assign a lead to an agent
 */
export async function assignLeadToAgent(
  supabase: RealtyOpsSupabaseClient,
  leadId: string,
  memberId: string,
): Promise<void> {
  const { error } = await supabase
    .from("leads")
    .update({
      assigned_agent_id: memberId,
      status: "assigned",
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId);

  if (error !== null) {
    throw error;
  }
}
