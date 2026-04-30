import { z } from "zod";
import { ConversationAutomationModeSchema } from "./conversation-automation.js";
import {
  FinancingStatusSchema,
  LeadIntentSchema,
  LeadSourceChannelSchema,
  LeadTypeSchema,
} from "./lead.js";
import { UuidSchema } from "./common.js";
import { WorkspaceRoleSchema } from "./workspace.js";

export const HarwickAiMissingFieldSchema = z.enum([
  "name",
  "phone",
  "intent",
  "timeline",
  "price_range",
  "area",
  "property_type",
  "financing_status",
]);

export const HarwickAiSafetyFlagSchema = z.enum([
  "legal_advice",
  "lending_advice",
  "contract_advice",
  "valuation_claim",
  "angry_or_sensitive",
  "low_confidence",
  "human_takeover",
  "showing_approval_required",
  "crm_owner_conflict",
]);

export const HarwickAiRecommendedActionSchema = z.enum([
  "send_reply",
  "edit_reply",
  "ask_qualification",
  "route_lead",
  "book_callback",
  "request_showing_approval",
  "register_open_house",
  "sync_crm",
  "nurture",
  "pause_for_owner",
]);

export const HarwickAiLeadSnapshotSchema = z.object({
  id: UuidSchema.nullable(),
  sourceChannel: LeadSourceChannelSchema,
  leadType: LeadTypeSchema,
  intent: LeadIntentSchema,
  timeline: z.string().trim().max(120).nullable(),
  budget: z.string().trim().max(120).nullable(),
  targetArea: z.string().trim().max(180).nullable(),
  propertyType: z.string().trim().max(120).nullable(),
  financingStatus: FinancingStatusSchema,
  score: z.number().int().min(0).max(100),
  assignedAgentName: z.string().trim().min(1).max(160).nullable(),
  sourceOwnerName: z.string().trim().min(1).max(160).nullable(),
  listingLabel: z.string().trim().min(1).max(180).nullable(),
});

export const HarwickAiDecisionInputSchema = z.object({
  viewerRole: WorkspaceRoleSchema,
  automationMode: ConversationAutomationModeSchema,
  inboundText: z.string().trim().min(1).max(8000).nullable(),
  suggestedReply: z.string().trim().min(1).max(1000).nullable(),
  lead: HarwickAiLeadSnapshotSchema,
  now: z.string().datetime().optional(),
});

export const HarwickAiDecisionSchema = z.object({
  automationMode: ConversationAutomationModeSchema,
  roleLens: z.string().trim().min(1).max(240),
  currentIntent: z.string().trim().min(1).max(120),
  qualificationSummary: z.string().trim().min(1).max(500),
  missingFields: z.array(HarwickAiMissingFieldSchema),
  safetyFlags: z.array(HarwickAiSafetyFlagSchema),
  recommendedAction: HarwickAiRecommendedActionSchema,
  actionLabel: z.string().trim().min(1).max(80),
  actionReason: z.string().trim().min(1).max(500),
  canAutoSend: z.boolean(),
  requiresApproval: z.boolean(),
  routingSuggestion: z.string().trim().min(1).max(240).nullable(),
  helperNotes: z.array(z.string().trim().min(1).max(240)).max(4),
  replyText: z.string().trim().min(1).max(1000).nullable(),
});

export type HarwickAiMissingField = z.infer<typeof HarwickAiMissingFieldSchema>;
export type HarwickAiSafetyFlag = z.infer<typeof HarwickAiSafetyFlagSchema>;
export type HarwickAiDecisionInput = z.infer<typeof HarwickAiDecisionInputSchema>;
export type HarwickAiDecision = z.infer<typeof HarwickAiDecisionSchema>;

function roleLensFor(role: HarwickAiDecisionInput["viewerRole"]): string {
  if (role === "agent") {
    return "show the assigned agent the conversation context, missing qualification, and the next safe action.";
  }

  if (role === "lead_manager") {
    return "surface triage, approval, routing, callback, and stuck-work decisions across the operator queue.";
  }

  return "show ownership, source credit, assignment quality, routing exceptions, and system risk before CRM handoff.";
}

function inferMissingFields(lead: HarwickAiDecisionInput["lead"]): HarwickAiMissingField[] {
  const missing: HarwickAiMissingField[] = [];
  if (lead.leadType === "unknown") missing.push("intent");
  if (lead.timeline === null) missing.push("timeline");
  if (lead.budget === null) missing.push("price_range");
  if (lead.targetArea === null) missing.push("area");
  if (lead.propertyType === null) missing.push("property_type");
  if (lead.financingStatus === "unknown") missing.push("financing_status");
  return missing;
}

function textIncludes(value: string | null, patterns: readonly string[]): boolean {
  if (value === null) {
    return false;
  }

  const normalized = value.toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern));
}

export function decideHarwickAiNextAction(input: unknown): HarwickAiDecision {
  const parsed = HarwickAiDecisionInputSchema.parse(input);
  const missingFields = inferMissingFields(parsed.lead);
  const safetyFlags: HarwickAiSafetyFlag[] = [];

  if (parsed.automationMode === "human_takeover") {
    safetyFlags.push("human_takeover");
  }
  if (textIncludes(parsed.inboundText, ["contract", "legal", "lawsuit", "attorney"])) {
    safetyFlags.push("legal_advice");
  }
  if (textIncludes(parsed.inboundText, ["mortgage", "interest rate", "loan", "preapproval"])) {
    safetyFlags.push("lending_advice");
  }
  if (textIncludes(parsed.inboundText, ["worth", "value", "sell for", "appraise"])) {
    safetyFlags.push("valuation_claim");
  }
  if (textIncludes(parsed.inboundText, ["showing", "tour", "walkthrough", "see it", "see this", "see the"])) {
    safetyFlags.push("showing_approval_required");
  }

  const qualifiedEnough = missingFields.length <= 2 && parsed.lead.score >= 60;
  const hasRisk = safetyFlags.length > 0;
  const canAutoSend = parsed.automationMode === "ai_on" && !hasRisk && parsed.suggestedReply !== null;

  const recommendedAction: HarwickAiDecision["recommendedAction"] = (() => {
    if (parsed.automationMode === "human_takeover") return "pause_for_owner";
    if (parsed.automationMode === "paused_by_rule" || safetyFlags.includes("legal_advice") || safetyFlags.includes("valuation_claim")) {
      return "pause_for_owner";
    }
    if (safetyFlags.includes("showing_approval_required")) return "request_showing_approval";
    if (missingFields.length > 0) return "ask_qualification";
    if (qualifiedEnough && parsed.lead.assignedAgentName === null) return "route_lead";
    if (qualifiedEnough) return "sync_crm";
    return "nurture";
  })();

  const nextMissing = missingFields[0] ?? null;
  const actionLabel = {
    ask_qualification: nextMissing === null ? "ask one question" : `ask ${nextMissing.replace("_", " ")}`,
    book_callback: "book callback",
    edit_reply: "edit reply",
    nurture: "add to nurture",
    pause_for_owner: "keep paused",
    register_open_house: "register open house",
    request_showing_approval: "request showing approval",
    route_lead: "route lead",
    send_reply: "send reply",
    sync_crm: "sync to FUB",
  }[recommendedAction];

  const routingSuggestion = parsed.lead.assignedAgentName === null
    ? "hold for owner/team lead routing because no assigned agent is set yet."
    : `route is currently ${parsed.lead.assignedAgentName}; preserve source credit for ${parsed.lead.sourceOwnerName ?? "the workspace"}.`;

  return HarwickAiDecisionSchema.parse({
    automationMode: parsed.automationMode,
    roleLens: roleLensFor(parsed.viewerRole),
    currentIntent: parsed.lead.leadType === "unknown" ? "qualification in progress" : parsed.lead.leadType,
    qualificationSummary: missingFields.length === 0
      ? "lead has the core qualification fields needed for assignment or CRM sync."
      : `missing ${missingFields.map((field) => field.replace("_", " ")).join(", ")} before this should be treated as clean.`,
    missingFields,
    safetyFlags,
    recommendedAction,
    actionLabel,
    actionReason: canAutoSend
      ? "automation is on, no safety flags were detected, and a validated reply is available."
      : "Harwick should keep the operator in control until missing fields, approval, or safety flags are resolved.",
    canAutoSend,
    requiresApproval: !canAutoSend,
    routingSuggestion,
    helperNotes: [
      roleLensFor(parsed.viewerRole),
      missingFields.length === 0 ? "do not ask extra questions before routing." : "ask one missing qualification question at a time.",
      "keep CRM sync after qualification and assignment are clean.",
    ],
    replyText: parsed.suggestedReply,
  });
}
