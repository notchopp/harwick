import { runJudgmentDefault } from "./supabase-cache";
import { createServerSupabaseClient } from "../../lib/supabase/server-client";

/**
 * Shadow-mode wrappers for write-time tools.
 *
 * Phase 3 + Phase 4 cut-over plan: each new judgment-tool decision runs
 * ALONGSIDE the existing deterministic logic for 7 days, logging diffs to
 * shadow_decisions. After observation we flip the call site to honor the
 * LLM verdict.
 *
 * Shadow rows are stored as training_signals rows with signal_type=
 * "shadow_decision" so they live in the same corpus that feeds distillation.
 * No new table needed.
 */

export async function shadowReconcileQualification(params: {
  workspaceId: string;
  leadId: string;
  existing: Record<string, unknown>;
  incoming: Record<string, unknown>;
  deterministicVerdict: "merge_overwrite" | "no_change";
}): Promise<void> {
  try {
    const llmResult = await runJudgmentDefault({
      forceRegen: false,
      workspaceId: params.workspaceId,
      tool: "reconcileQualification",
      audience: {
        role: "system",
        memberId: null,
        voicePersona: null,
        scope: "workspace",
      },
      destination: "internal_audit",
      input: {
        leadId: params.leadId,
        existing: params.existing,
        incoming: params.incoming,
        sessionMetadata: {
          ipHash: null,
          userAgent: null,
          deviceHint: null,
          timeSinceLastSession: null,
        },
      },
    });

    const matches = llmResult.envelope.verdict === "merge" && params.deterministicVerdict === "merge_overwrite";

    // Write a dedicated comparison row for observability.
    const supabase = createServerSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const untyped = supabase as any;
    await untyped.from("training_signals").insert({
      workspace_id: params.workspaceId,
      signal_type: "shadow_decision",
      harwick_artifact_type: "shadow:reconcileQualification",
      inputs: {
        existing: params.existing,
        incoming: params.incoming,
        deterministicVerdict: params.deterministicVerdict,
      },
      outputs: {
        llmVerdict: llmResult.envelope.verdict,
        deterministicVerdict: params.deterministicVerdict,
        verdictsMatch: matches,
        llmHeadline: llmResult.envelope.brief.headline,
        llmDeltas: llmResult.envelope.deltas,
      },
      model_id: llmResult.model,
      confidence: llmResult.envelope.confidence,
      related_entity_type: "lead",
      related_entity_id: params.leadId,
    });
  } catch (error) {
    console.error("[shadow:reconcileQualification] failed:", error);
  }
}

export async function shadowDedupeTask(params: {
  workspaceId: string;
  proposedTask: {
    taskType: string;
    leadId: string;
    listingId: string | null;
    title: string;
    description: string | null;
    requestedStartAt: string | null;
  };
  existingOpenTasks: Array<Record<string, unknown>>;
  deterministicVerdict: "insert" | "update" | "skip";
}): Promise<void> {
  try {
    const llmResult = await runJudgmentDefault({
      forceRegen: false,
      workspaceId: params.workspaceId,
      tool: "dedupeTask",
      audience: {
        role: "system",
        memberId: null,
        voicePersona: null,
        scope: "workspace",
      },
      destination: "internal_audit",
      input: {
        proposedTask: params.proposedTask,
        existingOpenTasks: params.existingOpenTasks,
      },
    });

    const matches = llmResult.envelope.verdict === params.deterministicVerdict;

    const supabase = createServerSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const untyped = supabase as any;
    await untyped.from("training_signals").insert({
      workspace_id: params.workspaceId,
      signal_type: "shadow_decision",
      harwick_artifact_type: "shadow:dedupeTask",
      inputs: {
        proposedTask: params.proposedTask,
        existingOpenTasks: params.existingOpenTasks,
        deterministicVerdict: params.deterministicVerdict,
      },
      outputs: {
        llmVerdict: llmResult.envelope.verdict,
        deterministicVerdict: params.deterministicVerdict,
        verdictsMatch: matches,
        llmHeadline: llmResult.envelope.brief.headline,
      },
      model_id: llmResult.model,
      confidence: llmResult.envelope.confidence,
      related_entity_type: "lead",
      related_entity_id: params.proposedTask.leadId,
    });
  } catch (error) {
    console.error("[shadow:dedupeTask] failed:", error);
  }
}

export async function shadowRecommendRouting(params: {
  workspaceId: string;
  leadId: string;
  leadState: Record<string, unknown>;
  agents: Array<{
    memberId: string;
    displayName: string;
    roleLabel: string;
    areas: string[];
    propertyTypes: string[];
    leadTypes: string[];
    budgetRange: { min: number | null; max: number | null };
    activeLeadCount: number;
    maxActiveLeads: number;
    acceptsNewLeads: boolean;
    deterministicMatchScore: number;
    deterministicReasons: string[];
    personaNote: string | null;
  }>;
  deterministicPickedMemberId: string | null;
}): Promise<void> {
  try {
    const llmResult = await runJudgmentDefault({
      forceRegen: false,
      workspaceId: params.workspaceId,
      tool: "recommendRouting",
      audience: {
        role: "system",
        memberId: null,
        voicePersona: null,
        scope: "workspace",
      },
      destination: "internal_audit",
      input: {
        leadId: params.leadId,
        leadState: params.leadState,
        agents: params.agents,
      },
    });

    const supabase = createServerSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const untyped = supabase as any;
    await untyped.from("training_signals").insert({
      workspace_id: params.workspaceId,
      signal_type: "shadow_decision",
      harwick_artifact_type: "shadow:recommendRouting",
      inputs: {
        leadState: params.leadState,
        agentCount: params.agents.length,
        deterministicPickedMemberId: params.deterministicPickedMemberId,
      },
      outputs: {
        llmVerdict: llmResult.envelope.verdict,
        llmHeadline: llmResult.envelope.brief.headline,
        deterministicPickedMemberId: params.deterministicPickedMemberId,
      },
      model_id: llmResult.model,
      confidence: llmResult.envelope.confidence,
      related_entity_type: "lead",
      related_entity_id: params.leadId,
    });
  } catch (error) {
    console.error("[shadow:recommendRouting] failed:", error);
  }
}
