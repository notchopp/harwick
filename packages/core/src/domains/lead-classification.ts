import { z } from "zod";

/**
 * Lead-or-not classification. Runs on every inbound (Meta DM, comment,
 * voice, SMS, public-listing inquiry) before the full agent loop fires.
 *
 * Three classes:
 *   lead         — real prospect: buyer, seller, renter, investor question
 *                  about a property, financing, showing, market, etc.
 *   not_lead     — engagement, friend/family, vendor, recruiter, spam, off-topic
 *   needs_review — ambiguous; surface to operator without firing the loop
 *
 * Classification is the cheap upstream gate that protects expensive agent
 * loop spend and keeps the lead queue clean. Producer is a small-model
 * classifier; consumers are the meta webhook, the public listing inquiry
 * route, and any future ingestion path.
 */

export const LeadClassificationSchema = z.enum(["lead", "not_lead", "needs_review"]);

export const LeadClassificationReasonSchema = z.enum([
  "real_estate_inquiry",
  "showing_request",
  "listing_question",
  "financing_question",
  "qualification_signal",
  "engagement_only",
  "personal_friend",
  "vendor_or_recruiter",
  "spam_or_promotion",
  "off_topic",
  "ambiguous_intent",
  "low_confidence",
]);

export const LeadClassificationDecisionSchema = z.object({
  classification: LeadClassificationSchema,
  reasonCode: LeadClassificationReasonSchema,
  reasonText: z.string().trim().min(1).max(400),
  confidence: z.number().min(0).max(1),
  /** Quick categorization for queue routing if classification is `lead`. */
  leadHint: z.enum(["buyer", "seller", "renter", "investor", "unknown"]),
});

export type LeadClassification = z.infer<typeof LeadClassificationSchema>;
export type LeadClassificationReason = z.infer<typeof LeadClassificationReasonSchema>;
export type LeadClassificationDecision = z.infer<typeof LeadClassificationDecisionSchema>;

export const LEAD_CLASSIFIER_INSTRUCTIONS = [
  "You are a lead-classification gate for a real estate brokerage's AI front desk.",
  "An inbound message arrived from a prospect via Instagram DM, Instagram comment, Facebook DM, Facebook comment, SMS, voice transcript, or a public listing inquiry form.",
  "Your job is to decide whether this message warrants spinning up the full agent loop, or whether it should be handled by a cheaper path.",
  "",
  "Three classes:",
  "  • lead — the sender is a real prospect: asking about a property, pricing, neighborhood, showing, financing, market timing, or otherwise expressing intent that an agent should respond to.",
  "  • not_lead — the message is engagement-only ('love this!'), a personal friend/family note, a vendor/recruiter pitch, spam, a promotion, or clearly off-topic for real estate.",
  "  • needs_review — ambiguous. The message could be a lead but you cannot tell with confidence. Surface to a human without spinning up the agent.",
  "",
  "Confidence calibration:",
  "  • Strong lead signals (pricing question, showing request, qualification info): confidence ≥ 0.85, classification 'lead'.",
  "  • Clear non-lead signals (vendor pitch, friend chat, spam): confidence ≥ 0.85, classification 'not_lead'.",
  "  • Anything in between: classification 'needs_review' with confidence ≤ 0.7.",
  "",
  "If classification is 'lead', set leadHint to your best guess of buyer/seller/renter/investor based on the message; default 'unknown' if you cannot tell.",
  "Return: { classification, reasonCode, reasonText, confidence, leadHint } as valid JSON.",
].join("\n");

export type LeadClassifierInput = {
  inboundText: string;
  channel: string;
  senderName?: string | null;
  senderHandle?: string | null;
  postCaption?: string | null;
  postPermalink?: string | null;
  workspaceContext?: string | null;
};

export function buildLeadClassifierInput(input: LeadClassifierInput): string {
  const lines: string[] = [];
  lines.push(`CHANNEL: ${input.channel}`);
  if (input.senderName !== null && input.senderName !== undefined && input.senderName.length > 0) {
    lines.push(`SENDER NAME: ${input.senderName}`);
  }
  if (input.senderHandle !== null && input.senderHandle !== undefined && input.senderHandle.length > 0) {
    lines.push(`SENDER HANDLE: ${input.senderHandle}`);
  }
  if (input.postCaption !== null && input.postCaption !== undefined && input.postCaption.length > 0) {
    lines.push(`POST CAPTION: ${input.postCaption.slice(0, 1000)}`);
  }
  if (input.postPermalink !== null && input.postPermalink !== undefined) {
    lines.push(`POST URL: ${input.postPermalink}`);
  }
  if (input.workspaceContext !== null && input.workspaceContext !== undefined && input.workspaceContext.length > 0) {
    lines.push(`WORKSPACE CONTEXT: ${input.workspaceContext}`);
  }
  lines.push("");
  lines.push("INBOUND MESSAGE:");
  lines.push(input.inboundText);
  return lines.join("\n");
}
