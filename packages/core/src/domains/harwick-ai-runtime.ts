import { z } from "zod";
import { ConversationAutomationModeSchema } from "./conversation-automation.js";
import {
  FinancingStatusSchema,
  LeadIntentSchema,
  LeadSourceChannelSchema,
  LeadTypeSchema,
} from "./lead.js";
import { ProviderIdSchema, UuidSchema } from "./common.js";

export const HarwickAiActorSchema = z.enum(["lead", "harwick_ai", "human", "system"]);

export const HarwickAiConversationMessageSchema = z.object({
  id: z.string().trim().min(1).max(160),
  actor: HarwickAiActorSchema,
  body: z.string().trim().min(1).max(8000),
  occurredAt: z.string().datetime().nullable().default(null),
});

export const HarwickAiToneProfileSchema = z.object({
  name: z.string().trim().min(1).max(120).default("workspace default"),
  voice: z.string().trim().min(1).max(500).default("warm, concise, professional, and human"),
  bannedPhrases: z.array(z.string().trim().min(1).max(120)).max(40).default([]),
  preferredPhrases: z.array(z.string().trim().min(1).max(160)).max(40).default([]),
  emojiPolicy: z.enum(["none", "minimal", "natural"]).default("none"),
  signature: z.string().trim().max(160).nullable().default(null),
});

export const HarwickAiListingMemorySchema = z.object({
  listingId: z.string().trim().min(1).max(160).nullable().default(null),
  label: z.string().trim().min(1).max(180),
  address: z.string().trim().max(220).nullable().default(null),
  price: z.string().trim().max(120).nullable().default(null),
  status: z.string().trim().max(80).nullable().default(null),
  beds: z.string().trim().max(80).nullable().default(null),
  baths: z.string().trim().max(80).nullable().default(null),
  area: z.string().trim().max(160).nullable().default(null),
  facts: z.array(z.string().trim().min(1).max(240)).max(20).default([]),
  lastVerifiedAt: z.string().datetime().nullable().default(null),
});

export const HarwickAiCalendarMemorySchema = z.object({
  agentId: UuidSchema.nullable().default(null),
  agentName: z.string().trim().min(1).max(160),
  showingMode: z.enum(["collect_only", "request_approve", "auto_book"]).default("request_approve"),
  availableWindows: z.array(z.string().trim().min(1).max(160)).max(12).default([]),
});

export const HarwickAiQualificationStateSchema = z.object({
  name: z.string().trim().min(1).max(160).nullable().default(null),
  phone: z.string().trim().min(1).max(80).nullable().default(null),
  email: z.string().trim().email().nullable().default(null),
  leadType: LeadTypeSchema.default("unknown"),
  intent: LeadIntentSchema.default("unknown"),
  timeline: z.string().trim().min(1).max(120).nullable().default(null),
  budget: z.union([z.string(), z.number()]).pipe(z.coerce.string().trim().min(1).max(120)).nullable().default(null),
  targetArea: z.string().trim().min(1).max(180).nullable().default(null),
  propertyType: z.string().trim().min(1).max(120).nullable().default(null),
  financingStatus: FinancingStatusSchema.default("unknown"),
  score: z.number().int().min(0).max(100).default(0),
});

export const HarwickAiConversationStateSchema = z.object({
  workspaceId: UuidSchema.nullable().default(null),
  leadId: UuidSchema.nullable().default(null),
  providerThreadId: ProviderIdSchema.nullable().default(null),
  channel: LeadSourceChannelSchema,
  automationMode: ConversationAutomationModeSchema.default("ai_on"),
  currentIntent: z.string().trim().min(1).max(160).default("qualification_in_progress"),
  qualification: HarwickAiQualificationStateSchema.default({}),
  knownFacts: z.array(z.string().trim().min(1).max(240)).max(50).default([]),
  lastAiAction: z.string().trim().min(1).max(160).nullable().default(null),
  assignedAgentName: z.string().trim().min(1).max(160).nullable().default(null),
  sourceOwnerName: z.string().trim().min(1).max(160).nullable().default(null),
});

export const HarwickAiPostContextSchema = z.object({
  caption: z.string().trim().max(8000).nullable().default(null),
  ctaLabel: z.string().trim().max(120).nullable().default(null),
  areasMentioned: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  listingHints: z.array(z.string().trim().min(1).max(240)).max(30).default([]),
  permalink: z.string().trim().url().nullable().default(null),
  visualDescription: z.string().trim().max(2000).nullable().default(null),
});

export const HarwickAiRuntimeInputSchema = z.object({
  workspaceName: z.string().trim().min(1).max(120),
  channel: LeadSourceChannelSchema,
  inboundText: z.string().trim().min(1).max(8000),
  conversation: z.array(HarwickAiConversationMessageSchema).max(60).default([]),
  state: HarwickAiConversationStateSchema.nullable().default(null),
  toneProfile: HarwickAiToneProfileSchema.default({}),
  postContext: HarwickAiPostContextSchema.nullable().default(null),
  listingContext: HarwickAiListingMemorySchema.nullable().default(null),
  calendarContext: z.array(HarwickAiCalendarMemorySchema).max(20).default([]),
  buyerBlueprintUrl: z.string().trim().url().nullable().default(null),
  // AI-native shift 3: prose policy injected into the system prompt; model
  // self-gates against this narrative. Coexists with the structured policy
  // gate during shadow mode.
  policyNarrative: z.string().trim().max(8000).nullable().default(null),
  // AI-native shift 4: prose lead document the model reads as primary context
  // and amends each turn. Coexists with structured `state` during shadow mode.
  leadDocument: z.string().trim().max(16000).nullable().default(null),
  // AI-native capability 1: workspace-level memory distilled across leads.
  // This is brokerage-wide context, not facts from this specific lead.
  workspaceMemory: z.string().trim().max(8000).nullable().default(null),
  // In-context retrieval RL: prose-rendered top-N similar past trajectories
  // with positive outcomes. Lets the model do retrieval-flavored RL without
  // any gradient updates. Populated by the executor at decision time.
  retrievedExamples: z.string().trim().max(8000).nullable().default(null),
});

export const HarwickAiMissingFieldRuntimeSchema = z.enum([
  "name",
  "phone",
  "email",
  "intent",
  "timeline",
  "budget",
  "area",
  "property_type",
  "financing",
  "buyer_or_seller",
]);

export const HarwickAiRuntimeActionSchema = z.enum([
  "send_reply",
  "ask_qualification",
  "move_comment_to_dm",
  "send_buyer_blueprint",
  "offer_showing",
  "request_showing_approval",
  "register_open_house",
  "route_lead",
  "handoff_to_agent",
  "pause_for_owner",
  "do_not_reply",
]);

export const HarwickAiToolNameSchema = z.enum([
  "send_meta_reply",
  "send_meta_dm",
  "check_calendar",
  "request_showing_approval",
  "register_open_house",
  "route_lead",
  "sync_follow_up_boss",
  "pause_automation",
]);

export const HarwickAiToolCallSchema = z.object({
  tool: HarwickAiToolNameSchema,
  reason: z.string().trim().min(1).max(240),
  requiresApproval: z.boolean().default(false),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export const HarwickAiRuntimeSafetyFlagSchema = z.enum([
  "safe_to_send",
  "needs_human_review",
  "human_takeover",
  "legal_advice",
  "lending_advice",
  "contract_advice",
  "valuation_claim",
  "claims_listing_availability",
  "claims_financing_certainty",
  "low_confidence",
]);

export const HarwickAiStatePatchSchema = z.object({
  currentIntent: z.string().trim().min(1).max(160).nullable().default(null),
  leadType: LeadTypeSchema.nullable().default(null),
  intent: LeadIntentSchema.nullable().default(null),
  timeline: z.string().trim().min(1).max(120).nullable().default(null),
  budget: z.union([z.string(), z.number()]).pipe(z.coerce.string().trim().min(1).max(120)).nullable().default(null),
  targetArea: z.string().trim().min(1).max(180).nullable().default(null),
  propertyType: z.string().trim().min(1).max(120).nullable().default(null),
  financingStatus: FinancingStatusSchema.nullable().default(null),
  knownFacts: z.array(z.string().trim().min(1).max(240)).max(20).default([]),
});

export const HarwickAiTurnSchema = z.object({
  intent: z.enum([
    "listing_question",
    "showing_request",
    "buyer_qualification",
    "seller_qualification",
    "blueprint_request",
    "financing_question",
    "general_follow_up",
    "handoff_needed",
    "spam_or_unsafe",
  ]),
  nextAction: HarwickAiRuntimeActionSchema,
  missingFields: z.array(HarwickAiMissingFieldRuntimeSchema).max(10),
  confidence: z.number().min(0).max(1),
  safetyFlags: z.array(HarwickAiRuntimeSafetyFlagSchema).max(10),
  reply: z.string().trim().min(1).max(800),
  statePatch: HarwickAiStatePatchSchema.default({}),
  handoffBrief: z.string().trim().max(1000).nullable().default(null),
  toolCalls: z.array(HarwickAiToolCallSchema).max(8).default([]),
  // AI-native shift 3: model self-gates and reports its own decision so we can
  // shadow-compare against the deterministic gate.
  selfGateAutoExecute: z.boolean().default(true),
  selfGateReason: z.string().trim().max(500).default("policy narrative permits autonomous send."),
  // AI-native shift 4: prose update the model appends to the lead document
  // after the turn. Empty string means "no update this turn" — caller skips.
  documentUpdate: z.string().trim().max(2000).default(""),
  // AI-native shift 5: model declares whether the agentic loop should keep
  // running tools or close the turn.
  endTurn: z.boolean().default(true),
});

export type HarwickAiConversationMessage = z.infer<typeof HarwickAiConversationMessageSchema>;
export type HarwickAiToneProfile = z.infer<typeof HarwickAiToneProfileSchema>;
export type HarwickAiListingMemory = z.infer<typeof HarwickAiListingMemorySchema>;
export type HarwickAiCalendarMemory = z.infer<typeof HarwickAiCalendarMemorySchema>;
export type HarwickAiConversationState = z.infer<typeof HarwickAiConversationStateSchema>;
export type HarwickAiRuntimeInput = z.input<typeof HarwickAiRuntimeInputSchema>;
export type HarwickAiRuntimeAction = z.infer<typeof HarwickAiRuntimeActionSchema>;
export type HarwickAiToolName = z.infer<typeof HarwickAiToolNameSchema>;
export type HarwickAiToolCall = z.infer<typeof HarwickAiToolCallSchema>;
export type HarwickAiTurn = z.infer<typeof HarwickAiTurnSchema>;
