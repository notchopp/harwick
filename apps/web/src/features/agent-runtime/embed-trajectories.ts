import type { EmbeddingClient } from "@realty-ops/integrations";
import type { AgentTrajectoryStore } from "../../lib/supabase/agent-trajectory-store";
import type { RealtyOpsSupabaseClient } from "../../lib/supabase/server-client";

/**
 * Trajectory embedding worker.
 *
 * For every trajectory whose outcome_label is no longer 'pending' but whose
 * summary_embedding is still null, embed the summary_text and persist the
 * embedding. The embeddings power the in-context retrieval RL pathway:
 * at decision time the runtime embeds the new state and finds the top-N
 * similar past trajectories with positive outcomes, injecting their
 * summaries as few-shot examples.
 *
 * Runs alongside reconcile-trajectories on the same cron cadence. Reconcile
 * promotes outcome_label first; embedding picks up the newly promoted rows
 * on the next tick.
 */

type PendingEmbeddingRow = {
  id: string;
  workspace_id: string;
  summary_text: string | null;
};

export type TrajectoryEmbedderDeps = {
  supabase: RealtyOpsSupabaseClient;
  store: AgentTrajectoryStore;
  embeddings: EmbeddingClient;
  batchSize?: number;
};

export type TrajectoryEmbedderReport = {
  scanned: number;
  embedded: number;
  skipped: number;
  errors: number;
};

export async function embedPendingTrajectories(deps: TrajectoryEmbedderDeps): Promise<TrajectoryEmbedderReport> {
  const batchSize = deps.batchSize ?? 25;

  const { data, error } = await deps.supabase
    .from("agent_trajectories")
    .select("id, workspace_id, summary_text")
    .neq("outcome_label", "pending")
    .is("summary_embedding", null)
    .not("summary_text", "is", null)
    .order("updated_at", { ascending: true })
    .limit(batchSize);

  if (error !== null) {
    return { scanned: 0, embedded: 0, skipped: 0, errors: 1 };
  }

  const rows = (data ?? []) as PendingEmbeddingRow[];
  let embedded = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    const text = row.summary_text?.trim();
    if (text === undefined || text.length === 0) {
      skipped += 1;
      continue;
    }
    try {
      const embedding = await deps.embeddings.embed(text);
      await deps.store.saveTrajectoryEmbedding({
        trajectoryId: row.id,
        embedding,
      });
      embedded += 1;
    } catch (embedError) {
      console.warn("[embedPendingTrajectories] failed for trajectory", row.id, embedError);
      errors += 1;
    }
  }

  return { scanned: rows.length, embedded, skipped, errors };
}
