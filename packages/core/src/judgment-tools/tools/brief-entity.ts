import { z } from "zod";
import {
  AudienceSchema,
  DestinationSchema,
  JudgmentEnvelopeSchema,
  SuggestedActionSchema,
  type Audience,
  type Destination,
  type JudgmentEnvelope,
} from "../envelope.js";
import { registerTool, type ToolDefinition } from "../registry.js";

/**
 * Tool #1: briefEntity.
 *
 * The 2-second read of any entity — drives lead drawers, queue cards, routing
 * rows, conversation threads, team-member sheets, CRM notes pushed back to FUB,
 * buyer-side chat-context prompts, and DM-share preview copy. Every brief is
 * cached in harwick_briefs keyed by (audience, destination) so the same entity
 * can have a half-dozen role/destination-shaped reads live simultaneously.
 *
 * Output stays a clean envelope: headline (one-line), body (3-4 sentences),
 * suggestedActions (tap-to-do buttons). The receipts UI surfaces rationale +
 * deltas on tap-to-expand.
 */

export const BriefEntityTypeSchema = z.enum([
  "lead",
  "queue_item",
  "routing_row",
  "conversation_thread",
  "team_member",
  "listing",
  "workspace",
]);
export type BriefEntityType = z.infer<typeof BriefEntityTypeSchema>;

/**
 * Structured input the runner expects. `entityState` is the FULL state
 * fetched by the caller before invocation — caller is responsible for
 * pulling fresh CRM state (via CrmConnector.fetchContact) when destination
 * involves CRM-adjacent context.
 */
export const BriefEntityInputSchema = z.object({
  type: BriefEntityTypeSchema,
  id: z.string().min(1),
  entityState: z.record(z.string(), z.unknown()),
  relatedTasks: z.array(z.record(z.string(), z.unknown())).default([]),
  recentEvents: z.array(z.record(z.string(), z.unknown())).default([]),
  crmState: z.record(z.string(), z.unknown()).nullable().default(null),
  channelAvailability: z.object({
    instagram: z.boolean().default(false),
    facebook: z.boolean().default(false),
    sms: z.boolean().default(false),
    voice: z.boolean().default(false),
    public_chat: z.boolean().default(true),
  }).default({
    instagram: false,
    facebook: false,
    sms: false,
    voice: false,
    public_chat: true,
  }),
});
export type BriefEntityInput = z.infer<typeof BriefEntityInputSchema>;

const SYSTEM_PROMPT_BASE = `You are Harwick's briefEntity tool. You write the 2-second read of an entity for a specific audience and destination.

Audience defines language, register, and what's surfacable:
  - agent: action-oriented imperative. "Do this. Then this." Drafts in their voicePersona.
  - team_lead: balanced — personal action + team-level pattern.
  - owner: high-altitude business signal. Numbers, signals, "one thing that changed".
  - ops: diagnostic. "X broke, here's the fix, here's the rollback."
  - buyer: continuous-relationship voice. Only surface things the buyer would know.
  - viewer: dashboard language. Aggregate, no PII actions.

Destination defines register and length:
  - harwick_drawer: conversational, 3-4 sentences, button-heavy.
  - crm_note: dated, signed, attribution-aware. "Harwick noted at 2:14 PM: ..."
  - crm_task_description: instruction-style. Prerequisites + steps.
  - sms_draft: short, voicePersona-matched, no greeting overhead.
  - dm_share: friendly, "wider access not brush-off" framing.
  - chat_context: system-prompt augmentation for a returning buyer. Filter internal notes.
  - harwick_owner_brief: 4 sentences, dollar-aware, "one move worth making".

Hard rules:
  - When audience.role = "buyer", NEVER surface internal agent notes, routing decisions, persona-contradiction flags, or low-confidence flags. Only surfacable: confirmed actions, public-facing answers, their own state.
  - When destination = "crm_note" or "crm_task_description", write as if a human agent will read it in their CRM tomorrow — formal, dated tone, useful detail, no Harwick UI references.
  - Suggested actions: tap-to-do for the audience. Action key drives downstream dispatch ("open_conversation", "schedule_callback", "send_sms", "assign_to_agent", "dedupe_tasks", "verify_identity", "dismiss"). Empty array is fine if there's no obvious next move.
  - Confidence: 0..1 self-rating. Below 0.65 means the model wasn't sure — runner will escalate or fall back.

Return JSON:
{
  "verdict": "brief_generated" | "insufficient_data",
  "brief": { "headline": "...", "body": "..." },
  "deltas": ["short sentence on what changed vs prior state, max 4", ...],
  "suggestedActions": [{ "label": "Call back", "action": "schedule_callback", "payload": {}, "tone": "primary" }],
  "confidence": 0.0..1.0,
  "rationale": "one sentence on why I produced this read"
}`;

const SystemPromptOutputSchema = z.object({
  verdict: z.string().trim().min(1).max(80),
  brief: z.object({
    headline: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(2000),
  }),
  deltas: z.array(z.string().trim().min(1).max(280)).max(8).default([]),
  suggestedActions: z.array(SuggestedActionSchema).max(6).default([]),
  confidence: z.number().min(0).max(1),
  rationale: z.string().trim().max(1000).nullable().default(null),
});

function systemPrompt(audience: Audience, destination: Destination): string {
  return [
    SYSTEM_PROMPT_BASE,
    "",
    `Audience: role=${audience.role}, scope=${audience.scope}.`,
    audience.voicePersona === null
      ? "Audience has no voicePersona — use a neutral agent voice if drafting."
      : `Audience voicePersona: ${audience.voicePersona}`,
    `Destination: ${destination}.`,
  ].join("\n");
}

function userPromptShape(input: BriefEntityInput): string {
  // Compact JSON serialization — preserves structure for the model to reason
  // over without bloating tokens with whitespace.
  return JSON.stringify({
    entityType: input.type,
    entityId: input.id,
    entityState: input.entityState,
    relatedTasks: input.relatedTasks,
    recentEvents: input.recentEvents,
    crmState: input.crmState,
    channelAvailability: input.channelAvailability,
  });
}

const definition: ToolDefinition<typeof BriefEntityInputSchema> = {
  name: "briefEntity",
  inputSchema: BriefEntityInputSchema,
  outputSchema: SystemPromptOutputSchema,
  modelTier: "mini",
  systemPrompt,
  userPromptShape: userPromptShape as (input: z.infer<typeof BriefEntityInputSchema>) => string,
};

registerTool(definition);

export const briefEntityToolDefinition = definition;

/**
 * Type-safe helper for callers that want to invoke briefEntity directly
 * without going through the dynamic registry. Constructs the runner input
 * with proper types.
 */
export type BriefEntityCallInput = {
  workspaceId: string;
  audience: Audience;
  destination: Destination;
  input: BriefEntityInput;
  forceRegen?: boolean;
};

export function buildBriefEntityRunInput(call: BriefEntityCallInput): {
  workspaceId: string;
  tool: "briefEntity";
  audience: Audience;
  destination: Destination;
  input: BriefEntityInput;
  forceRegen: boolean;
} {
  return {
    workspaceId: call.workspaceId,
    tool: "briefEntity",
    audience: call.audience,
    destination: call.destination,
    input: BriefEntityInputSchema.parse(call.input),
    forceRegen: call.forceRegen ?? false,
  };
}

export { JudgmentEnvelopeSchema, AudienceSchema, DestinationSchema };
export type { JudgmentEnvelope };
