import {
  computeDefaultCostUsd,
  JudgmentEnvelopeSchema,
  runJudgment,
  type Audience,
  type BriefCacheReader,
  type BriefCacheWriter,
  type Destination,
  type JudgmentEnvelope,
  type JudgmentRunInput,
  type JudgmentRunResult,
  type JudgmentToolName,
  type RunJudgmentDeps,
  type ToolExecutor,
  type TrainingSignalWriter,
} from "@realty-ops/core";

import { createServerSupabaseClient } from "../../lib/supabase/server-client";

/**
 * Production wiring for runJudgment. Pulls/pushes cache rows from
 * harwick_briefs, writes training_signals rows, executes tools via OpenAI.
 *
 * Phase 0 ships the cache + signal writers. The toolExecutor is a stub that
 * returns low-confidence "not yet implemented" envelopes for every tool —
 * intentional, so callers fall back to deterministic rules until each tool
 * is wired in subsequent phases.
 */

export const createSupabaseBriefCacheReader = (): BriefCacheReader => async (params) => {
  const supabase = createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const untyped = supabase as any;
  const { data } = await untyped
    .from("harwick_briefs")
    .select("headline, body, suggested_actions, state_hash, model, generated_at, confidence, rationale")
    .eq("workspace_id", params.workspaceId)
    .eq("entity_type", params.entityType)
    .eq("entity_id", params.entityId)
    .eq("audience_hash", params.audienceHash)
    .eq("destination", params.destination)
    .maybeSingle();
  if (data === null || data === undefined) return null;
  const envelope: JudgmentEnvelope = {
    verdict: "cached",
    brief: { headline: data.headline, body: data.body },
    deltas: [],
    suggestedActions: Array.isArray(data.suggested_actions) ? data.suggested_actions : [],
    confidence: typeof data.confidence === "number" ? data.confidence : 0,
    rationale: typeof data.rationale === "string" ? data.rationale : null,
  };
  return {
    envelope,
    stateHash: data.state_hash,
    model: data.model,
    generatedAt: data.generated_at,
  };
};

export const createSupabaseBriefCacheWriter = (): BriefCacheWriter => async (params) => {
  const supabase = createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const untyped = supabase as any;
  await untyped.from("harwick_briefs").upsert(
    {
      workspace_id: params.workspaceId,
      entity_type: params.entityType,
      entity_id: params.entityId,
      audience_hash: params.audienceHash,
      destination: params.destination,
      audience: params.audience,
      headline: params.envelope.brief.headline,
      body: params.envelope.brief.body,
      suggested_actions: params.envelope.suggestedActions,
      state_hash: params.stateHash,
      model: params.model,
      confidence: params.envelope.confidence,
      rationale: params.envelope.rationale,
      generated_at: new Date().toISOString(),
      expires_at: params.expiresAt,
    },
    { onConflict: "workspace_id,entity_type,entity_id,audience_hash,destination" },
  );
};

export const createSupabaseTrainingSignalWriter = (): TrainingSignalWriter => async (params) => {
  const supabase = createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const untyped = supabase as any;
  const { data, error } = await untyped
    .from("training_signals")
    .insert({
      workspace_id: params.workspaceId,
      signal_type: "judgment_emission",
      harwick_artifact_id: params.artifactId,
      harwick_artifact_type: params.artifactType,
      inputs: params.inputs,
      outputs: params.outputs,
      model_id: params.modelId,
      confidence: params.confidence,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      related_entity_type: params.relatedEntityType,
      related_entity_id: params.relatedEntityId,
    })
    .select("id")
    .single();
  if (error !== null && error !== undefined) {
    // Failing to write a training signal must not break the user-facing call.
    // Log + return a placeholder id. The corpus loses one row; the operator
    // surface keeps working.
    console.error("[training_signals] insert failed:", error);
    return { trainingSignalId: "00000000-0000-0000-0000-000000000000" };
  }
  return { trainingSignalId: data.id as string };
};

/**
 * Phase 0 stub executor — every tool returns low confidence so callers fall
 * back to deterministic rules. Replaced phase-by-phase as each tool implementation
 * lands and registers itself in the registry.
 */
export const createStubToolExecutor = (): ToolExecutor => async ({ tool }) => {
  return {
    envelope: {
      verdict: "stub",
      brief: {
        headline: `${tool.name} is not implemented yet`,
        body: `This tool's prompt and execution have not been wired. The caller should fall back to deterministic logic for this surface. Returning low-confidence stub so the runner aborts before serving cached output.`,
      },
      deltas: [],
      suggestedActions: [],
      confidence: 0,
      rationale: "stub-executor",
    },
    modelUsed: "stub",
    inputTokens: 0,
    outputTokens: 0,
  };
};

function deriveEntityIdentityDefault(tool: JudgmentToolName, input: Record<string, unknown>) {
  // Cover the common shapes; tools with non-standard shapes can be added here
  // as they're implemented. Bail to ("unknown", "unknown") if we can't find one.
  const t = typeof input["type"] === "string" ? (input["type"] as string) : null;
  const id = typeof input["id"] === "string" ? (input["id"] as string)
    : typeof input["entityId"] === "string" ? (input["entityId"] as string)
    : typeof input["leadId"] === "string" ? (input["leadId"] as string)
    : typeof input["memberId"] === "string" ? (input["memberId"] as string)
    : typeof input["workspaceId"] === "string" ? (input["workspaceId"] as string)
    : "unknown";
  const entityType = t ?? (tool === "briefWorkspace" ? "workspace"
    : tool === "briefTeamMember" ? "team_member"
    : tool === "triageQueue" ? "workspace_queue"
    : tool === "reconcileQualification" ? "lead"
    : tool === "recommendRouting" ? "lead"
    : tool === "classifyActionability" ? "lead"
    : tool === "decideAction" ? "lead"
    : tool === "dedupeTask" ? "task"
    : tool === "interpretPolicy" ? "policy"
    : tool === "pickNurtureAction" ? "nurture_enrollment"
    : tool === "inferVoiceOutcome" ? "voice_call"
    : tool === "reconcileConflict" ? "lead"
    : "entity");
  return { entityType, entityId: id };
}

/** Compose the default Phase 0 deps wiring — cache+signals real, executor stub. */
export function defaultRunJudgmentDeps(): RunJudgmentDeps {
  return {
    readBriefCache: createSupabaseBriefCacheReader(),
    writeBriefCache: createSupabaseBriefCacheWriter(),
    writeTrainingSignal: createSupabaseTrainingSignalWriter(),
    executeTool: createStubToolExecutor(),
    deriveEntityIdentity: deriveEntityIdentityDefault,
    computeCostUsd: computeDefaultCostUsd,
  };
}

/** Convenience wrapper — the production caller almost always wants the default deps. */
export async function runJudgmentDefault(input: JudgmentRunInput): Promise<JudgmentRunResult> {
  return runJudgment(input, defaultRunJudgmentDeps());
}

export type { Audience, Destination, JudgmentEnvelope, JudgmentRunInput, JudgmentRunResult };
export { JudgmentEnvelopeSchema };
