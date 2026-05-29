import { createServerSupabaseClient } from "../../lib/supabase/server-client";

/**
 * Labeler worker — converts labeled training_signals into training_corpus
 * rows ready for fine-tuning.
 *
 * Two shapes emerge:
 *   - "sft" (supervised fine-tuning): {prompt_input, ideal_output, outcome_class}
 *     for signals whose CRM outcome was closed_won / task_completed / kept
 *     without correction. These are the "this was right" examples.
 *   - "dpo" (direct preference optimization): pairs where the operator EDITED
 *     a Harwick-authored draft before sending. The agent's edit is the
 *     preferred output; Harwick's original is dispreferred.
 *
 * Runs as a cron-style worker. Processes signals where labeled_at IS NULL but
 * outcome is known (via CRM webhook updates to crm_outcome / crm_outcome_at).
 *
 * Mac Studio's distillation trainer (Phase 8.3) consumes training_corpus on
 * a weekly cadence to produce candidate fine-tunes.
 */

const BATCH_SIZE = 200;

type SignalRow = {
  id: string;
  workspace_id: string;
  signal_type: string;
  harwick_artifact_type: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  model_id: string;
  confidence: number | null;
  crm_outcome: string | null;
  crm_outcome_at: string | null;
  human_edit_diff: Record<string, unknown> | null;
};

function rewardSignal(outcome: string | null): number {
  switch (outcome) {
    case "closed_won":      return 1.0;
    case "task_completed":  return 0.7;
    case "reassigned":      return -0.3;
    case "marked_spam":     return -0.8;
    case "closed_lost":     return -0.5;
    case "task_skipped":    return -0.4;
    default:                return 0.1;
  }
}

function isPositiveOutcome(outcome: string | null): boolean {
  return outcome === "closed_won" || outcome === "task_completed";
}

export async function runLabelerBatch(): Promise<{ processed: number; sftRows: number; dpoRows: number }> {
  const supabase = createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const untyped = supabase as any;

  const { data } = await untyped
    .from("training_signals")
    .select("id, workspace_id, signal_type, harwick_artifact_type, inputs, outputs, model_id, confidence, crm_outcome, crm_outcome_at, human_edit_diff")
    .is("labeled_at", null)
    .not("crm_outcome", "is", null)
    .limit(BATCH_SIZE);

  const signals = (data ?? []) as SignalRow[];
  let sftRows = 0;
  let dpoRows = 0;

  for (const signal of signals) {
    // Skip shadow decisions — they're observability, not training material until
    // we cut over to the LLM-as-decider.
    if (signal.signal_type === "shadow_decision") {
      await untyped.from("training_signals").update({ labeled_at: new Date().toISOString() }).eq("id", signal.id);
      continue;
    }

    const toolName = signal.harwick_artifact_type.replace(/^judgment:/, "");
    const reward = rewardSignal(signal.crm_outcome);

    if (isPositiveOutcome(signal.crm_outcome)) {
      // SFT: ideal_output is what Harwick said + the outcome confirmed it
      await untyped.from("training_corpus").insert({
        workspace_id: signal.workspace_id,
        source_signal_id: signal.id,
        tool_name: toolName,
        shape: "sft",
        prompt_input: signal.inputs,
        ideal_output: signal.outputs,
        outcome_class: signal.crm_outcome,
        reward_signal: reward,
        source_model_id: signal.model_id,
      });
      sftRows += 1;
    }

    if (signal.human_edit_diff !== null) {
      // DPO: operator edited Harwick's output -> preference pair
      const preferred = (signal.human_edit_diff as Record<string, unknown>)["preferredOutput"] ?? signal.human_edit_diff;
      await untyped.from("training_corpus").insert({
        workspace_id: signal.workspace_id,
        source_signal_id: signal.id,
        tool_name: toolName,
        shape: "dpo",
        prompt_input: signal.inputs,
        ideal_output: preferred,
        dispreferred_output: signal.outputs,
        outcome_class: signal.crm_outcome ?? "human_edited",
        reward_signal: reward,
        source_model_id: signal.model_id,
      });
      dpoRows += 1;
    }

    await untyped.from("training_signals").update({ labeled_at: new Date().toISOString() }).eq("id", signal.id);
  }

  return { processed: signals.length, sftRows, dpoRows };
}
