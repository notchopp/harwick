import {
  AiReplyDraftSchema,
  HarwickAiRuntimeInputSchema,
  HarwickAiTurnSchema,
  type AiReplyDraft,
  type HarwickAiRuntimeInput,
  type HarwickAiToolCall,
  type HarwickAiTurn,
} from "@realty-ops/core";
import { z } from "zod";
import { buildHarwickToolCatalogPrompt, HARWICK_AI_TOOL_NAMES } from "./harwick-ai-tool-registry.js";

const OPENAI_API_BASE_URL = "https://api.openai.com/v1";

const OpenAIResponseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({
      content: z.string().optional(),
    }).passthrough(),
  }).passthrough()).optional(),
  output_text: z.string().trim().min(1).optional(),
  output: z.array(z.object({
    content: z.array(z.object({
      text: z.string().optional(),
    }).passthrough()).optional(),
  }).passthrough()).optional(),
}).passthrough();

export type HarwickAiRuntimeClient = {
  runTurn(input: HarwickAiRuntimeInput): Promise<HarwickAiTurn>;
};

export type OpenAIHarwickAiRuntimeOptions = {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
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

function extractResponseText(value: unknown): string {
  const parsed = OpenAIResponseSchema.parse(value);
  
  // Try standard OpenAI format first
  if (parsed.choices !== undefined && parsed.choices.length > 0) {
    const content = parsed.choices[0]?.message?.content;
    if (content !== undefined && typeof content === 'string' && content.trim().length > 0) {
      return content;
    }
  }
  
  if (parsed.output_text !== undefined) {
    return parsed.output_text;
  }

  // Handle extended output format (with type: "output_text")
  const text = parsed.output
    ?.flatMap((item) => {
      if (!Array.isArray(item.content)) return [];
      return item.content.map((content) => {
        // Handle new format: type: "output_text"
        if ((content as { type?: string; text?: string }).type === 'output_text' && typeof content.text === 'string') {
          return content.text;
        }
        // Handle legacy format: just text property
        return content.text;
      });
    })
    .find((candidate): candidate is string => candidate !== undefined && candidate.trim().length > 0);

  if (text === undefined) {
    throw new Error("OpenAI response did not include text output.");
  }

  return text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isToolName(value: unknown): value is HarwickAiToolCall["tool"] {
  return typeof value === "string"
    && (HARWICK_AI_TOOL_NAMES as readonly string[]).includes(value);
}

function defaultToolRequiresApproval(tool: HarwickAiToolCall["tool"]): boolean {
  return tool === "request_showing_approval"
    || tool === "register_open_house"
    || tool === "route_lead"
    || tool === "sync_follow_up_boss";
}

function parseToolPayload(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return isRecord(parsed) ? parsed : { value: parsed };
    } catch {
      return { raw: value };
    }
  }

  if (isRecord(value)) {
    return value;
  }

  if (value === undefined) {
    return {};
  }

  return { value };
}

function defaultToolReason(tool: HarwickAiToolCall["tool"]): string {
  return `Model requested ${tool.replace(/_/g, " ")}.`;
}

function normalizeToolCall(
  value: unknown,
  nextAction: unknown,
): Record<string, unknown> {
  if (!isRecord(value)) {
    if (isToolName(nextAction)) {
      return {
        tool: nextAction,
        reason: defaultToolReason(nextAction),
        requiresApproval: defaultToolRequiresApproval(nextAction),
        payload: {},
      };
    }
    return {};
  }

  const tool = isToolName(value["tool"])
    ? value["tool"]
    : isToolName(nextAction)
      ? nextAction
      : null;

  const payload = {
    ...parseToolPayload(value["payload"]),
    ...Object.fromEntries(
      Object.entries(value).filter(([key]) => !["tool", "reason", "requiresApproval", "payload"].includes(key)),
    ),
  };

  if (tool === null) {
    return {
      ...value,
      payload,
    };
  }

  const reason = typeof value["reason"] === "string" && value["reason"].trim().length > 0
    ? value["reason"].trim()
    : typeof payload["reason"] === "string" && payload["reason"].trim().length > 0
      ? payload["reason"].trim()
      : defaultToolReason(tool);

  const requiresApproval = typeof value["requiresApproval"] === "boolean"
    ? value["requiresApproval"]
    : defaultToolRequiresApproval(tool);

  return {
    tool,
    reason,
    requiresApproval,
    payload,
  };
}

function fallbackTurn(reply: string, reason: string): HarwickAiTurn {
  return HarwickAiTurnSchema.parse({
    intent: "general_follow_up",
    nextAction: "do_not_reply",
    missingFields: [],
    confidence: 0.6,
    safetyFlags: [],
    reply,
    statePatch: {},
    handoffBrief: null,
    toolCalls: [],
    selfGateAutoExecute: true,
    selfGateReason: reason,
    documentUpdate: "",
    endTurn: true,
  });
}

function parseHarwickAiTurn(value: string): HarwickAiTurn {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(value) as Record<string, unknown>;
  } catch {
    // Model returned non-JSON. Treat the raw text as a coworker reply.
    return fallbackTurn(value.trim().slice(0, 800) || "I'm here.", "Non-JSON model output; surfaced raw text.");
  }

  // Backfill safe defaults for fields the model is likely to omit in
  // operator/coworker mode. The schema treats these as required because
  // the lead-conversation path needs them, but for "yo" / "show me hot leads"
  // the model returns a near-empty JSON. Without defaults here, schema
  // validation rejects the entire turn and the rail shows "could not respond".
  if (data["intent"] === undefined || data["intent"] === null) data["intent"] = "general_follow_up";
  if (data["nextAction"] === undefined || data["nextAction"] === null) data["nextAction"] = "do_not_reply";
  if (!Array.isArray(data["missingFields"])) data["missingFields"] = [];
  if (typeof data["confidence"] !== "number") data["confidence"] = 0.7;
  if (!Array.isArray(data["safetyFlags"])) data["safetyFlags"] = [];
  if (typeof data["reply"] !== "string" || data["reply"].trim().length === 0) {
    data["reply"] = "I'm here. What do you want me to look at first?";
  }
  // Boolean fields with .default() in schema still error if model returned null.
  if (data["selfGateAutoExecute"] === null) data["selfGateAutoExecute"] = true;
  if (data["endTurn"] === null) data["endTurn"] = true;
  if (data["selfGateReason"] === null) data["selfGateReason"] = "policy narrative permits autonomous send.";
  if (data["documentUpdate"] === null) data["documentUpdate"] = "";
  if (data["handoffBrief"] === undefined) data["handoffBrief"] = null;

  // Normalize malformed tool calls before schema validation. The model
  // sometimes puts payload fields at the top level or omits tool metadata.
  const toolCalls = data["toolCalls"];
  if (toolCalls && Array.isArray(toolCalls)) {
    data["toolCalls"] = toolCalls.map((call) => normalizeToolCall(call, data["nextAction"]));
  }

  // Fix statePatch normalization
  const statePatch = data["statePatch"];
  if (statePatch && typeof statePatch === "object" && !Array.isArray(statePatch)) {
    const statePatchObj = statePatch as Record<string, unknown>;

    // 1. Fix invalid intent values (from HarwickAiTurnSchema.intent instead of LeadIntentSchema)
    const intentValue = statePatchObj["intent"];
    const validIntents: Set<unknown> = new Set(["high", "medium", "low", "spam", "unknown", null]);
    if (intentValue !== undefined && intentValue !== null && !validIntents.has(intentValue)) {
      const intentMapping: Record<string, string> = {
        "buyer_qualification": "medium",
        "seller_qualification": "medium",
        "showing_request": "high",
        "listing_question": "medium",
        "blueprint_request": "medium",
        "financing_question": "medium",
        "general_follow_up": "low",
        "handoff_needed": "high",
        "spam_or_unsafe": "spam",
      };
      let mappedIntent: string | null = null;
      if (typeof intentValue === "string" && Object.prototype.hasOwnProperty.call(intentMapping, intentValue)) {
        mappedIntent = intentMapping[intentValue] ?? null;
      }
      statePatchObj["intent"] = mappedIntent;
    }

    // 2. Convert empty strings to null for optional string fields
    for (const field of ["timeline", "targetArea", "propertyType", "currentIntent"]) {
      if (statePatchObj[field] === "") {
        statePatchObj[field] = null;
      }
    }

    // 3. Convert empty string to "unknown" for financingStatus enum
    if (statePatchObj["financingStatus"] === "") {
      statePatchObj["financingStatus"] = "unknown";
    }
  }

  // Last-resort guard: if the model returned a structurally unfixable turn,
  // surface a coworker-tone fallback instead of throwing a ZodError that
  // cascades into a 500 + unhandled rejection. The reply field is preserved
  // when present so the operator still sees what the model tried to say.
  const result = HarwickAiTurnSchema.safeParse(data);
  if (result.success) return result.data;
  const replyHint = typeof data["reply"] === "string" && data["reply"].trim().length > 0
    ? data["reply"].trim().slice(0, 800)
    : "I caught your question but couldn't format a clean answer. Try rephrasing or pick a specific lead.";
  return fallbackTurn(replyHint, "Schema validation failed; coworker fallback applied.");
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const HarwickAiTurnJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    intent: {
      type: "string",
      enum: [
        "listing_question",
        "showing_request",
        "buyer_qualification",
        "seller_qualification",
        "blueprint_request",
        "financing_question",
        "general_follow_up",
        "handoff_needed",
        "spam_or_unsafe",
      ],
    },
    nextAction: {
      type: "string",
      enum: [
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
      ],
    },
    missingFields: {
      type: "array",
      items: {
        type: "string",
        enum: [
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
        ],
      },
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    safetyFlags: {
      type: "array",
      items: {
        type: "string",
        enum: [
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
        ],
      },
    },
    reply: { type: "string", minLength: 1, maxLength: 800 },
    statePatch: {
      type: "object",
      properties: {
        currentIntent: { type: ["string", "null"] },
        leadType: { type: ["string", "null"], enum: ["buyer", "seller", "renter", "investor", "unknown", null] },
        intent: { type: ["string", "null"], enum: ["high", "medium", "low", "spam", "unknown", null] },
        timeline: { type: ["string", "null"] },
        budget: { type: ["string", "null"] },
        targetArea: { type: ["string", "null"] },
        propertyType: { type: ["string", "null"] },
        financingStatus: { type: ["string", "null"], enum: ["preapproved", "cash", "needs_lender", "unknown", null] },
        knownFacts: { type: "array", items: { type: "string" } },
      },
    },
    handoffBrief: { type: ["string", "null"], maxLength: 1000 },
    toolCalls: {
      type: "array",
      items: {
        type: "object",
        properties: {
          tool: {
            type: "string",
            enum: [
              ...HARWICK_AI_TOOL_NAMES,
            ],
          },
          reason: { type: "string" },
          requiresApproval: { type: "boolean" },
          payload: { type: "string", description: "JSON-encoded tool payload" },
        },
        required: ["tool", "payload"],
      },
    },
  },
  required: [
    "intent",
    "nextAction",
    "missingFields",
    "confidence",
    "safetyFlags",
    "reply",
    "statePatch",
    "handoffBrief",
    "toolCalls",
  ],
} as const;

export function createOpenAIHarwickAiRuntime(options: OpenAIHarwickAiRuntimeOptions): HarwickAiRuntimeClient {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async runTurn(input: HarwickAiRuntimeInput): Promise<HarwickAiTurn> {
      const parsed = HarwickAiRuntimeInputSchema.parse(input);
      const response = await fetchImpl(`${OPENAI_API_BASE_URL}/responses`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: options.model,
          instructions: [
            "You are Harwick AI, the always-on front desk and qualification runtime for a real estate workspace.",
            "AI-NATIVE OPERATING PRINCIPLE: You own the loop. The runtime is your tool layer. Read the lead document and policy narrative below, then decide which tools to call and what to write back to the document.",
            "",
            "AGENTIC LOOP: You can chain multiple tool calls across iterations.",
            "  • Set endTurn=false when you need a tool's result before deciding the next step (e.g., check_calendar then request_showing_approval).",
            "  • Set endTurn=true when this turn is complete and you are not waiting on any tool result.",
            "  • The runtime feeds tool results back into the conversation as a 'system' actor message; read those before your next iteration.",
            "  • The loop is bounded at 6 iterations; design your sequences accordingly.",
            "",
            "TOOL CATALOG (with permission semantics):",
            buildHarwickToolCatalogPrompt(),
            "",
            "CHAINING EXAMPLES:",
            "  • Showing request: [check_calendar with endTurn=false] → look at returned windows → [send_meta_message target='dm' proposing one window + request_showing_approval with the window] with endTurn=true.",
            "  • Qualified buyer: [send_meta_message target='dm' acknowledging + sync_follow_up_boss] with endTurn=true. The CRM sync will queue for approval; the loop exits.",
            "  • Hot handoff: [send_meta_message target='dm' with reassuring message + pause_automation] with endTurn=true if the policy narrative says to hand off legal/financing questions.",
            "  • Parallel helper: [dispatch_subagent with subagentType='research' and endTurn=false] → keep the lead moving while a durable specialist task is tracked.",
            ...(parsed.policyNarrative ? [
              "",
              "POLICY NARRATIVE (the broker's automation preferences in plain English — self-gate against this; ignore tools the narrative says require approval):",
              parsed.policyNarrative,
              "",
            ] : []),
            ...(parsed.leadDocument ? [
              "",
              "LEAD DOCUMENT (the running briefing on this lead; updated each turn):",
              parsed.leadDocument,
              "",
            ] : []),
            ...(parsed.workspaceMemory ? [
              "",
              "WORKSPACE MEMORY (brokerage-wide patterns learned across leads; use as soft context, not as a hard rule):",
              parsed.workspaceMemory,
              "",
            ] : []),
            ...(parsed.retrievedExamples ? [
              "",
              "PAST SIMILAR SITUATIONS THAT WORKED WELL (use these as inspiration; do not copy verbatim and do not assume the lead is the same):",
              parsed.retrievedExamples,
              "",
            ] : []),
            ...(parsed.operatorContext ? [
              "",
              "OPERATOR MODE (internal Harwick UI request) — THIS MODE OVERRIDES RULES 1-4 BELOW.",
              "When OPERATOR MODE is set you are a chief of staff for the workspace, not a lead-conversation filter. Do NOT apply the off-topic gate. NEVER reply with 'Not related to real estate' in OPERATOR MODE. The operator is a teammate; help, redirect, or ask a clarifying question — never refuse.",
              `You are responding to ${parsed.operatorContext.operatorName}, an internal operator inside the Harwick product. Talk like a coworker who knows the workspace: direct, warm, low-ceremony. No greetings unless they greeted you. No 'How can I assist you today?'.`,
              `Request mode: ${parsed.operatorContext.requestMode}. Scope: ${parsed.operatorContext.requestScope}.`,
              "Answer the operator, not the lead.",
              "The inbound text is an internal brokerage request unless it explicitly quotes or references a lead message.",
              "Treat operator greetings and short check-ins like 'yo', 'hey', 'morning', or 'what needs me?' as valid workspace commands, not as off-topic chatter.",
              "Never use the off-topic fallback for an operator request unless it is clearly unrelated to brokerage operations even after considering the supplied workspace context.",
              "INFO-DUMP IS BANNED. Never enumerate raw lead usernames, full lists, or paste back the context block. The UI will render lists as cards — your job is to synthesize, not transcribe. If the operator asks 'show me X', reply in 1-2 sentences explaining what you're surfacing and call dispatch_subagent for fresh data; don't paraphrase the recentLeads block.",
              "When recent leads, routing, or team context is present, synthesize the top priorities instead of echoing every raw line back. Keep it to the few items that matter most right now.",
              "State the recommended next move for each surfaced item. Mention assignment only when it changes the action, and never produce phrases like 'assigned unassigned'.",
              "If a requested routing or reassignment still needs approval, describe it as proposed or queued review — never as already completed.",
              "TOOLS YOU SHOULD USE IN OPERATOR MODE: dispatch_subagent (for any 'show me / find me / look up' request — pick subagentType='research' for lead lookups, 'routing' for assignment questions, 'calendar' for time questions, 'writer' for drafting). Call it with endTurn=true and a tight title. Don't paraphrase the workspace context — fetch.",
              "You may use dispatch_subagent for durable follow-through even when no concrete lead thread is active.",
              "Do not call outbound messaging or calendar-confirmation tools unless the supplied context clearly points to a concrete lead/thread and the available data is enough to ground the action.",
              "Resolve operator pronouns from context: 'me' = the operator named above. 'my leads' = leads where assignedMemberId matches them. 'the team' = the team list. Don't ask the operator to clarify these.",
              ...(parsed.operatorContext.activeLeadSummary ? [
                `Active lead summary: ${parsed.operatorContext.activeLeadSummary}`,
              ] : []),
              ...(parsed.operatorContext.recentLeads.length > 0 ? [
                "Recent leads:",
                ...parsed.operatorContext.recentLeads.map((line) => `  • ${line}`),
              ] : []),
              ...(parsed.operatorContext.routing.length > 0 ? [
                "Routing desk:",
                ...parsed.operatorContext.routing.map((line) => `  • ${line}`),
              ] : []),
              ...(parsed.operatorContext.team.length > 0 ? [
                "Team context:",
                ...parsed.operatorContext.team.map((line) => `  • ${line}`),
              ] : []),
              "",
            ] : []),
            "Your CORE PURPOSE: Process real estate inquiries only. Recognize off-topic messages BEFORE generating a reply.",
            "",
            "RULE 1: INTENT CLASSIFICATION (CRITICAL)",
            "Before responding, classify each message. Valid categories are:",
            "  • Real estate inquiry (property, showing, pricing, buying/selling, agents, brokers, listings, neighborhoods, mortgages)",
            "  • Greeting/identity question (hi, who are you, are you a bot)",
            "  • Off-topic (gaming, sports, personal tasks, chitchat, memes, spam, harassment, non-real-estate services)",
            "If OPERATOR MODE is present, treat the inbound text as an internal brokerage operations request instead of applying the lead/off-topic filter. Stay within the provided workspace context and keep the reply operator-facing. Short greetings and quick status checks are valid operator requests.",
            "If CLEARLY off-topic (e.g., 'want to play valorant', 'getting a haircut', 'buy pizza'), set nextAction to 'do_not_reply' and confidence to 0.0. Reply field must be a simple one-line message.",
            "",
            "RULE 2: TOOL USAGE (CONDITIONAL LOGIC)",
            "Only generate tool calls when responding to real estate inquiries or OPERATOR MODE requests grounded in the provided workspace context. For off-topic messages:",
            "  • nextAction = 'do_not_reply'",
            "  • toolCalls = [] (empty array)",
            "  • reply = 'Not related to real estate'",
            "  • safetyFlags = ['low_confidence']",
            "  • missingFields = [] (empty array)",
            "  • intent = 'spam_or_unsafe'",
            "",
            "RULE 3: CONTEXT USAGE",
            "Use ONLY supplied workspace, conversation, listing, post, calendar, tone, and state context.",
            "Never invent: price drops, availability, sold status, incentives, financing approval, legal certainty, tax certainty, contract certainty.",
            "Keep each conversation isolated. Never mix facts from another lead or workspace.",
            "",
            "RULE 4: REAL ESTATE RESPONSE HANDLING",
            "Ask at most one useful missing qualification question per turn unless the lead is asking for a handoff.",
            "For public comments: keep replies short and public-safe. Actual outbound sends from a comment must stay on the original comment thread with send_meta_message target='comment'. If deeper qualification is needed, use move_comment_to_dm as the semantic action and emit two send_meta_message tool calls: target='comment' for the short public acknowledgement, then target='dm' for the private continuation.",
            "For DMs: continue naturally in workspace/agent tone, update qualification state, decide whether to reply, ask, offer showing, route, sync, or pause.",
            "For OPERATOR MODE: missingFields may be empty, reply should brief the operator directly, and general_follow_up is the default intent when no lead-specific intent fits.",
            "If calendar context supplied: use only per showing mode (collect_only=no times, request_approve=propose w/approval, auto_book=offer only when qualified).",
            "If automation mode is human_takeover: do not send lead reply; pause automation.",
            "",
            "RULE 5: OUTPUT FORMAT & SCHEMA COMPLIANCE",
            "Return ONLY valid JSON with NO markdown, comments, or extra text.",
            "Required fields for ALL responses:",
            "  • intent: choose from [listing_question, showing_request, buyer_qualification, seller_qualification, blueprint_request, financing_question, general_follow_up, handoff_needed, spam_or_unsafe]",
            "  • nextAction: choose from [send_reply, ask_qualification, move_comment_to_dm, send_buyer_blueprint, offer_showing, request_showing_approval, register_open_house, route_lead, handoff_to_agent, pause_for_owner, dispatch_subagent, do_not_reply]",
            "  • missingFields: array of any of [name, phone, email, intent, timeline, budget, area, property_type, financing, buyer_or_seller]",
            "  • confidence: number between 0.0 and 1.0",
            "  • safetyFlags: array of any of [safe_to_send, needs_human_review, human_takeover, legal_advice, lending_advice, contract_advice, valuation_claim, claims_listing_availability, claims_financing_certainty, low_confidence]",
            "  • reply: non-empty string (1-800 chars). For off-topic: use 'Not related to real estate' or similar",
            "  • statePatch: object with fields currentIntent (string), leadType (buyer/seller/renter/investor/unknown), intent (qualification strength: high/medium/low/spam/unknown), timeline (string), budget (string), targetArea (string), propertyType (string), financingStatus (string), knownFacts (array). DO NOT put the turn intent values in statePatch.intent. Use null (not empty string) for any optional field with no value.",
            "  • handoffBrief: null or a string explaining why handoff is needed",
            "  • toolCalls: array of tool call objects (can be empty)",
            "Every toolCalls item must be shaped exactly as { tool, reason, requiresApproval, payload }. Never place payload fields like assignedMemberId, title, or listing at the top level of the tool call object.",
            "Off-topic messages: set confidence to 0.0-0.2, intent='spam_or_unsafe', nextAction='do_not_reply', toolCalls=[], safetyFlags=['low_confidence'].",
            "",
            "RULE 6: SELF-GATE AND DOCUMENT UPDATE (AI-NATIVE)",
            "  • selfGateAutoExecute (boolean): your own decision about whether the policy narrative permits this turn to auto-execute without operator approval. Default true if narrative does not block this case. False if narrative says approval is needed for this action/tool/safety-flag.",
            "  • selfGateReason (string): one short sentence explaining the gate decision, referencing the narrative.",
            "  • documentUpdate (string, may be empty): a 1-3 sentence prose update to append to the lead document. Cover what changed this turn — qualification revealed, intent shift, follow-up needed, listing referenced. Empty string if nothing meaningful changed.",
            "  • endTurn (boolean): true if this turn is complete; false only if you intend to chain another tool call after a tool result returns (agentic loop).",
          ].join("\n"),
          input: JSON.stringify(parsed),
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        const errorMsg = `OpenAI Harwick AI turn failed (${response.status}): ${text}`;
        throw new Error(errorMsg);
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const json = await response.json();
      const responseText = extractResponseText(json).trim();
      return parseHarwickAiTurn(responseText);
    },
  };
}
