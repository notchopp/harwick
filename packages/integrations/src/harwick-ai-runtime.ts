import {
  AiReplyDraftSchema,
  HarwickAiRuntimeInputSchema,
  HarwickAiTurnSchema,
  type AiReplyDraft,
  type HarwickAiRuntimeInput,
  type HarwickAiToolCall,
  type HarwickAiTurn,
} from "@realty-ops/core";
import type { z } from "zod";
// The OpenAI Responses API runtime + hand-rolled JSON parser used to live in
// this file. Replaced by apps/web/src/features/lead-intake/ai-sdk-runtime.ts,
// which uses ai-sdk's generateObject + HarwickAiTurnSchema for guaranteed
// structured output and provider-agnostic invocation. What remains here is
// just the interface contract and the deterministic local runtime used by
// tests / offline mode.

export type HarwickAiRuntimeClient = {
  runTurn(input: HarwickAiRuntimeInput): Promise<HarwickAiTurn>;
};

export function toLegacyAiReplyDraft(turn: HarwickAiTurn): AiReplyDraft {
  const nextAction = (() => {
    if (turn.nextAction === "send_buyer_blueprint") return "send_buyer_blueprint";
    if (turn.nextAction === "offer_showing" || turn.nextAction === "request_showing_approval") return "offer_showing";
    if (turn.nextAction === "handoff_to_agent" || turn.nextAction === "pause_for_owner") return "handoff_to_agent";
    if (turn.nextAction === "do_not_reply") return "do_not_reply";
    if (turn.nextAction === "ask_qualification" || turn.nextAction === "move_comment_to_dm") return "ask_qualification";
    return "reply_only";
  })();

  const missingFields = turn.missingFields
    .map((field) => {
      if (
        field === "name"
        || field === "phone"
        || field === "email"
        || field === "timeline"
        || field === "budget"
        || field === "area"
        || field === "financing"
        || field === "buyer_or_seller"
      ) {
        return field;
      }

      return null;
    })
    .filter((field): field is AiReplyDraft["missingFields"][number] => field !== null)
    .filter((field, index, fields) => fields.indexOf(field) === index);

  const policyFlags = turn.safetyFlags.includes("safe_to_send")
    ? ["safe_to_send"] as const
    : [
        ...(turn.safetyFlags.includes("claims_listing_availability") ? ["claims_listing_availability" as const] : []),
        ...(turn.safetyFlags.includes("claims_financing_certainty") ? ["claims_financing_certainty" as const] : []),
        "needs_human_review" as const,
      ];

  return AiReplyDraftSchema.parse({
    intent: turn.intent,
    nextAction,
    missingFields,
    confidence: turn.confidence,
    policyFlags,
    reply: turn.reply,
  });
}

function normalize(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function includesKeyword(text: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function readFacts(input: z.infer<typeof HarwickAiRuntimeInputSchema>): string[] {
  return [
    ...(input.postContext?.listingHints ?? []),
    ...(input.postContext?.caption ? [input.postContext.caption] : []),
    ...(input.listingContext?.facts ?? []),
    ...(input.listingContext?.price ? [`price ${input.listingContext.price}`] : []),
    ...(input.listingContext?.status ? [`status ${input.listingContext.status}`] : []),
  ]
    .map((fact) => fact.trim())
    .filter((fact, index, facts) => fact.length > 0 && facts.indexOf(fact) === index)
    .slice(0, 4);
}

function firstKnownArea(input: z.infer<typeof HarwickAiRuntimeInputSchema>): string | null {
  return input.state?.qualification.targetArea
    ?? input.listingContext?.area
    ?? input.postContext?.areasMentioned[0]
    ?? null;
}

function firstKnownBudget(input: z.infer<typeof HarwickAiRuntimeInputSchema>): string | null {
  return input.state?.qualification.budget
    ?? input.listingContext?.price
    ?? null;
}

function firstKnownTimeline(input: z.infer<typeof HarwickAiRuntimeInputSchema>): string | null {
  return input.state?.qualification.timeline ?? null;
}

function missingFields(input: z.infer<typeof HarwickAiRuntimeInputSchema>, order: HarwickAiTurn["missingFields"]): HarwickAiTurn["missingFields"] {
  const missing: HarwickAiTurn["missingFields"] = [];
  const qualification = input.state?.qualification;
  for (const field of order) {
    if (field === "name" && qualification?.name !== null && qualification?.name !== undefined) continue;
    if (field === "phone" && qualification?.phone !== null && qualification?.phone !== undefined) continue;
    if (field === "email" && qualification?.email !== null && qualification?.email !== undefined) continue;
    if (field === "timeline" && firstKnownTimeline(input) !== null) continue;
    if (field === "budget" && firstKnownBudget(input) !== null) continue;
    if (field === "area" && firstKnownArea(input) !== null) continue;
    if (field === "property_type" && qualification?.propertyType !== null && qualification?.propertyType !== undefined) continue;
    if (field === "financing" && qualification?.financingStatus !== "unknown" && qualification?.financingStatus !== undefined) continue;
    if (field === "buyer_or_seller" && qualification?.leadType !== "unknown" && qualification?.leadType !== undefined) continue;
    if (field === "intent" && qualification?.intent !== "unknown" && qualification?.intent !== undefined) continue;
    if (!missing.includes(field)) missing.push(field);
  }
  return missing;
}

function trimReply(reply: string): string {
  return reply.replace(/\s+/g, " ").trim().slice(0, 800);
}

function baseTool(tool: HarwickAiToolCall["tool"], reason: string, requiresApproval = false, payload: Record<string, unknown> = {}): HarwickAiToolCall {
  return { tool, reason, requiresApproval, payload };
}

function outboundToolFor(input: z.infer<typeof HarwickAiRuntimeInputSchema>, reply: string): HarwickAiToolCall {
  if (input.channel === "instagram_comment" || input.channel === "facebook_comment") {
    return baseTool("send_meta_message", "answer the public comment with a safe short reply", false, {
      reply,
      target: "comment",
    });
  }

  return baseTool("send_meta_message", "continue the private conversation with the lead", false, {
    reply,
    target: "dm",
  });
}

function commentToDmToolCalls(params: {
  input: z.infer<typeof HarwickAiRuntimeInputSchema>;
  publicReply: string;
  dmReply: string;
}): HarwickAiToolCall[] {
  if (!(params.input.channel === "instagram_comment" || params.input.channel === "facebook_comment")) {
    return [outboundToolFor(params.input, params.dmReply)];
  }

  return [
    baseTool("send_meta_message", "acknowledge publicly on the original comment thread before moving private", false, {
      reply: params.publicReply,
      target: "comment",
    }),
    baseTool("send_meta_message", "continue the qualification in DM while linking it back to the original comment", false, {
      reply: params.dmReply,
      target: "dm",
    }),
  ];
}

function handoffBrief(input: z.infer<typeof HarwickAiRuntimeInputSchema>, reason: string): string {
  const qualification = input.state?.qualification;
  return [
    reason,
    `channel: ${input.channel}`,
    `lead type: ${qualification?.leadType ?? "unknown"}`,
    `area: ${firstKnownArea(input) ?? "unknown"}`,
    `budget: ${firstKnownBudget(input) ?? "unknown"}`,
    `timeline: ${firstKnownTimeline(input) ?? "unknown"}`,
    `assigned agent: ${input.state?.assignedAgentName ?? "unassigned"}`,
    `source owner: ${input.state?.sourceOwnerName ?? "workspace"}`,
  ].join(" • ");
}

function createTurn(value: unknown): HarwickAiTurn {
  return HarwickAiTurnSchema.parse(value);
}

function buildListingTurn(input: z.infer<typeof HarwickAiRuntimeInputSchema>, leadText: string): HarwickAiTurn {
  const facts = readFacts(input);
  const factsSentence = facts.length === 0 ? "" : ` The details I have are: ${facts.join(", ")}.`;
  const asksAvailability = leadText.includes("available") || leadText.includes("still on the market");
  const dmReply = trimReply(`${asksAvailability ? "I can check the latest status for you." : "I can help with that one."}${factsSentence} ${firstKnownTimeline(input) === null ? "Are you looking to move soon or just starting your search?" : "Do you want me to send similar homes or look at showing times?"}`);
  const publicReply = trimReply(`${facts.length === 0 ? "I can send the details over." : `I can send the details over.${factsSentence}`} Check your DM and I will help from there.`);
  const reply = input.channel.endsWith("_comment") ? publicReply : dmReply;

  return createTurn({
    intent: "listing_question",
    nextAction: input.channel.endsWith("_comment") ? "move_comment_to_dm" : "ask_qualification",
    missingFields: missingFields(input, ["timeline", "budget", "area", "financing"]),
    confidence: facts.length === 0 ? 0.76 : 0.91,
    safetyFlags: ["safe_to_send"],
    reply,
    statePatch: {
      currentIntent: "listing_question",
      leadType: "buyer",
      intent: "medium",
      targetArea: firstKnownArea(input),
      budget: firstKnownBudget(input),
      knownFacts: facts,
    },
    handoffBrief: null,
    toolCalls: input.channel.endsWith("_comment")
      ? commentToDmToolCalls({
          input,
          publicReply,
          dmReply,
        })
      : [outboundToolFor(input, reply)],
  });
}

function buildShowingTurn(input: z.infer<typeof HarwickAiRuntimeInputSchema>): HarwickAiTurn {
  const availableAgent = input.calendarContext[0] ?? null;
  const hasWindows = availableAgent !== null && availableAgent.availableWindows.length > 0;
  const shouldAutoBook = availableAgent?.showingMode === "auto_book" && missingFields(input, ["phone", "financing"]).length === 0;
  const reply = shouldAutoBook
    ? trimReply(`I can help get that showing set. ${availableAgent.availableWindows.slice(0, 2).join(" or ")} works on our side. Which one should I hold?`)
    : hasWindows
      ? trimReply(`I can help request a showing. I see ${availableAgent.agentName} has ${availableAgent.availableWindows.slice(0, 2).join(" or ")} open. What is the best phone number for the confirmation?`)
      : "I can help request a showing. What day and time works best for you, and what is the best phone number for confirmation?";

  return createTurn({
    intent: "showing_request",
    nextAction: shouldAutoBook ? "offer_showing" : "request_showing_approval",
    missingFields: missingFields(input, ["phone", "timeline", "financing"]),
    confidence: 0.92,
    safetyFlags: shouldAutoBook ? ["safe_to_send"] : ["needs_human_review"],
    reply,
    statePatch: {
      currentIntent: "showing_request",
      leadType: "buyer",
      intent: "high",
      targetArea: firstKnownArea(input),
      budget: firstKnownBudget(input),
    },
    handoffBrief: handoffBrief(input, "showing request needs agent approval or calendar confirmation"),
    toolCalls: [
      baseTool("check_calendar", "check assigned agent availability before confirming a showing", false, {
        listing: input.listingContext?.label ?? null,
      }),
      baseTool("request_showing_approval", "agent approval is required before confirming the private showing", true, {
        listing: input.listingContext?.label ?? null,
      }),
    ],
  });
}

function buildBlueprintTurn(input: z.infer<typeof HarwickAiRuntimeInputSchema>): HarwickAiTurn {
  const reply = input.buyerBlueprintUrl === null
    ? "I can walk you through the buyer blueprint and pull a few strong matches. What area should I anchor it around?"
    : `Absolutely — here is the buyer blueprint: ${input.buyerBlueprintUrl}. What area or timeline should I use to pull matching homes?`;

  return createTurn({
    intent: "blueprint_request",
    nextAction: input.buyerBlueprintUrl === null ? "ask_qualification" : "send_buyer_blueprint",
    missingFields: missingFields(input, ["area", "timeline", "budget", "financing"]),
    confidence: 0.91,
    safetyFlags: ["safe_to_send"],
    reply,
    statePatch: {
      currentIntent: "blueprint_request",
      leadType: "buyer",
      intent: "medium",
    },
    handoffBrief: null,
    toolCalls: [
      outboundToolFor(input, reply),
      ...(input.buyerBlueprintUrl === null ? [] : [baseTool("send_meta_message", "send the buyer blueprint link in the conversation", false, {
        reply: `Here is the buyer blueprint with the full process and what to expect next: ${input.buyerBlueprintUrl}`,
        target: "dm",
      })]),
    ],
  });
}

function buildSellerTurn(input: z.infer<typeof HarwickAiRuntimeInputSchema>): HarwickAiTurn {
  const reply = "I can help with that. What area is the home in, and are you thinking about selling soon or just watching the market?";

  return createTurn({
    intent: "seller_qualification",
    nextAction: "ask_qualification",
    missingFields: missingFields(input, ["area", "timeline", "phone"]),
    confidence: 0.9,
    safetyFlags: ["safe_to_send"],
    reply,
    statePatch: {
      currentIntent: "seller_qualification",
      leadType: "seller",
      intent: "medium",
    },
    handoffBrief: null,
    toolCalls: [outboundToolFor(input, reply)],
  });
}

function buildFinancingTurn(input: z.infer<typeof HarwickAiRuntimeInputSchema>, needsHumanReview: boolean): HarwickAiTurn {
  const reply = needsHumanReview
    ? "I want the team to confirm that directly so we do not guess on financing, legal, or contract details. What is the best number or email for the handoff?"
    : "Down payment depends on the loan program, but many buyers start anywhere from 3% to 20%. Have you already spoken with a lender, or are you just starting that part?";

  return createTurn({
    intent: "financing_question",
    nextAction: needsHumanReview ? "handoff_to_agent" : "ask_qualification",
    missingFields: missingFields(input, needsHumanReview ? ["phone", "email"] : ["financing", "timeline", "budget"]),
    confidence: needsHumanReview ? 0.88 : 0.89,
    safetyFlags: needsHumanReview ? ["needs_human_review", "lending_advice"] : ["safe_to_send"],
    reply,
    statePatch: {
      currentIntent: "financing_question",
      leadType: "buyer",
      intent: needsHumanReview ? "high" : "medium",
    },
    handoffBrief: needsHumanReview ? handoffBrief(input, "lead asked a financing/legal/contract question requiring human review") : null,
    toolCalls: needsHumanReview
      ? [baseTool("pause_automation", "pause because the lead asked for advice that needs a human", false, {
        reason: "financing_or_legal_review",
      })]
      : [outboundToolFor(input, reply)],
  });
}

function buildGenericTurn(input: z.infer<typeof HarwickAiRuntimeInputSchema>, leadText: string): HarwickAiTurn {
  const greeting = includesKeyword(leadText, ["hello", "hi", "hey", "good morning", "good afternoon"]);
  const identity = includesKeyword(leadText, ["who are you", "who is this", "is this a bot", "are you a bot", "real person", "what is harwick"]);
  const area = firstKnownArea(input);
  const reply = greeting
    ? `Hey — Harwick here with the team. I can help with ${area ?? "the search"} and the next step from here. Are you looking for pricing, a tour, or a few comparable options?`
    : identity
      ? `I’m Harwick with the team — here to help with ${area ?? "the homes you asked about"}, answer questions, and line up next steps. Do you want listing details, a tour, or a few similar options first?`
    : "Happy to help you narrow this down. What matters most right now — area, budget, or timing?";

  return createTurn({
    intent: greeting || identity ? "general_follow_up" : "buyer_qualification",
    nextAction: "ask_qualification",
    missingFields: missingFields(input, ["area", "budget", "timeline", "financing"]),
    confidence: greeting ? 0.84 : 0.8,
    safetyFlags: ["safe_to_send"],
    reply,
    statePatch: {
      currentIntent: "buyer_qualification",
      leadType: "buyer",
      intent: "medium",
      targetArea: firstKnownArea(input),
      budget: firstKnownBudget(input),
    },
    handoffBrief: null,
    toolCalls: [outboundToolFor(input, reply)],
  });
}

export function createLocalHarwickAiRuntime(): HarwickAiRuntimeClient {
  return {
    runTurn(input: HarwickAiRuntimeInput): Promise<HarwickAiTurn> {
      const parsed = HarwickAiRuntimeInputSchema.parse(input);
      const leadText = normalize(parsed.inboundText);

      if (parsed.state?.automationMode === "human_takeover") {
        return Promise.resolve(createTurn({
          intent: "handoff_needed",
          nextAction: "pause_for_owner",
          missingFields: missingFields(parsed, ["timeline", "budget", "area", "financing"]),
          confidence: 1,
          safetyFlags: ["human_takeover", "needs_human_review"],
          reply: "A human has taken over this conversation.",
          statePatch: {
            currentIntent: "human_takeover",
          },
          handoffBrief: handoffBrief(parsed, "automation is paused because a human took over"),
          toolCalls: [baseTool("pause_automation", "conversation automation is off for this thread", false)],
        }));
      }

      if (includesKeyword(leadText, ["guarantee", "legal", "attorney", "lawyer", "contract advice", "tax advice", "sure approval", "promise approval"])) {
        return Promise.resolve(buildFinancingTurn(parsed, true));
      }
      if (includesKeyword(leadText, ["blueprint", "guide", "checklist", "plan"])) {
        return Promise.resolve(buildBlueprintTurn(parsed));
      }
      if (includesKeyword(leadText, ["tour", "showing", "see it", "see this", "walkthrough", "walk through", "view it", "visit", "private showing", "open house"])) {
        return Promise.resolve(buildShowingTurn(parsed));
      }
      if (includesKeyword(leadText, ["mortgage", "down payment", "interest rate", "monthly payment", "lender", "loan", "finance", "credit score", "preapprove", "pre-approved"])) {
        return Promise.resolve(buildFinancingTurn(parsed, false));
      }
      if (includesKeyword(leadText, ["sell my", "selling my", "list my", "what is my home worth", "home worth", "value my home", "valuation", "comps"])) {
        return Promise.resolve(buildSellerTurn(parsed));
      }
      if (includesKeyword(leadText, ["price", "available", "details", "info", "information", "location", "address", "hoa", "sqft", "bed", "bath", "photos", "pictures", "neighborhood", "community", "send it", "homes like this"])) {
        return Promise.resolve(buildListingTurn(parsed, leadText));
      }

      return Promise.resolve(buildGenericTurn(parsed, leadText));
    },
  };
}

