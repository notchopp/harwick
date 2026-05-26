import { createOpenAI } from "@ai-sdk/openai";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";

import type { ListingMemory, PublicListingChatQualification } from "@realty-ops/core";

/**
 * Public-listing chat generator built on `generateText` + tools — the same
 * pattern operator-side harwick-chat uses (which works reliably). The
 * earlier path was the typed `HarwickAiRuntimeClient.runTurn` which
 * compiles the HarwickAi schema into OpenAI's strict structured-output
 * `response_format: json_schema` and hits two recurring rejection modes:
 *
 *   1. "'allOf' is not permitted" — any Zod `.pipe(...)` / `.transform(...)`
 *      / `.union(incompatible)` field on the OUTPUT schema compiles to
 *      `allOf` in the emitted JSON schema, which OpenAI explicitly
 *      rejects.
 *   2. "'required' is required to be supplied and to be an array
 *      including every key in properties" — strict mode requires every
 *      property in `required[]`. Zod `.default(...)` makes the field
 *      optional in the JSON-schema emit, which OpenAI rejects.
 *
 * Stripping defaults to fix the second error broke 21 unrelated tests
 * because the typed runtime is consumed in many other call sites. So
 * we side-step the whole strict-mode contract and use free-form text
 * generation with TOOL CALLS for the structured side-effects (capture
 * the lead, queue the showing). The reply text streams back as the
 * model's natural-language response; the tools enforce shape on the
 * side-effect path.
 */

type ListingFacts = {
  id: string;
  workspaceId: string;
  address: string;
  mlsNumber: string | null;
  status: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  rawFacts: Record<string, unknown>;
};

export type ListingChatCaptureInput = {
  phone: string;
  email: string | null;
  fullName: string | null;
  intent: "question" | "showing";
  leadType: PublicListingChatQualification["leadType"];
  intentTier: PublicListingChatQualification["intent"];
  timeline: string | null;
  budget: string | null;
  targetArea: string | null;
  propertyType: string | null;
  financingStatus: NonNullable<PublicListingChatQualification["financingStatus"]>;
  conversationSummary: string;
};

export type ListingChatCaptureResult = {
  leadId: string;
  status: "created" | "updated";
  intent: "question" | "showing";
  showingTaskId: string | null;
};

export type GenerateListingChatReplyResult = {
  reply: string;
  capturedLead: ListingChatCaptureResult | null;
  qualificationPatch: Partial<PublicListingChatQualification>;
};

function readString(rawFacts: Record<string, unknown>, key: string): string | null {
  const value = rawFacts[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readStringArray(rawFacts: Record<string, unknown>, key: string): string[] {
  const value = rawFacts[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function formatMoney(value: number | null): string | null {
  if (value === null) return null;
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function buildSystemPrompt(params: {
  workspaceName: string;
  listing: ListingFacts;
  memory: readonly ListingMemory[];
  priorQualification: PublicListingChatQualification;
}): string {
  const { listing } = params;
  const neighborhood = readString(listing.rawFacts, "neighborhood");
  const city = readString(listing.rawFacts, "city");
  const propertyType = readString(listing.rawFacts, "propertyType");
  const squareFeet = typeof listing.rawFacts["squareFeet"] === "number"
    ? `${Math.round(listing.rawFacts["squareFeet"] as number).toLocaleString()} sqft`
    : null;
  const incentives = readStringArray(listing.rawFacts, "incentives");
  const amenities = readStringArray(listing.rawFacts, "amenities");

  // Operator-authored memory becomes part of the prompt verbatim. Public
  // rows are shown as facts the buyer can see; internal rows are tagged
  // so the model knows they're operator-only context (negotiation room,
  // seller motivation, etc.).
  const publicMemory = params.memory.filter((row) => row.visibility === "public");
  const internalMemory = params.memory.filter((row) => row.visibility === "internal");

  const factsBlock = [
    `Address: ${listing.address}`,
    listing.mlsNumber === null ? null : `MLS: ${listing.mlsNumber}`,
    listing.status === null ? null : `Status: ${listing.status}`,
    formatMoney(listing.price) === null ? null : `List price: ${formatMoney(listing.price)}`,
    listing.beds === null ? null : `Beds: ${listing.beds}`,
    listing.baths === null ? null : `Baths: ${listing.baths}`,
    squareFeet,
    propertyType === null ? null : `Property type: ${propertyType}`,
    neighborhood === null ? null : `Neighborhood: ${neighborhood}`,
    city === null ? null : `City: ${city}`,
    incentives.length === 0 ? null : `Incentives: ${incentives.join("; ")}`,
    amenities.length === 0 ? null : `Amenities: ${amenities.slice(0, 8).join("; ")}`,
  ].filter((line): line is string => line !== null).join("\n");

  const qualBlock = [
    params.priorQualification.name === null || params.priorQualification.name === undefined ? null : `Name: ${params.priorQualification.name}`,
    params.priorQualification.phone === null || params.priorQualification.phone === undefined ? null : `Phone: ${params.priorQualification.phone}`,
    params.priorQualification.email === null || params.priorQualification.email === undefined ? null : `Email: ${params.priorQualification.email}`,
    params.priorQualification.timeline === null || params.priorQualification.timeline === undefined ? null : `Timeline: ${params.priorQualification.timeline}`,
    params.priorQualification.budget === null || params.priorQualification.budget === undefined ? null : `Budget: ${params.priorQualification.budget}`,
    params.priorQualification.targetArea === null || params.priorQualification.targetArea === undefined ? null : `Target area: ${params.priorQualification.targetArea}`,
    params.priorQualification.financingStatus === undefined || params.priorQualification.financingStatus === "unknown" ? null : `Financing: ${params.priorQualification.financingStatus}`,
  ].filter((line): line is string => line !== null);

  return [
    `You are Harwick — the on-call AI agent for "${params.workspaceName}". You're answering a public buyer who's on the listing page for ${listing.address}.`,
    "",
    "HOW YOU TALK",
    "- Like a sharp agent who knows this listing. Not a chatbot. Not a form.",
    "- Short, specific, warm. Usually 1-3 sentences. Longer only if they asked a detail-heavy question.",
    "- No greetings unless they greeted you. No 'How can I help?' or 'Sure, let me check.'.",
    "- Answer from the verified facts below. Never invent prices, availability, school ratings, financing certainty, or contract advice.",
    "- If you don't know something, say so and offer to have the agent confirm.",
    "",
    "YOUR JOB",
    "- Answer the buyer's questions about this listing from facts.",
    "- Naturally qualify them as the conversation moves — without it feeling like a form.",
    "- When intent is clear AND they share phone (and ideally name), call `capture_lead` to route this to the agent. After that, confirm warmly and tell them the agent will reach out.",
    "- Showing request = `intent: 'showing'`. Anything else = `intent: 'question'`.",
    "- Quietly extract qualification fields you hear (timeline, budget, area, financing status).",
    "",
    "LISTING FACTS (verified — answer from these only)",
    factsBlock,
    publicMemory.length === 0 ? "" : ["", "WHAT BUYERS USUALLY ASK ABOUT THIS LISTING", ...publicMemory.map((row) => `- ${row.prompt ?? "(no prompt)"} — ${row.content}`)].join("\n"),
    internalMemory.length === 0 ? "" : ["", "INTERNAL CONTEXT (don't repeat verbatim, but you may use to shape your answer)", ...internalMemory.map((row) => `- ${row.content}`)].join("\n"),
    qualBlock.length === 0 ? "" : ["", "WHAT WE'VE LEARNED SO FAR", ...qualBlock].join("\n"),
    "",
    "WHEN TO CAPTURE THE LEAD",
    "- You have a phone number AND a clear intent (showing OR a question that needs the agent).",
    "- Don't push for phone in turn 1; let the conversation earn it. By turn 3 if you don't have it, ask once: 'what's the best number for the agent to reach you?'",
    "- After `capture_lead`, your reply should confirm and tell them the agent will follow up — usually 1 sentence.",
  ].join("\n");
}

function summarizeConversation(conversation: ReadonlyArray<{ actor: string; body: string }>): string {
  return conversation
    .slice(-8)
    .map((turn) => `${turn.actor === "visitor" || turn.actor === "lead" ? "BUYER" : "HARWICK"}: ${turn.body}`)
    .join("\n");
}

export async function generateListingChatReply(params: {
  workspaceName: string;
  listing: ListingFacts;
  memory: readonly ListingMemory[];
  conversation: ReadonlyArray<{ actor: string; body: string }>;
  message: string;
  priorQualification: PublicListingChatQualification;
  openaiApiKey: string;
  model: string;
  onCaptureLead: (input: ListingChatCaptureInput) => Promise<ListingChatCaptureResult>;
}): Promise<GenerateListingChatReplyResult> {
  let capturedLead: ListingChatCaptureResult | null = null;
  let qualificationPatch: Partial<PublicListingChatQualification> = {};

  const openai = createOpenAI({ apiKey: params.openaiApiKey });
  const systemPrompt = buildSystemPrompt({
    workspaceName: params.workspaceName,
    listing: params.listing,
    memory: params.memory,
    priorQualification: params.priorQualification,
  });

  const tools = {
    capture_lead: tool({
      description: "Call when the buyer has shared a phone number AND a clear intent (a specific showing request, or a question that needs the agent to follow up). Promotes this anonymous chat session to a real lead and queues the right operator action.",
      inputSchema: z.object({
        phone: z.string().min(7).describe("Buyer's phone number"),
        email: z.string().email().nullable().describe("Email if shared, otherwise null"),
        fullName: z.string().nullable().describe("Name if shared, otherwise null"),
        intent: z.enum(["question", "showing"]).describe("'showing' if they asked to see the place; 'question' otherwise"),
        leadType: z.enum(["buyer", "seller", "renter", "investor", "unknown"]).describe("Best guess from conversation; 'buyer' if unsure for a listing chat"),
        intentTier: z.enum(["high", "medium", "low"]).describe("'high' for showing requests or clear interest; 'medium' for engaged questions; 'low' otherwise"),
        timeline: z.string().nullable().describe("e.g. 'this weekend', 'next month', or null"),
        budget: z.string().nullable().describe("Budget as they said it, e.g. '$300k', or null"),
        targetArea: z.string().nullable().describe("Area / neighborhood they mentioned, or null"),
        financingStatus: z.enum(["preapproved", "cash", "needs_lender", "unknown"]).describe("Best guess from conversation"),
        conversationSummary: z.string().describe("One-sentence summary of what the buyer wants — written for the agent to read in 5 seconds"),
      }),
      execute: async (input) => {
        const result = await params.onCaptureLead({
          phone: input.phone,
          email: input.email,
          fullName: input.fullName,
          intent: input.intent,
          leadType: input.leadType,
          intentTier: input.intentTier,
          timeline: input.timeline,
          budget: input.budget,
          targetArea: input.targetArea,
          propertyType: null,
          financingStatus: input.financingStatus,
          conversationSummary: input.conversationSummary,
        });
        capturedLead = result;
        qualificationPatch = {
          phone: input.phone,
          email: input.email ?? undefined,
          name: input.fullName ?? undefined,
          leadType: input.leadType,
          intent: input.intentTier,
          timeline: input.timeline ?? undefined,
          budget: input.budget ?? undefined,
          targetArea: input.targetArea ?? undefined,
          financingStatus: input.financingStatus,
        };
        return {
          status: result.status,
          leadId: result.leadId,
          showingTaskId: result.showingTaskId,
        };
      },
    }),
  };

  // Conversation context goes into a single user message so the system
  // prompt + this user message cover everything the model needs. We don't
  // use the messages array's full back-and-forth shape because the prior
  // turns are already summarized in the system prompt's "WHAT WE'VE
  // LEARNED SO FAR" block + the conversation summary below.
  const conversationContext = summarizeConversation(params.conversation);
  const userMessage = conversationContext.length === 0
    ? params.message
    : `Conversation so far:\n${conversationContext}\n\nBuyer's latest message: ${params.message}`;

  const result = await generateText({
    model: openai(params.model),
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
    tools,
    // Bounded chain — call capture_lead at most once, then close out with
    // a final natural-language reply. 3 steps lets the model: think →
    // optionally call tool → emit final reply.
    stopWhen: stepCountIs(3),
  });

  return {
    reply: result.text.trim().length > 0
      ? result.text.trim()
      : capturedLead === null
        ? "Got it — what would you like to know about this place?"
        : "All set — the agent will reach out shortly with next steps.",
    capturedLead,
    qualificationPatch,
  };
}
