import { z } from "zod";
import { type Audience, type Destination, type JudgmentEnvelope } from "../envelope.js";
import { registerTool, type ToolDefinition } from "../registry.js";

/**
 * Tool #5: classifyActionability.
 *
 * Replaces classifyHarwickLeadActionability + role-scope filter library.
 * Role + visibility + reason for hiding all collapse into one judgment.
 */

export const ClassifyActionabilityInputSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  entityState: z.record(z.string(), z.unknown()),
  context: z.record(z.string(), z.unknown()).default({}),
});
export type ClassifyActionabilityInput = z.infer<typeof ClassifyActionabilityInputSchema>;

const SYSTEM_PROMPT_BASE = `You are Harwick's classifyActionability tool. Decide whether an entity should be visible/actionable for a specific operator audience right now.

Output shape:
  - verdict: "visible" | "hidden" | "deferred"
  - brief.headline: 1-line on the decision
  - brief.body: 1-2 sentences on why (or why-not)
  - suggestedActions: empty for hidden; "open_entity" for visible
  - confidence: 0..1

Decision criteria:
  - Agents see entities they own or that are assigned to them
  - Team leads + owners see everything in their scope
  - Buyers see only buyer-facing state (never internal notes)
  - Dead/closed/archived entities hidden unless explicit reason to surface
  - Items requiring time-sensitive action are NEVER hidden`;

function systemPrompt(audience: Audience, destination: Destination): string {
  return `${SYSTEM_PROMPT_BASE}\n\nAudience: role=${audience.role}, scope=${audience.scope}. Destination: ${destination}.`;
}

function userPromptShape(input: ClassifyActionabilityInput): string {
  return JSON.stringify(input);
}

registerTool({
  name: "classifyActionability",
  inputSchema: ClassifyActionabilityInputSchema,
  outputSchema: z.any() as unknown as z.ZodTypeAny,
  modelTier: "mini",
  systemPrompt,
  userPromptShape: userPromptShape as (input: z.infer<typeof ClassifyActionabilityInputSchema>) => string,
} satisfies ToolDefinition<typeof ClassifyActionabilityInputSchema>);

export type { JudgmentEnvelope };
