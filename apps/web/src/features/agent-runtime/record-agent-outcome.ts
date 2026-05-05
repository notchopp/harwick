import type {
  AgentOutcomeInsert,
  AgentTrajectoryStore,
} from "../../lib/supabase/agent-trajectory-store";
import type { TablesUpdate } from "../../lib/supabase/database.types";
import type { RealtyOpsSupabaseClient } from "../../lib/supabase/server-client";

export type RecordOutcomeParams = {
  workspaceId: string;
  leadId: string;
  signalType: AgentOutcomeInsert["signalType"];
  signalValue: Record<string, unknown>;
};

export type FindLatestTrajectoryResult = {
  trajectoryId: string;
  outcomeLabel: "positive" | "negative" | "neutral" | "pending" | null;
};

async function findLatestTrajectoryForLead(
  supabase: RealtyOpsSupabaseClient,
  params: { workspaceId: string; leadId: string },
): Promise<FindLatestTrajectoryResult | null> {
  const { data, error } = await supabase
    .from("agent_trajectories")
    .select("id, outcome_label")
    .eq("workspace_id", params.workspaceId)
    .eq("lead_id", params.leadId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error !== null || data === null) {
    return null;
  }
  return {
    trajectoryId: data.id,
    outcomeLabel: data.outcome_label as FindLatestTrajectoryResult["outcomeLabel"],
  };
}

/**
 * Reward-signal capture: when an operator approves/dismisses/edits a queued
 * AI suggestion, takes over a thread, releases it, or a lead's status moves
 * to qualified/lost/appointment_booked, we attribute the signal to the most
 * recent agent trajectory for that lead. The trajectory's outcome_label is
 * also updated so retrieval queries (e.g., "find positive trajectories") can
 * filter without joining the outcomes table.
 *
 * RL view: signal_type → reward function. Positive: operator_approve, lead_reply,
 * lead_qualified, lead_appointment_booked. Negative: operator_dismiss,
 * operator_edit (counts as a partial-fail), operator_takeover, lead_lost.
 * Operator_release after takeover is neutral. Lead_no_reply after a window
 * is mildly negative.
 */
export async function recordAgentOutcome(
  supabase: RealtyOpsSupabaseClient,
  store: AgentTrajectoryStore,
  params: RecordOutcomeParams,
): Promise<{ recorded: boolean; trajectoryId: string | null }> {
  try {
    const trajectory = await findLatestTrajectoryForLead(supabase, {
      workspaceId: params.workspaceId,
      leadId: params.leadId,
    });
    if (trajectory === null) {
      return { recorded: false, trajectoryId: null };
    }

    await store.recordOutcome({
      trajectoryId: trajectory.trajectoryId,
      workspaceId: params.workspaceId,
      signalType: params.signalType,
      signalValue: params.signalValue,
    });

    // Promote the trajectory's outcome_label if this signal is decisive.
    const nextLabel = derivePromotedOutcomeLabel({
      currentLabel: trajectory.outcomeLabel,
      signalType: params.signalType,
    });
    if (nextLabel !== null && nextLabel !== trajectory.outcomeLabel) {
      const occurredAt = new Date().toISOString();
      const update: TablesUpdate<"agent_trajectories"> = {
        outcome_label: nextLabel,
        updated_at: occurredAt,
      };
      const { error } = await supabase
        .from("agent_trajectories")
        .update(update)
        .eq("id", trajectory.trajectoryId);
      if (error !== null) {
        console.warn("Could not promote trajectory outcome_label:", error);
      }
    }

    return { recorded: true, trajectoryId: trajectory.trajectoryId };
  } catch (recordError) {
    console.warn("[recordAgentOutcome] failed:", recordError);
    return { recorded: false, trajectoryId: null };
  }
}

function derivePromotedOutcomeLabel(params: {
  currentLabel: FindLatestTrajectoryResult["outcomeLabel"];
  signalType: AgentOutcomeInsert["signalType"];
}): "positive" | "negative" | "neutral" | "pending" | null {
  // Once a trajectory is decisive, don't downgrade it on later signals.
  // The strongest signal wins on first-touch; subsequent signals stack
  // into agent_outcomes for analysis but do not flip the headline label
  // unless the new signal is stronger in the same direction.
  const strongPositive = params.signalType === "lead_qualified"
    || params.signalType === "lead_appointment_booked"
    || params.signalType === "operator_approve"
    || params.signalType === "operator_tag_positive"
    || params.signalType === "routing_accepted"
    || params.signalType === "qualification_completed"
    || params.signalType === "fub_accepted"
    || params.signalType === "showing_booked"
    || params.signalType === "converted"
    || params.signalType === "reply_engaged";
  const strongNegative = params.signalType === "lead_lost"
    || params.signalType === "operator_takeover"
    || params.signalType === "operator_dismiss"
    || params.signalType === "operator_tag_negative"
    || params.signalType === "routing_overridden"
    || params.signalType === "churned";
  const partial = params.signalType === "operator_edit"
    || params.signalType === "lead_no_reply"
    || params.signalType === "reply_no_engagement";

  if (params.currentLabel === "pending" || params.currentLabel === null) {
    if (strongPositive) return "positive";
    if (strongNegative) return "negative";
    if (partial) return "neutral";
    if (params.signalType === "lead_reply") return "positive";
    return null;
  }

  // Already decisive — don't flip on weaker signals.
  return null;
}
