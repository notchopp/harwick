import {
  LEAD_CLASSIFIER_INSTRUCTIONS,
  LeadClassificationDecisionSchema,
  buildLeadClassifierInput,
  type LeadClassificationDecision,
  type LeadClassifierInput,
} from "@realty-ops/core";
import type { SmallModelClient } from "@realty-ops/integrations";

/**
 * Cap #8: lead-or-not classification gate. Cheap small-model call that runs
 * before the full agent loop. Saves expensive agent spend, keeps the lead
 * queue clean, and gives operators a "social inbox" view of non-lead
 * engagement that's still worth seeing.
 */
export async function classifyInboundLead(params: {
  client: SmallModelClient;
  input: LeadClassifierInput;
}): Promise<LeadClassificationDecision> {
  const inputText = buildLeadClassifierInput(params.input);
  return params.client.classify({
    schema: LeadClassificationDecisionSchema,
    instructions: LEAD_CLASSIFIER_INSTRUCTIONS,
    input: inputText,
    temperature: 0.1,
    maxTokens: 300,
  });
}

/**
 * Conservative fallback when the classifier fails (network error, parse
 * error, missing API key). Defaults to `needs_review` with a low confidence
 * so the operator sees the message without firing the full agent loop.
 * Better to under-respond than to spin up a $0.05 agent on every spam DM.
 */
export function buildClassifierFallback(reason: string): LeadClassificationDecision {
  return LeadClassificationDecisionSchema.parse({
    classification: "needs_review",
    reasonCode: "low_confidence",
    reasonText: `classifier unavailable: ${reason}`.slice(0, 400),
    confidence: 0.1,
    leadHint: "unknown",
  });
}
