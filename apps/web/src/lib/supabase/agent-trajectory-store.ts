import type { Json, TablesInsert, TablesUpdate } from "./database.types";
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
  threadId?: string | null;
  startedAt?: string;
};

export type ThreadTurnSummary = {
  trajectoryId: string;
  startedAt: string;
  inboundText: string | null;
  reply: string | null;
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
  loadThreadHistory(params: {
    workspaceId: string;
    threadId: string;
    limit?: number;
  }): Promise<ThreadTurnSummary[]>;
};

export function createSupabaseAgentTrajectoryStore(
  supabase: RealtyOpsSupabaseClient,
): AgentTrajectoryStore {
  return {
    async startTrajectory(params) {
      // thread_id is a forward-compatible column added by migration
      // 20260513000100. The generated types don't know about it yet, so we
      // cast the insert payload through unknown.
      const insert = {
        workspace_id: params.workspaceId,
        lead_id: params.leadId,
        channel: params.channel,
        started_at: params.startedAt ?? new Date().toISOString(),
        ...(params.threadId === undefined || params.threadId === null ? {} : { thread_id: params.threadId }),
      } as unknown as TablesInsert<"agent_trajectories">;
      const { data, error } = await supabase
        .from("agent_trajectories")
        .insert(insert)
        .select("id")
        .single();

      if (error !== null) {
        throw error;
      }
      return { trajectoryId: data.id };
    },

    async appendStep(params) {
      const insert: TablesInsert<"agent_steps"> = {
        trajectory_id: params.trajectoryId,
        workspace_id: params.workspaceId,
        lead_id: params.leadId,
        iteration: params.iteration,
        input_snapshot: params.inputSnapshot as Json,
        turn_output: params.turnOutput as Json,
        tool_executions: params.toolExecutions as Json,
        self_gate_auto_execute: params.selfGateAutoExecute,
        self_gate_reason: params.selfGateReason,
        deterministic_gate_auto_execute: params.deterministicGateAutoExecute,
        gates_agreed: params.gatesAgreed,
        exit_reason: params.exitReason,
        harwick_ai_turn_id: params.harwickAiTurnId,
      };
      const { data, error } = await supabase
        .from("agent_steps")
        .insert(insert)
        .select("id")
        .single();

      if (error !== null) {
        throw error;
      }
      return { stepId: data.id };
    },

    async completeTrajectory(params) {
      const update: TablesUpdate<"agent_trajectories"> = {
        completed_at: params.completedAt,
        completion_reason: params.completionReason,
        step_count: params.stepCount,
        final_lead_status: params.finalLeadStatus ?? null,
        summary_text: params.summaryText ?? null,
        outcome_label: params.outcomeLabel ?? "pending",
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("agent_trajectories")
        .update(update)
        .eq("id", params.trajectoryId);

      if (error !== null) {
        throw error;
      }
    },

    async recordOutcome(params) {
      const insert: TablesInsert<"agent_outcomes"> = {
        trajectory_id: params.trajectoryId,
        workspace_id: params.workspaceId,
        attributed_to_step_id: params.attributedToStepId ?? null,
        signal_type: params.signalType,
        signal_value: params.signalValue as Json,
        recorded_at: params.recordedAt ?? new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from("agent_outcomes")
        .insert(insert)
        .select("id")
        .single();

      if (error !== null) {
        throw error;
      }
      return { outcomeId: data.id };
    },

    async saveTrajectoryEmbedding(params) {
      const update: TablesUpdate<"agent_trajectories"> = {
        summary_embedding: params.embedding,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("agent_trajectories")
        .update(update)
        .eq("id", params.trajectoryId);

      if (error !== null) {
        throw error;
      }
    },

    async saveStepEmbedding(params) {
      const { error } = await supabase
        .from("agent_steps")
        .update({ input_embedding: params.embedding })
        .eq("id", params.stepId);

      if (error !== null) {
        throw error;
      }
    },

    async loadThreadHistory(params) {
      // Pull the latest trajectories for this thread, then for each take the
      // first step's input_snapshot (the user message) and turn_output (the
      // assistant reply). Returned in chronological order so the runtime can
      // feed them directly into the model's conversation history.
      const limit = params.limit ?? 8;
      const { data: trajectories, error: trajErr } = await supabase
        .from("agent_trajectories")
        .select("id, started_at")
        .eq("workspace_id", params.workspaceId)
        .eq("thread_id" as never, params.threadId as never)
        .order("started_at", { ascending: false })
        .limit(limit);

      if (trajErr !== null || trajectories === null || trajectories.length === 0) {
        return [];
      }

      const ids = trajectories.map((row) => row.id);
      const { data: steps, error: stepsErr } = await supabase
        .from("agent_steps")
        .select("trajectory_id, iteration, input_snapshot, turn_output")
        .in("trajectory_id", ids)
        .order("iteration", { ascending: true });

      if (stepsErr !== null) {
        return [];
      }

      const stepsByTrajectory = new Map<string, typeof steps>();
      for (const step of steps ?? []) {
        const list = stepsByTrajectory.get(step.trajectory_id) ?? [];
        list.push(step);
        stepsByTrajectory.set(step.trajectory_id, list);
      }

      const turns: ThreadTurnSummary[] = trajectories
        .map((traj) => {
          const trajSteps = stepsByTrajectory.get(traj.id) ?? [];
          const first = trajSteps[0];
          if (first === undefined) return null;
          const inboundText = readString((first.input_snapshot as Record<string, unknown> | null)?.["inboundText"])
            ?? readString((first.input_snapshot as Record<string, unknown> | null)?.["message"]);
          const reply = readString((first.turn_output as Record<string, unknown> | null)?.["reply"]);
          return {
            trajectoryId: traj.id,
            startedAt: traj.started_at,
            inboundText: inboundText ?? null,
            reply: reply ?? null,
          };
        })
        .filter((value): value is ThreadTurnSummary => value !== null);

      // Reverse so oldest-first (chronological for model context).
      return turns.reverse();
    },
  };
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
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
  const { data, error } = await supabase.rpc("match_agent_trajectories", {
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
