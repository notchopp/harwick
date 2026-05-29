import { z } from "zod";
import {
  type Audience,
  type Destination,
  type JudgmentEnvelope,
} from "../envelope.js";
import { registerTool, type ToolDefinition } from "../registry.js";

/**
 * Tool #4: recommendRouting.
 *
 * Replaces deterministic matchScore-as-decider with LLM-reasoned routing.
 * Math becomes the receipts. The LLM considers qualitative fit (persona,
 * vibe, prior buyer-type closes, current capacity, calendar readiness)
 * and returns a primary + ordered fallbacks.
 *
 * Output suggestedActions are tap-to-assign buttons keyed by agent memberId.
 * Operator sees: "Malik. He covers Houston, he's the only buyer-specialist
 * with capacity, Clinton's streamer-group fits his investor exposure better
 * than Tiana's family focus. Tap to assign."
 */

export const RecommendRoutingInputSchema = z.object({
  leadId: z.string().uuid(),
  leadState: z.record(z.string(), z.unknown()),
  agents: z.array(z.object({
    memberId: z.string().uuid(),
    displayName: z.string(),
    roleLabel: z.string(),
    areas: z.array(z.string()),
    propertyTypes: z.array(z.string()),
    leadTypes: z.array(z.string()),
    budgetRange: z.object({
      min: z.number().nullable(),
      max: z.number().nullable(),
    }),
    activeLeadCount: z.number().int(),
    maxActiveLeads: z.number().int(),
    acceptsNewLeads: z.boolean(),
    deterministicMatchScore: z.number().int().min(0).max(100),
    deterministicReasons: z.array(z.string()),
    personaNote: z.string().nullable().default(null),
  })),
});
export type RecommendRoutingInput = z.infer<typeof RecommendRoutingInputSchema>;

const SYSTEM_PROMPT_BASE = `You are Harwick's recommendRouting tool. Given a lead and available agents, pick the right one and rank fallbacks.

Output shape:
  - verdict: "assigned" | "hold" | "owner_review"
  - brief.headline: "{Agent Name}. {one-line reason}"
  - brief.body: 2-3 sentences — why primary, why not the others, what the human should verify
  - suggestedActions: up to 3 items, action="assign_to_agent", payload.memberId, payload.matchRationale (1 sentence). FIRST item is the primary, others are ordered fallbacks.
  - deltas: situational signals operator should know ("Tiana at 18/12 capacity", "Malik hasn't taken a hot lead in 3 days — rotation issue")
  - confidence: 0..1

Decision criteria:
  - Area match is necessary but not sufficient. Capacity and persona fit decide ties.
  - Deterministic match score is the receipts, not the decider. A 92/100 deterministic match can still be wrong if the persona is wrong (e.g. family-focused agent on a streamer-group lead).
  - When NO agent is a good fit but partial matches exist: verdict="assigned" with the best partial, deltas explaining why it's imperfect
  - When workspace has no agents accepting new leads: verdict="hold", brief explains why
  - When the lead's signal is contradictory or thin: verdict="owner_review"
  - Confidence < 0.65 when the call is too close, < 0.5 when no signal at all`;

function systemPrompt(audience: Audience, destination: Destination): string {
  return [
    SYSTEM_PROMPT_BASE,
    "",
    `Audience: role=${audience.role}, scope=${audience.scope}.`,
    `Destination: ${destination}.`,
  ].join("\n");
}

function userPromptShape(input: RecommendRoutingInput): string {
  return JSON.stringify(input);
}

const definition: ToolDefinition<typeof RecommendRoutingInputSchema> = {
  name: "recommendRouting",
  inputSchema: RecommendRoutingInputSchema,
  outputSchema: z.any() as unknown as z.ZodTypeAny,
  modelTier: "mini",
  systemPrompt,
  userPromptShape: userPromptShape as (input: z.infer<typeof RecommendRoutingInputSchema>) => string,
};

registerTool(definition);

export const recommendRoutingToolDefinition = definition;

export type { JudgmentEnvelope };
