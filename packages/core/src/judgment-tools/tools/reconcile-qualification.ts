import { z } from "zod";
import {
  type Audience,
  type Destination,
  type JudgmentEnvelope,
} from "../envelope.js";
import { registerTool, type ToolDefinition } from "../registry.js";

/**
 * Tool #3: reconcileQualification.
 *
 * Write-time tool — runs every time a new session promotes to an existing
 * lead (cross-device buyer returns, persona shifts, multi-listing browsing).
 * Catches the Clinton stress-test failure mode: "single guy first home"
 * becoming "group of 6 streamers $1M+" silently overwriting.
 *
 * Returns a JudgmentEnvelope where verdict is one of:
 *   - "merge"             -> safe to merge, apply patches
 *   - "flag_contradiction" -> save patches but surface a note to the agent
 *   - "create_separate_lead" -> phones differ enough to suggest distinct people
 *
 * Escalates to gpt-4o (strong tier) when contradiction signals fire.
 */

export const ReconcileQualificationInputSchema = z.object({
  leadId: z.string().uuid(),
  existing: z.record(z.string(), z.unknown()),
  incoming: z.record(z.string(), z.unknown()),
  sessionMetadata: z.object({
    ipHash: z.string().nullable().default(null),
    userAgent: z.string().nullable().default(null),
    deviceHint: z.string().nullable().default(null),
    timeSinceLastSession: z.number().int().nullable().default(null),
  }).default({ ipHash: null, userAgent: null, deviceHint: null, timeSinceLastSession: null }),
});
export type ReconcileQualificationInput = z.infer<typeof ReconcileQualificationInputSchema>;

const SYSTEM_PROMPT_BASE = `You are Harwick's reconcileQualification tool. A new qualification snapshot just arrived for an existing lead. Decide whether to merge, flag, or split.

Output shape:
  - verdict: "merge" | "flag_contradiction" | "create_separate_lead"
  - brief.headline: ONE line on what changed and your call
  - brief.body: 2-3 sentences of reasoning
  - deltas: per-field changes ("budget jumped $625k -> $1M+", "persona shifted single -> group of 6")
  - suggestedActions: agent-facing prompts when verdict is flag_contradiction
    ("Verify identity at showing", "Ask which persona is real")
  - confidence: 0..1 self-rating

Decision criteria:
  - MERGE: incoming adds fields without contradicting existing (new timeline, new lifeContext entry, new vibeNotes). Cumulative narrative.
  - FLAG_CONTRADICTION: incoming directly contradicts existing in meaningful ways (single -> group, first-time-buyer -> sophisticated investor, $300k budget -> $1M+, area shifts wildly). Same phone usually = same person experimenting, but the agent needs to know.
  - CREATE_SEPARATE_LEAD: extremely rare — only when there's strong evidence of identity confusion (different phone numbers, different names, different verified emails). Default to merge or flag.

Confidence below 0.65 = escalate. Below 0.5 = abort and fall back to last-write-wins.`;

function systemPrompt(audience: Audience, destination: Destination): string {
  return [
    SYSTEM_PROMPT_BASE,
    "",
    `Audience: role=${audience.role}, scope=${audience.scope}.`,
    `Destination: ${destination}.`,
  ].join("\n");
}

function userPromptShape(input: ReconcileQualificationInput): string {
  return JSON.stringify({
    leadId: input.leadId,
    existing: input.existing,
    incoming: input.incoming,
    sessionMetadata: input.sessionMetadata,
  });
}

const definition: ToolDefinition<typeof ReconcileQualificationInputSchema> = {
  name: "reconcileQualification",
  inputSchema: ReconcileQualificationInputSchema,
  outputSchema: z.any() as unknown as z.ZodTypeAny,
  modelTier: "strong",
  systemPrompt,
  userPromptShape: userPromptShape as (input: z.infer<typeof ReconcileQualificationInputSchema>) => string,
};

registerTool(definition);

export const reconcileQualificationToolDefinition = definition;

export type { JudgmentEnvelope };
