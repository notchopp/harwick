import { z } from "zod";

/**
 * Judgment-tool taxonomy. Every operator-side LLM decision in Harwick goes
 * through one of these 13 tools. Same envelope on all 13 — pluggable behind
 * `runJudgment(tool, input)`.
 *
 * The architectural principle: LLMs make decisions and call deterministic
 * code for lookups, persistence, and integrations. The judgment tools are
 * the decision layer. Everything else is either input parameter, output
 * destination, outcome collector, or invalidation trigger.
 *
 * See: project_ai_native_operator_surfaces in /memory for the full plan.
 */
export const JudgmentToolNameSchema = z.enum([
  "briefEntity",
  "triageQueue",
  "reconcileQualification",
  "recommendRouting",
  "classifyActionability",
  "decideAction",
  "dedupeTask",
  "interpretPolicy",
  "pickNurtureAction",
  "inferVoiceOutcome",
  "briefWorkspace",
  "briefTeamMember",
  "reconcileConflict",
]);
export type JudgmentToolName = z.infer<typeof JudgmentToolNameSchema>;

/**
 * Audience: who is this judgment FOR. Shapes language, scope, draft voice.
 * Same tool produces an agent-shaped read or an owner-shaped read just by
 * varying this parameter. This is the elegant replacement for role-scope.ts
 * — visibility and language collapse into one decision.
 */
export const AudienceRoleSchema = z.enum([
  "owner",
  "admin",
  "team_lead",
  "lead_manager",
  "agent",
  "ops",
  "viewer",
  "buyer",
  "system",
]);
export type AudienceRole = z.infer<typeof AudienceRoleSchema>;

export const AudienceSchema = z.object({
  role: AudienceRoleSchema,
  memberId: z.string().uuid().nullable().default(null),
  /** Free-text persona prompt for matching an agent's voice in drafts. */
  voicePersona: z.string().nullable().default(null),
  /** "personal" = my-work-only; "team" = team-wide; "workspace" = everything. */
  scope: z.enum(["personal", "team", "workspace"]).default("personal"),
});
export type Audience = z.infer<typeof AudienceSchema>;

/**
 * Destination: WHERE this judgment output will be rendered/persisted.
 * Drives prompt branch — formal/dated/attribution for CRM notes,
 * conversational/button-heavy for the Harwick drawer, voice-shaped
 * for SMS drafts.
 */
export const DestinationSchema = z.enum([
  "harwick_drawer",
  "harwick_queue_card",
  "harwick_routing_row",
  "harwick_conversation",
  "harwick_owner_brief",
  "crm_note",
  "crm_task_description",
  "sms_draft",
  "email_draft",
  "dm_share",
  "story_share",
  "chat_context",
  "internal_audit",
]);
export type Destination = z.infer<typeof DestinationSchema>;

/**
 * Suggested action — every brief can carry one or more "next move" buttons
 * the operator can tap. The action payload is opaque to the brief; the
 * consuming surface knows how to dispatch it.
 */
export const SuggestedActionSchema = z.object({
  label: z.string().trim().min(1).max(80),
  action: z.string().trim().min(1).max(80),
  payload: z.record(z.string(), z.unknown()).default({}),
  tone: z.enum(["primary", "accent", "ghost", "destructive"]).default("primary"),
});
export type SuggestedAction = z.infer<typeof SuggestedActionSchema>;

/**
 * The unified envelope every judgment tool returns. Stored in harwick_briefs,
 * collected into training_signals.
 *
 * verdict: the decision class (e.g. "merge" / "flag_contradiction" for
 *          reconcileQualification, "assign" / "hold" for recommendRouting).
 * brief: rendered text payload — headline (2-second read), body (3-4 sentence
 *        full read).
 * deltas: meaningful changes detected vs prior state (used in reconcile + diff tools).
 * suggestedActions: tap-to-do operator buttons.
 * confidence: 0..1 self-rating; below 0.65 -> escalate to stronger model;
 *             below 0.5 -> return null + fall back to deterministic rule.
 * rationale: model-written "why I decided this" — surfaced in the
 *            tap-to-expand receipts UI on every judgment surface.
 */
export const JudgmentEnvelopeSchema = z.object({
  verdict: z.string().trim().min(1).max(80),
  brief: z.object({
    headline: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(2000),
  }),
  deltas: z.array(z.string().trim().min(1).max(280)).default([]),
  suggestedActions: z.array(SuggestedActionSchema).max(6).default([]),
  confidence: z.number().min(0).max(1),
  rationale: z.string().trim().max(1000).nullable().default(null),
});
export type JudgmentEnvelope = z.infer<typeof JudgmentEnvelopeSchema>;

/**
 * Output of runJudgment after persistence + cost accounting.
 * If we served from cache, `cached: true` and the fields below reflect the
 * cached values + when they were generated.
 */
export const JudgmentRunResultSchema = z.object({
  envelope: JudgmentEnvelopeSchema,
  cached: z.boolean(),
  model: z.string(),
  stateHash: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  trainingSignalId: z.string().uuid().nullable(),
  generatedAt: z.string().datetime(),
});
export type JudgmentRunResult = z.infer<typeof JudgmentRunResultSchema>;

/**
 * Common input shape every judgment tool accepts at the runner boundary.
 * Tool-specific `input` payload is validated against the tool's own schema
 * registered in the registry.
 */
export const JudgmentRunInputSchema = z.object({
  workspaceId: z.string().uuid(),
  tool: JudgmentToolNameSchema,
  audience: AudienceSchema,
  destination: DestinationSchema,
  /** Tool-specific structured input (lead state, agent profiles, etc.). */
  input: z.record(z.string(), z.unknown()),
  /** Force regeneration even if a cached brief matches state_hash. */
  forceRegen: z.boolean().default(false),
});
export type JudgmentRunInput = z.infer<typeof JudgmentRunInputSchema>;
