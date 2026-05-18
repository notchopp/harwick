import type { RealtyOpsSupabaseClient } from "./server-client";
import {
  WorkspaceChannelIntentSchema,
  WorkspaceOnboardingStateSchema,
  WorkspaceReplyExampleSchema,
  type CaptureReplyExamplesInput,
  type RegisterChannelIntentInput,
  type SetWorkspaceIdentityInput,
  type WorkspaceChannelIntent,
  type WorkspaceOnboardingBeat,
  type WorkspaceOnboardingState,
  type WorkspaceReplyExample,
} from "@realty-ops/core";

const BEAT_COLUMN: Record<WorkspaceOnboardingBeat, "identity_done" | "reply_examples_done" | "channel_intent_done"> = {
  identity: "identity_done",
  reply_examples: "reply_examples_done",
  channel_intent: "channel_intent_done",
};

function mapState(row: {
  workspace_id: string;
  identity_done: boolean;
  reply_examples_done: boolean;
  channel_intent_done: boolean;
  completed_at: string | null;
  updated_at: string;
}): WorkspaceOnboardingState {
  return WorkspaceOnboardingStateSchema.parse({
    workspaceId: row.workspace_id,
    identityDone: row.identity_done,
    replyExamplesDone: row.reply_examples_done,
    channelIntentDone: row.channel_intent_done,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  });
}

function defaultOnboardingState(workspaceId: string): WorkspaceOnboardingState {
  // Used when the workspace_onboarding_state table hasn't been migrated in
  // yet — returns "all beats complete" so /onboarding/setup short-circuits
  // to /home instead of looping on a missing-table error.
  const nowIso = new Date().toISOString();
  return WorkspaceOnboardingStateSchema.parse({
    workspaceId,
    identityDone: true,
    replyExamplesDone: true,
    channelIntentDone: true,
    completedAt: nowIso,
    updatedAt: nowIso,
  });
}

function isMissingRelationError(error: { code?: string | undefined; message?: string | undefined } | null): boolean {
  if (error === null) return false;
  if (error.code === "PGRST205" || error.code === "42P01") return true;
  const message = error.message ?? "";
  return message.includes("Could not find the table")
    || message.includes("Could not find the relation")
    || /relation .* does not exist/i.test(message);
}

export async function getWorkspaceOnboardingState(
  supabase: RealtyOpsSupabaseClient,
  workspaceId: string,
): Promise<WorkspaceOnboardingState> {
  const { data, error } = await supabase
    .from("workspace_onboarding_state")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error !== null) {
    if (isMissingRelationError(error)) {
      console.warn(
        "[getWorkspaceOnboardingState] workspace_onboarding_state missing — apply supabase/migrations/20260517000600_workspace_onboarding_state.sql",
      );
      return defaultOnboardingState(workspaceId);
    }
    throw new Error(`Failed to fetch onboarding state: ${error.message}`);
  }

  if (data === null) {
    // Trigger should have created the row at workspace insert, but defend
    // against legacy workspaces by creating it lazily.
    const { data: inserted, error: insertError } = await supabase
      .from("workspace_onboarding_state")
      .insert({ workspace_id: workspaceId })
      .select("*")
      .single();
    if (insertError !== null) {
      if (isMissingRelationError(insertError)) {
        console.warn(
          "[getWorkspaceOnboardingState] workspace_onboarding_state missing on insert — apply migration",
        );
        return defaultOnboardingState(workspaceId);
      }
      throw new Error(`Failed to bootstrap onboarding state: ${insertError.message}`);
    }
    return mapState(inserted);
  }

  return mapState(data);
}

export async function markOnboardingBeatComplete(
  supabase: RealtyOpsSupabaseClient,
  workspaceId: string,
  beat: WorkspaceOnboardingBeat,
): Promise<WorkspaceOnboardingState> {
  const nowIso = new Date().toISOString();
  const beatUpdate: {
    identity_done?: boolean;
    reply_examples_done?: boolean;
    channel_intent_done?: boolean;
    updated_at: string;
  } = { updated_at: nowIso };
  const column = BEAT_COLUMN[beat];
  beatUpdate[column] = true;

  const { data, error } = await supabase
    .from("workspace_onboarding_state")
    .update(beatUpdate)
    .eq("workspace_id", workspaceId)
    .select("*")
    .single();
  if (error !== null) {
    throw new Error(`Failed to mark onboarding beat: ${error.message}`);
  }

  const state = mapState(data);

  // If all three beats are now done, stamp completed_at so /onboarding/setup
  // knows to redirect to /home on next load.
  if (
    state.identityDone
    && state.replyExamplesDone
    && state.channelIntentDone
    && state.completedAt === null
  ) {
    const { data: completedRow, error: completeError } = await supabase
      .from("workspace_onboarding_state")
      .update({ completed_at: nowIso, updated_at: nowIso })
      .eq("workspace_id", workspaceId)
      .select("*")
      .single();
    if (completeError !== null) {
      throw new Error(`Failed to complete onboarding: ${completeError.message}`);
    }
    return mapState(completedRow);
  }

  return state;
}

/**
 * Workspace identity is persisted onto the workspaces row (display name) and
 * onto workspace_settings (type, primary areas, tone description). For MVP we
 * just store everything inline on the workspaces table via a metadata jsonb
 * column if it exists, falling back to a no-op so this never blocks the beat.
 */
export async function persistWorkspaceIdentity(
  supabase: RealtyOpsSupabaseClient,
  workspaceId: string,
  input: SetWorkspaceIdentityInput,
): Promise<void> {
  if (input.workspaceDisplayName !== undefined) {
    const { error } = await supabase
      .from("workspaces")
      .update({ name: input.workspaceDisplayName })
      .eq("id", workspaceId);
    if (error !== null) {
      throw new Error(`Failed to persist workspace identity: ${error.message}`);
    }
  }

  // The type / primary areas / tone description are written as an
  // onboarding-sourced workspace memory so the runtime picks them up
  // automatically on first lead. Keeps this schema lean — we don't add a
  // dedicated workspace_profile table unless we need richer querying.
  const memoryBody = [
    `Workspace type: ${input.workspaceType}`,
    `Primary areas: ${input.primaryAreas.join(", ")}`,
    input.leadTypes.length > 0 ? `Lead types: ${input.leadTypes.join(", ")}` : null,
    input.priceBands.length > 0 ? `Price bands: ${input.priceBands.join(", ")}` : null,
    input.listingFocus.length > 0 ? `Listing focus: ${input.listingFocus.join(", ")}` : null,
    input.routingNotes !== undefined && input.routingNotes.length > 0
      ? `Routing notes: ${input.routingNotes}`
      : null,
    `Tone: ${input.toneDescription}`,
  ].filter((line): line is string => line !== null).join("\n");

  const { error: memoryError } = await supabase
    .from("workspace_memory_documents")
    .insert({
      workspace_id: workspaceId,
      memory_type: "operator_feedback",
      title: "Workspace identity (captured at onboarding)",
      body: memoryBody,
      source: "onboarding",
      evidence: { source: "onboarding_identity", workspaceType: input.workspaceType },
      confidence: 1,
    });
  if (memoryError !== null) {
    // Memory tables exist in production but may not in some test envs.
    // Log and continue — the beat itself completes regardless.
    console.warn("[persistWorkspaceIdentity] workspace_memory_documents insert failed", memoryError.message);
  }
}

export async function persistReplyExamples(
  supabase: RealtyOpsSupabaseClient,
  workspaceId: string,
  input: CaptureReplyExamplesInput,
): Promise<WorkspaceReplyExample[]> {
  const rows = input.examples.map((example) => ({
    workspace_id: workspaceId,
    body: example.body,
    source: example.source,
  }));

  const { data, error } = await supabase
    .from("workspace_reply_examples")
    .insert(rows)
    .select("*");
  if (error !== null) {
    throw new Error(`Failed to persist reply examples: ${error.message}`);
  }

  // ONBOARD-4: also write a workspace_memory_document summarizing the voice
  // samples so the lead-intake runtime picks them up via the existing
  // retrieveWorkspaceMemory injection. This is the cheap path — we keep
  // reply examples as their own table for future surfaces (voice analytics,
  // operator-curated voice library) but make sure the first real lead
  // already benefits from voice matching.
  const memoryBody = [
    "Past replies this operator has actually sent to leads. Match this voice when drafting:",
    "",
    ...input.examples.map((example, index) => `${index + 1}. ${example.body.trim()}`),
  ].join("\n");

  const { error: memoryError } = await supabase
    .from("workspace_memory_documents")
    .insert({
      workspace_id: workspaceId,
      memory_type: "operator_feedback",
      title: "Operator voice samples (captured at onboarding)",
      body: memoryBody,
      source: "onboarding",
      evidence: { source: "onboarding_reply_examples", sampleCount: input.examples.length },
      confidence: 1,
    });
  if (memoryError !== null) {
    console.warn(
      "[persistReplyExamples] workspace_memory_documents insert failed",
      memoryError.message,
    );
  }

  return (data ?? []).map((row) =>
    WorkspaceReplyExampleSchema.parse({
      id: row.id,
      workspaceId: row.workspace_id,
      body: row.body,
      source: row.source,
      capturedAt: row.captured_at,
    }),
  );
}

export async function persistChannelIntents(
  supabase: RealtyOpsSupabaseClient,
  workspaceId: string,
  input: RegisterChannelIntentInput,
): Promise<WorkspaceChannelIntent[]> {
  // Upsert per channel so re-running the beat updates instead of duplicating.
  const rows = input.intents.map((intent) => ({
    workspace_id: workspaceId,
    channel: intent.channel,
    desired_mode: intent.desiredMode,
    notes: intent.notes ?? null,
  }));

  const { data, error } = await supabase
    .from("workspace_channel_intents")
    .upsert(rows, { onConflict: "workspace_id,channel" })
    .select("*");
  if (error !== null) {
    throw new Error(`Failed to persist channel intents: ${error.message}`);
  }

  return (data ?? []).map((row) =>
    WorkspaceChannelIntentSchema.parse({
      id: row.id,
      workspaceId: row.workspace_id,
      channel: row.channel,
      desiredMode: row.desired_mode,
      notes: row.notes,
      createdAt: row.created_at,
    }),
  );
}

export async function listWorkspaceReplyExamples(
  supabase: RealtyOpsSupabaseClient,
  workspaceId: string,
  limit = 10,
): Promise<WorkspaceReplyExample[]> {
  const { data, error } = await supabase
    .from("workspace_reply_examples")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("captured_at", { ascending: false })
    .limit(limit);
  if (error !== null) {
    throw new Error(`Failed to list workspace reply examples: ${error.message}`);
  }

  return (data ?? []).map((row) =>
    WorkspaceReplyExampleSchema.parse({
      id: row.id,
      workspaceId: row.workspace_id,
      body: row.body,
      source: row.source,
      capturedAt: row.captured_at,
    }),
  );
}
