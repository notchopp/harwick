import { z } from "zod";
import { ProviderIdSchema, UuidSchema } from "./common.js";

export const RealtyVoiceLeadTypeSchema = z.enum(["buyer", "seller", "renter", "investor", "unknown"]);
export const RealtyVoiceUrgencySchema = z.enum(["routine", "hot", "needs_handoff"]);
export const RealtyVoiceNextActionTypeSchema = z.enum([
  "collect_intent",
  "qualify_lead",
  "answer_listing_question",
  "offer_handoff",
]);

export const RealtyVoiceContractSchema = z.object({
  version: z.literal("realty_voice_v1"),
  workspace: z.object({
    id: UuidSchema,
    name: z.string().trim().min(1).max(120),
    timezone: z.string().trim().min(1).max(80),
    serviceAreas: z.array(z.string().trim().min(1).max(120)),
    transferNumber: z.string().trim().min(1).max(32).nullable(),
  }),
  call: z.object({
    retellAgentId: ProviderIdSchema,
    fromNumber: z.string(),
    toNumber: z.string(),
  }),
  caller: z.object({
    known: z.boolean(),
    displayName: z.string().trim().min(1).max(120).nullable(),
    phoneNumber: z.string(),
    relationshipTier: z.enum(["new", "known", "vip"]),
    nameCollectionRequired: z.boolean(),
  }),
  leadState: z.object({
    leadType: RealtyVoiceLeadTypeSchema,
    urgency: RealtyVoiceUrgencySchema,
    targetArea: z.string(),
    timeline: z.string(),
    budget: z.string(),
    financingStatus: z.enum(["preapproved", "cash", "needs_lender", "unknown"]),
    listingQuestionActive: z.boolean(),
  }),
  memory: z.object({
    summary: z.string().trim().min(1),
    openLoops: z.array(z.string().trim().min(1).max(500)),
  }),
  actionContract: z.object({
    nextAction: z.object({
      type: RealtyVoiceNextActionTypeSchema,
      reason: z.string().trim().min(1),
      prompt: z.string().trim().min(1),
      question: z.string().trim().min(1),
      preferredTools: z.array(z.string().trim().min(1).max(80)),
      shouldAcknowledgePriorContext: z.boolean(),
      shouldLeadWithAction: z.boolean(),
    }),
    followThroughPolicy: z.object({
      style: z.enum(["single_step", "qualify_then_route", "verify_then_answer", "handoff"]),
      fallbackAction: z.enum(["none", "create_lead_handoff", "transfer_to_human"]),
      maxAttempts: z.number().int().min(1).max(3),
    }),
    questionsToAvoid: z.array(z.string().trim().min(1).max(120)),
  }),
  decision: z.object({
    openingMode: z.enum(["new_caller", "known_caller", "handoff_ready"]),
    openingText: z.string().trim().min(1),
    nextQuestion: z.string().trim().min(1),
    maxQuestionsPerTurn: z.literal(1),
    maxSentencesPerTurn: z.literal(2),
    waitForUserAfterQuestion: z.literal(true),
  }),
  constraints: z.object({
    mustNotAskForNameAgain: z.boolean(),
    mustConfirmPhoneBeforeSms: z.literal(true),
    mustNotClaimListingAvailabilityWithoutSource: z.literal(true),
    mustEscalateLegalLendingAdvice: z.literal(true),
    canTransferToHuman: z.boolean(),
  }),
  handoff: z.object({
    summary: z.string().trim().min(1),
    fieldsToPreserve: z.array(z.string().trim().min(1)),
  }),
});

export const RealtyVoiceAliasesSchema = z.object({
  realty_voice_contract_json: z.string().trim().min(1),
  realty_opening_text: z.string().trim().min(1),
  realty_next_question: z.string().trim().min(1),
  realty_memory_summary: z.string().trim().min(1),
  realty_lead_type: RealtyVoiceLeadTypeSchema,
  realty_urgency: RealtyVoiceUrgencySchema,
  realty_next_action_type: RealtyVoiceNextActionTypeSchema,
  realty_preferred_tools_summary: z.string(),
  realty_follow_through_style: z.string().trim().min(1),
  realty_follow_through_fallback: z.string().trim().min(1),
  realty_questions_to_avoid_summary: z.string(),
  realty_can_transfer_to_human: z.boolean(),
  realty_must_verify_listing_status: z.literal(true),
  realty_must_escalate_legal_lending: z.literal(true),
  realty_max_questions_per_turn: z.literal(1),
  realty_max_sentences_per_turn: z.literal(2),
});

export type RealtyVoiceContract = z.infer<typeof RealtyVoiceContractSchema>;
export type RealtyVoiceAliases = z.infer<typeof RealtyVoiceAliasesSchema>;

export function buildRealtyVoiceContract(input: {
  workspaceId: string;
  workspaceName: string;
  timezone?: string;
  serviceAreas: string[];
  transferNumber: string | null;
  retellAgentId: string;
  fromNumber?: string | null;
  toNumber?: string | null;
  callerName?: string | null;
  memorySummary?: string | null;
}): RealtyVoiceContract {
  const knownCaller = Boolean(input.callerName);
  const serviceAreaSummary = input.serviceAreas.length > 0
    ? input.serviceAreas.join(", ")
    : "the caller's target area";
  const nextQuestion = knownCaller
    ? "Are you calling about a home, selling, or something else today?"
    : "Are you looking to buy, sell, rent, or ask about a specific home?";
  const memorySummary = input.memorySummary?.trim() || "No prior lead history loaded yet.";
  const openingText = knownCaller && input.callerName
    ? `Hey ${input.callerName}, thanks for calling ${input.workspaceName}. ${nextQuestion}`
    : `Thanks for calling ${input.workspaceName}. ${nextQuestion}`;

  return RealtyVoiceContractSchema.parse({
    version: "realty_voice_v1",
    workspace: {
      id: input.workspaceId,
      name: input.workspaceName,
      timezone: input.timezone ?? "America/New_York",
      serviceAreas: input.serviceAreas,
      transferNumber: input.transferNumber,
    },
    call: {
      retellAgentId: input.retellAgentId,
      fromNumber: input.fromNumber ?? "",
      toNumber: input.toNumber ?? "",
    },
    caller: {
      known: knownCaller,
      displayName: input.callerName?.trim() || null,
      phoneNumber: input.fromNumber ?? "",
      relationshipTier: knownCaller ? "known" : "new",
      nameCollectionRequired: !knownCaller,
    },
    leadState: {
      leadType: "unknown",
      urgency: "routine",
      targetArea: "",
      timeline: "",
      budget: "",
      financingStatus: "unknown",
      listingQuestionActive: false,
    },
    memory: {
      summary: memorySummary,
      openLoops: [],
    },
    actionContract: {
      nextAction: {
        type: "collect_intent",
        reason: `The caller needs to be routed into buyer, seller, renter, investor, or listing-specific flow for ${serviceAreaSummary}.`,
        prompt: "Start with intent, then collect only the next missing qualification field.",
        question: nextQuestion,
        preferredTools: ["create_lead_handoff", "lookup_listing", "transfer_call"],
        shouldAcknowledgePriorContext: knownCaller,
        shouldLeadWithAction: false,
      },
      followThroughPolicy: {
        style: "qualify_then_route",
        fallbackAction: input.transferNumber ? "transfer_to_human" : "create_lead_handoff",
        maxAttempts: 2,
      },
      questionsToAvoid: knownCaller ? ["ask_for_name_again"] : [],
    },
    decision: {
      openingMode: knownCaller ? "known_caller" : "new_caller",
      openingText,
      nextQuestion,
      maxQuestionsPerTurn: 1,
      maxSentencesPerTurn: 2,
      waitForUserAfterQuestion: true,
    },
    constraints: {
      mustNotAskForNameAgain: knownCaller,
      mustConfirmPhoneBeforeSms: true,
      mustNotClaimListingAvailabilityWithoutSource: true,
      mustEscalateLegalLendingAdvice: true,
      canTransferToHuman: Boolean(input.transferNumber),
    },
    handoff: {
      summary: memorySummary,
      fieldsToPreserve: [
        "realty.caller.displayName",
        "realty.caller.phoneNumber",
        "realty.leadState.leadType",
        "realty.leadState.targetArea",
        "realty.leadState.timeline",
        "realty.leadState.budget",
        "realty.leadState.financingStatus",
        "realty.memory.summary",
        "realty.actionContract.nextAction",
      ],
    },
  });
}

export function buildRealtyVoiceAliases(contract: RealtyVoiceContract): RealtyVoiceAliases {
  return RealtyVoiceAliasesSchema.parse({
    realty_voice_contract_json: JSON.stringify(contract),
    realty_opening_text: contract.decision.openingText,
    realty_next_question: contract.decision.nextQuestion,
    realty_memory_summary: contract.memory.summary,
    realty_lead_type: contract.leadState.leadType,
    realty_urgency: contract.leadState.urgency,
    realty_next_action_type: contract.actionContract.nextAction.type,
    realty_preferred_tools_summary: contract.actionContract.nextAction.preferredTools.join(", "),
    realty_follow_through_style: contract.actionContract.followThroughPolicy.style,
    realty_follow_through_fallback: contract.actionContract.followThroughPolicy.fallbackAction,
    realty_questions_to_avoid_summary: contract.actionContract.questionsToAvoid.join(", "),
    realty_can_transfer_to_human: contract.constraints.canTransferToHuman,
    realty_must_verify_listing_status: contract.constraints.mustNotClaimListingAvailabilityWithoutSource,
    realty_must_escalate_legal_lending: contract.constraints.mustEscalateLegalLendingAdvice,
    realty_max_questions_per_turn: contract.decision.maxQuestionsPerTurn,
    realty_max_sentences_per_turn: contract.decision.maxSentencesPerTurn,
  });
}
