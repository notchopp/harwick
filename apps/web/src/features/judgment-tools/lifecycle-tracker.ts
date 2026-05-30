import { createServerSupabaseClient } from "../../lib/supabase/server-client";

/**
 * Lifecycle outcome tracking — the data-flywheel hook.
 *
 * When a lead reaches a terminal stage in the CRM (closed_won / closed_lost)
 * we stamp every training_signal that was emitted for that lead with the
 * outcome. The labeler then picks them up on its next batch and writes
 * SFT/DPO rows into training_corpus.
 *
 * This is the loop that lets Harwick LEARN per workspace: outcomes feed back
 * into qualification quality over time. Lofty's AI is the same on day 1 as
 * day 365 because they don't have an outcome → training-signal pipeline.
 * We do.
 *
 * Phase 1 (this commit): callable helper + manual API endpoint so an
 * operator can mark a deal closed and the data flows. Phase 2: auto-fire
 * from the FUB / kvCore webhook handler when a stage_changed event with
 * target stage = closed_won/closed_lost arrives, so this happens without
 * operator action.
 */

export type LeadOutcome =
  | "closed_won"
  | "closed_lost"
  | "marked_spam"
  | "reassigned"
  | "task_completed"
  | "task_skipped";

export async function markLeadOutcome(params: {
  workspaceId: string;
  leadId: string;
  outcome: LeadOutcome;
  occurredAt?: string;
}): Promise<{ ok: boolean; updatedSignalCount: number; reason?: string }> {
  try {
    const occurredAt = params.occurredAt ?? new Date().toISOString();
    const supabase = createServerSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const untyped = supabase as any;

    // Update every unlabeled training_signal related to this lead with the
    // outcome. The labeler scans for crm_outcome IS NOT NULL on its next run
    // and converts them into training_corpus rows.
    const { data, error } = await untyped
      .from("training_signals")
      .update({
        crm_outcome: params.outcome,
        crm_outcome_at: occurredAt,
      })
      .eq("workspace_id", params.workspaceId)
      .eq("related_entity_type", "lead")
      .eq("related_entity_id", params.leadId)
      .is("labeled_at", null)
      .select("id");

    if (error !== null) {
      return { ok: false, updatedSignalCount: 0, reason: error.message ?? "update_failed" };
    }

    return {
      ok: true,
      updatedSignalCount: Array.isArray(data) ? data.length : 0,
    };
  } catch (error) {
    console.error("[markLeadOutcome] failed:", error);
    return {
      ok: false,
      updatedSignalCount: 0,
      reason: error instanceof Error ? error.message : "unknown_error",
    };
  }
}
