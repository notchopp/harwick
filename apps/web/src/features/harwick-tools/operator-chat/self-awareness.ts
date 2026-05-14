import { z } from "zod";

import type { HarwickToolDefinition, HarwickToolDeps } from "../registry";

/**
 * Self-awareness tools — make uncertainty a first-class signal.
 *
 *   - flag_my_uncertainty    Explicit "I'm not sure" signal with a reason and
 *                            a confidence number. The UI surfaces this so the
 *                            operator knows when Harwick is bluffing.
 *
 *   - request_clarification  Structured clarifying question with the specific
 *                            ambiguity being resolved. Different from prose
 *                            because it's machine-readable — the UI can render
 *                            quick-pick chips for the answer options.
 *
 * Both tools are auto_safe — they don't mutate workspace state, they just
 * surface metadata about the model's own confidence to the operator.
 */

export const flagMyUncertaintyTool: HarwickToolDefinition = {
  name: "flag_my_uncertainty",
  description: "Use when you'd otherwise bluff. Emits an explicit 'I'm not confident here' signal that the operator's UI surfaces. The reply you write should also be honest about the gap — don't paper over it. Confidence is 0..1 where 0 = total guess, 0.5 = could go either way, 0.8 = pretty sure but flagging anyway.",
  scopes: ["operator_chat", "lead_conversation", "channel_mention"],
  approval: "auto_safe",
  inputSchema: z.object({
    topic: z.string().min(3).max(200).describe("Short description of what you're uncertain about. Example: 'Whether this lead is the same person as the one Sarah closed last month'."),
    why: z.string().min(8).max(500).describe("Why you're uncertain. Concrete: 'IG handles match but phone numbers differ; could be a partner or a relative'."),
    confidence: z.number().min(0).max(1).describe("0..1 self-rating."),
    wouldHelpResolve: z.string().max(400).optional().describe("Optional. What would resolve the uncertainty? Example: 'A look at the FUB contact record', 'A direct question to the lead about which property they meant'."),
  }),
  execute(input) {
    return {
      kind: "uncertainty_flag",
      topic: input.topic,
      why: input.why,
      confidence: input.confidence,
      wouldHelpResolve: input.wouldHelpResolve ?? null,
    };
  },
};

export const requestClarificationTool: HarwickToolDefinition = {
  name: "request_clarification",
  description: "Ask the operator a structured question when an instruction is genuinely ambiguous. Use SPARINGLY — only when guessing has real downside (sending the wrong reply, routing to the wrong agent). Don't use for guesses you could make on your own. Returns the question + machine-readable options so the UI can render quick-picks.",
  scopes: ["operator_chat", "lead_conversation", "channel_mention"],
  approval: "auto_safe",
  inputSchema: z.object({
    question: z.string().min(8).max(300).describe("The clarifying question in plain English."),
    ambiguity: z.string().min(8).max(400).describe("What specifically is ambiguous. 'You said \"call her\" but you have 3 open leads — which one?'"),
    options: z.array(z.object({
      label: z.string().min(1).max(120),
      value: z.string().min(1).max(200),
    })).min(2).max(6).describe("2-6 distinct answer options the operator can quick-pick. The 'value' is what should come back from the operator."),
  }),
  execute(input) {
    return {
      kind: "clarification_request",
      question: input.question,
      ambiguity: input.ambiguity,
      options: input.options,
    };
  },
};

export const SELF_AWARENESS_TOOLS: HarwickToolDefinition[] = [
  flagMyUncertaintyTool,
  requestClarificationTool,
];
