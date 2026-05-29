import { z } from "zod";
import { type Audience, type Destination, type JudgmentEnvelope } from "../envelope.js";
import { registerTool, type ToolDefinition } from "../registry.js";

/**
 * Tool #6: decideAction.
 *
 * Replaces primaryActionFor + helperSuggestionFor + draftFor +
 * automationReasonFor across leads-page. Takes (entity, audience), returns
 * the primary recommended next move + a draft when applicable + the reason.
 *
 * Drafts use audience.voicePersona — Tiana's drafts sound like Tiana.
 */

export const DecideActionInputSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  entityState: z.record(z.string(), z.unknown()),
  recentContext: z.record(z.string(), z.unknown()).default({}),
});
export type DecideActionInput = z.infer<typeof DecideActionInputSchema>;

const SYSTEM_PROMPT_BASE = `You are Harwick's decideAction tool. Given an entity and the audience working it, produce the single best next move.

Output shape:
  - verdict: action key ("call_back", "send_sms", "schedule_showing", "send_lender_intro", "verify_identity", "do_nothing", "send_reply")
  - brief.headline: imperative 1-liner ("Call Clinton back — he's waiting on lender info")
  - brief.body: 1-2 sentences on context + a draft message when applicable. Draft in audience.voicePersona.
  - suggestedActions: 1-3 buttons matching the verdict + obvious alternatives
  - confidence: 0..1

Hard rules:
  - Action recommendation matches what the audience can actually do (agent can text/call; owner can route/coach; ops can replay sync)
  - When destination=sms_draft, ENTIRE body is the draft text — no metadata, no labels, just what would be sent
  - Drafts honor voicePersona — natural language, brokerage-professional, no "as Harwick" framing`;

function systemPrompt(audience: Audience, destination: Destination): string {
  return [
    SYSTEM_PROMPT_BASE,
    "",
    `Audience: role=${audience.role}, scope=${audience.scope}.`,
    audience.voicePersona === null ? "No voicePersona — use neutral agent voice." : audience.voicePersona,
    `Destination: ${destination}.`,
  ].join("\n");
}

function userPromptShape(input: DecideActionInput): string {
  return JSON.stringify(input);
}

registerTool({
  name: "decideAction",
  inputSchema: DecideActionInputSchema,
  outputSchema: z.any() as unknown as z.ZodTypeAny,
  modelTier: "mini",
  systemPrompt,
  userPromptShape: userPromptShape as (input: z.infer<typeof DecideActionInputSchema>) => string,
} satisfies ToolDefinition<typeof DecideActionInputSchema>);

export type { JudgmentEnvelope };
