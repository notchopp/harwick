import type { RealtyOpsSupabaseClient } from "./server-client";

export type AgentStepInsert = {
  trajectoryId: string;
  workspaceId: string;
  leadId: string | null;
  iteration: number;
  inputSnapshot: unknown;
  turnOutput: unknown;
  toolExecutions: unknown[];
  selfGateAutoExecute: boolean | null;
  selfGateReason: string | null;
  deterministicGateAutoExecute: boolean | null;
  gatesAgreed: boolean | null;
  exitReason: string | null;
  harwickAiTurnId: string | null;
};

export type AgentTrajectoryInsert = {
  workspaceId: string;
  leadId: string | null;
  channel: string | null;
  startedAt?: string;
};

export type AgentTrajectoryCompletion = {
  trajectoryId: string;
  completedAt: string;
  completionReason: string;
  stepCount: number;
  finalLeadStatus?: string | null;
  summaryText?: string | null;
  outcomeLabel?: "positive" | "negative" | "neutral" | "pending";
};

export type AgentOutcomeInsert = {
  trajectoryId: string;
  workspaceId: string;
  attributedToStepId?: string | null;
  signalType:
    | "operator_approve"
    | "operator_dismiss"
    | "operator_edit"
    | "operator_takeover"
    | "operator_release"
    | "operator_tag_positive"
    | "operator_tag_negative"
    | "operator_tag_note"
    | "routing_accepted"
    | "routing_overridden"
    | "lead_reply"
    | "lead_no_reply"
    | "lead_qualified"
    | "lead_lost"
    | "lead_appointment_booked"
    | "lead_status_change"
    | "reply_engaged"
    | "reply_no_engagement"
    | "qualification_completed"
    | "fub_accepted"
    | "showing_booked"
    | "converted"
    | "churned";
  signalValue: Record<string, unknown>;
  recordedAt?: string;
};

export type AgentTrajectoryStore = {
  startTrajectory(params: AgentTrajectoryInsert): Promise<{ trajectoryId: string }>;
  appendStep(params: AgentStepInsert): Promise<{ stepId: string }>;
  completeTrajectory(params: AgentTrajectoryCompletion): Promise<void>;
  recordOutcome(params: AgentOutcomeInsert): Promise<{ outcomeId: string }>;
  saveTrajectoryEmbedding(params: {
    trajectoryId: string;
    embedding: number[];
  }): Promise<void>;
  saveStepEmbedding(params: {
    stepId: string;
    embedding: number[];
  }): Promise<void>;
};

export function createSupabaseAgentTrajectoryStore(
  supabase: RealtyOpsSupabaseClient,
): AgentTrajectoryStore {
  return {
    async startTrajectory(params) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("agent_trajectories")
        .insert({
          workspace_id: params.workspaceId,
          lead_id: params.leadId,
          channel: params.channel,
          started_at: params.startedAt ?? new Date().toISOString(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        .select("id")
        .single();

      if (error !== null) {
        throw error;
      }
      return { trajectoryId: (data as { id: string }).id };
    },

    async appendStep(params) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("agent_steps")
        .insert({
          trajectory_id: params.trajectoryId,
          workspace_id: params.workspaceId,
          lead_id: params.leadId,
          iteration: params.iteration,
          input_snapshot: params.inputSnapshot,
          turn_output: params.turnOutput,
          tool_executions: params.toolExecutions,
          self_gate_auto_execute: params.selfGateAutoExecute,
          self_gate_reason: params.selfGateReason,
          deterministic_gate_auto_execute: params.deterministicGateAutoExecute,
          gates_agreed: params.gatesAgreed,
          exit_reason: params.exitReason,
          harwick_ai_turn_id: params.harwickAiTurnId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        .select("id")
        .single();

      if (error !== null) {
        throw error;
      }
      return { stepId: (data as { id: string }).id };
    },

    async completeTrajectory(params) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("agent_trajectories")
        .update({
          completed_at: params.completedAt,
          completion_reason: params.completionReason,
          step_count: params.stepCount,
          final_lead_status: params.finalLeadStatus ?? null,
          summary_text: params.summaryText ?? null,
          outcome_label: params.outcomeLabel ?? "pending",
          updated_at: new Date().toISOString(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        .eq("id", params.trajectoryId);

      if (error !== null) {
        throw error;
      }
    },

    async recordOutcome(params) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("agent_outcomes")
        .insert({
          trajectory_id: params.trajectoryId,
          workspace_id: params.workspaceId,
          attributed_to_step_id: params.attributedToStepId ?? null,
          signal_type: params.signalType,
          signal_value: params.signalValue,
          recorded_at: params.recordedAt ?? new Date().toISOString(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        .select("id")
        .single();

      if (error !== null) {
        throw error;
      }
      return { outcomeId: (data as { id: string }).id };
    },

    async saveTrajectoryEmbedding(params) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("agent_trajectories")
        .update({
          summary_embedding: params.embedding as unknown as never,
          updated_at: new Date().toISOString(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        .eq("id", params.trajectoryId);

      if (error !== null) {
        throw error;
      }
    },

    async saveStepEmbedding(params) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("agent_steps")
        .update({
          input_embedding: params.embedding as unknown as never,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        .eq("id", params.stepId);

      if (error !== null) {
        throw error;
      }
    },
  };
}

/**
 * In-context retrieval RL: at decision time, embed the new state and find
 * top-N similar past trajectories where the outcome was positive. Inject
 * those as few-shot examples in the system prompt. Behavior improves
 * without gradient updates.
 */
export type SimilarTrajectoryMatch = {
  id: string;
  workspaceId: string;
  leadId: string | null;
  channel: string | null;
  startedAt: string;
  completedAt: string | null;
  completionReason: string | null;
  outcomeLabel: string | null;
  stepCount: number;
  finalLeadStatus: string | null;
  summaryText: string | null;
  similarity: number;
};

export async function findSimilarTrajectories(
  supabase: RealtyOpsSupabaseClient,
  params: {
    workspaceId: string;
    embedding: number[];
    limit?: number;
    minSimilarity?: number;
    requireOutcome?: "positive" | "negative" | "neutral" | "pending";
  },
): Promise<SimilarTrajectoryMatch[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("match_agent_trajectories", {
    workspace: params.workspaceId,
    query_embedding: params.embedding,
    match_count: params.limit ?? 5,
    min_similarity: params.minSimilarity ?? 0.2,
    require_outcome: params.requireOutcome ?? null,
  });

  if (error !== null) {
    throw error;
  }

  return ((data ?? []) as Array<{
    id: string;
    workspace_id: string;
    lead_id: string | null;
    channel: string | null;
    started_at: string;
    completed_at: string | null;
    completion_reason: string | null;
    outcome_label: string | null;
    step_count: number;
    final_lead_status: string | null;
    summary_text: string | null;
    similarity: number;
  }>).map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    leadId: row.lead_id,
    channel: row.channel,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    completionReason: row.completion_reason,
    outcomeLabel: row.outcome_label,
    stepCount: row.step_count,
    finalLeadStatus: row.final_lead_status,
    summaryText: row.summary_text,
    similarity: row.similarity,
  }));
}
