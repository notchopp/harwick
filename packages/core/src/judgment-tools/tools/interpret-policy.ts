import { z } from "zod";
import { type Audience, type Destination, type JudgmentEnvelope } from "../envelope.js";
import { registerTool, type ToolDefinition } from "../registry.js";

/**
 * Tool #8: interpretPolicy.
 *
 * Replaces evaluateHarwickAiAutomation. Reads the workspace's
 * policy_narrative (English prose) + an intended action, returns
 * whether allowed + requires approval + reason.
 *
 * The deep architectural shift this represents: instead of broker-edited
 * structured policy compiled to rules, brokers edit prose; the LLM reads
 * prose at inference time and self-gates. Per the north-star deletion
 * roadmap, this lets us delete ~400-500 lines of harwick-ai-automation-policy.ts
 * and related state.
 */

export const InterpretPolicyInputSchema = z.object({
  policyNarrative: z.string(),
  intendedAction: z.object({
    actionKind: z.string(),
    targetChannel: z.string().nullable(),
    payloadSummary: z.string(),
    leadContext: z.string().nullable(),
  }),
});
export type InterpretPolicyInput = z.infer<typeof InterpretPolicyInputSchema>;

const SYSTEM_PROMPT_BASE = `You are Harwick's interpretPolicy tool. You read the workspace's policy narrative (prose written by the broker) and decide whether the intended action is allowed, requires approval, or is blocked.

Output shape:
  - verdict: "allowed_autonomous" | "requires_approval" | "blocked"
  - brief.headline: 1-line decision
  - brief.body: 1-2 sentences citing the specific policy text that drove the decision
  - suggestedActions: when requires_approval, action="queue_for_review"; when blocked, action="dismiss"; when allowed, action="proceed"
  - deltas: empty (policy decisions don't have deltas)
  - confidence: 0..1

Decision criteria:
  - Match intentions to policy clauses literally. The broker's prose is the source of truth.
  - When policy is silent on this action class: default to requires_approval (conservative)
  - When policy explicitly allows + the action matches: allowed_autonomous
  - When policy explicitly blocks or the action conflicts with stated values: blocked
  - Confidence < 0.65 when the policy is ambiguous on this specific case`;

function systemPrompt(audience: Audience, destination: Destination): string {
  return `${SYSTEM_PROMPT_BASE}\n\nAudience: role=${audience.role}. Destination: ${destination}.`;
}

function userPromptShape(input: InterpretPolicyInput): string {
  return JSON.stringify(input);
}

registerTool({
  name: "interpretPolicy",
  inputSchema: InterpretPolicyInputSchema,
  outputSchema: z.any() as unknown as z.ZodTypeAny,
  modelTier: "mini",
  systemPrompt,
  userPromptShape: userPromptShape as (input: z.infer<typeof InterpretPolicyInputSchema>) => string,
} satisfies ToolDefinition<typeof InterpretPolicyInputSchema>);

export type { JudgmentEnvelope };
