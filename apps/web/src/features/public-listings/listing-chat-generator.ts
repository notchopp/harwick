import { createOpenAI } from "@ai-sdk/openai";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";

import type { ListingMemory, PublicListingChatQualification } from "@realty-ops/core";

/**
 * Public-listing chat generator built on `generateText` + tools — the same
 * pattern operator-side harwick-chat uses (which works reliably).
 *
 * Why we're NOT using HarwickAiRuntimeClient.runTurn here: that path
 * compiles HarwickAiTurnSchema into OpenAI's strict structured-output
 * `response_format: json_schema` and hits two recurring rejection modes
 * (`allOf not permitted`, `required must include every key in properties`)
 * that can't both be fixed without breaking 21 unrelated tests.
 * generateText + tools bypasses strict structured-output entirely.
 *
 * Tool surface (every one of these is the model's "harness" — without
 * them it's just a chatbot):
 *
 *   - `note_qualification` — model calls this on EVERY meaningful turn,
 *     even if the visitor hasn't shared phone yet. Updates session
 *     qualification incrementally. This is why nothing about a visitor
 *     is ever lost.
 *   - `capture_lead` — promotes session to a real lead in the workspace.
 *     Model calls this when phone + clear intent. Idempotent.
 *   - `search_workspace_listings` — surfaces other active listings when
 *     the current one isn't a fit (sold, wrong price, wrong area). Filters
 *     by price range / beds / area / property type. THIS is what stops
 *     Harwick from being a single-listing dead-end.
 *   - `get_listing_location` — precise location parse for the current
 *     listing. Returns city, state, zip when available so Harwick can
 *     answer "what state?" or "what school district?" without hallucinating.
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

/**
 * Parses location signals out of the listing's full address + rawFacts.
 * Address shape is typically "Street, City, ST ZIP" or "Project Name,
 * City, ST". We extract whatever we can find — never invent. Caller can
 * use null fields to know what's actually unknown.
 */
function parseListingLocation(listing: ListingFacts): {
  fullAddress: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  neighborhood: string | null;
  schoolDistrict: string | null;
} {
  const fullAddress = listing.address;
  const stateZip = fullAddress.match(/\b([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\b/);
  const stateOnly = stateZip ?? fullAddress.match(/,\s*([A-Z]{2})(?:\s|,|$)/);
  // City is whatever comes between the last comma before state and the state
  // marker. Conservative fallback: rawFacts.city if address parsing flunks.
  let city: string | null = readString(listing.rawFacts, "city");
  if (city === null) {
    const parts = fullAddress.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
    // Typical shape: ["Street", "City", "ST 12345"]. City is the second-to-last
    // segment when state+zip is the last segment.
    if (parts.length >= 2) {
      const lastIsStateLike = parts[parts.length - 1] !== undefined && /^[A-Z]{2}(\s+\d{5})?$/.test(parts[parts.length - 1] as string);
      city = lastIsStateLike ? parts[parts.length - 2] ?? null : parts[parts.length - 1] ?? null;
    }
  }
  return {
    fullAddress,
    city,
    state: stateOnly?.[1] ?? null,
    zip: stateZip?.[2] ?? null,
    neighborhood: readString(listing.rawFacts, "neighborhood"),
    schoolDistrict: readString(listing.rawFacts, "schoolDistrict") ?? readString(listing.rawFacts, "school_district"),
  };
}

function buildSystemPrompt(params: {
  workspaceName: string;
  listing: ListingFacts;
  memory: readonly ListingMemory[];
  priorQualification: PublicListingChatQualification;
}): string {
  const { listing } = params;
  const location = parseListingLocation(listing);
  const propertyType = readString(listing.rawFacts, "propertyType");
  const squareFeet = typeof listing.rawFacts["squareFeet"] === "number"
    ? `${Math.round(listing.rawFacts["squareFeet"] as number).toLocaleString()} sqft`
    : null;
  const incentives = readStringArray(listing.rawFacts, "incentives");
  const amenities = readStringArray(listing.rawFacts, "amenities");

  const publicMemory = params.memory.filter((row) => row.visibility === "public");
  const internalMemory = params.memory.filter((row) => row.visibility === "internal");

  const factsBlock = [
    `Address: ${location.fullAddress}`,
    location.city === null ? null : `City: ${location.city}`,
    location.state === null ? null : `State: ${location.state}`,
    location.zip === null ? null : `Zip: ${location.zip}`,
    location.neighborhood === null ? null : `Neighborhood: ${location.neighborhood}`,
    location.schoolDistrict === null ? null : `School district: ${location.schoolDistrict}`,
    listing.mlsNumber === null ? null : `MLS: ${listing.mlsNumber}`,
    listing.status === null ? null : `Status: ${listing.status}`,
    formatMoney(listing.price) === null ? null : `List price: ${formatMoney(listing.price)}`,
    listing.beds === null ? null : `Beds: ${listing.beds}`,
    listing.baths === null ? null : `Baths: ${listing.baths}`,
    squareFeet,
    propertyType === null ? null : `Property type: ${propertyType}`,
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
    params.priorQualification.leadType === undefined || params.priorQualification.leadType === "unknown" ? null : `Lead type: ${params.priorQualification.leadType}`,
  ].filter((line): line is string => line !== null);

  const statusIsSold = (listing.status ?? "").toLowerCase().includes("sold")
    || (listing.status ?? "").toLowerCase().includes("pending")
    || (listing.status ?? "").toLowerCase().includes("contract");

  return [
    `You are Harwick — the on-call AI agent for "${params.workspaceName}". You're an extension of the agent, not a chatbot. Talk like the agent would: warm, decisive, specific, never scripted.`,
    "",
    "VOICE — sound like the agent, not a tour guide",
    "- Like a sharp agent who knows this listing AND the rest of the inventory. Not a chatbot. Not a form. Not a script.",
    "- 1-3 sentences usually. Longer only when a detail-heavy question genuinely needs it.",
    "- No \"How can I help?\", no \"Sure, let me check.\", no \"Great question!\". Just answer like a person who's been doing this for years.",
    "- Use specifics. \"Yeah, schools are Katy ISD — Cinco Ranch HS\" not \"This home is zoned to a great school district.\"",
    "- When you don't know something, say it short. \"Not sure on that, let me have the agent confirm\" beats inventing.",
    "- Mirror the buyer's energy. Casual gets casual. Formal gets concise + warm. Never ceremony for ceremony's sake.",
    "",
    "YOUR HARNESS — you have real tools, use them",
    "Every meaningful message is a chance to: (a) answer well, (b) capture qualification, (c) move them toward a showing OR a better-fit listing. Use the tools to do all three:",
    "",
    `- \`note_qualification\` — call this AT LEAST ONCE on almost every turn. Even if you only learned \"they're interested in 3-bed\", note it. This is how Harwick remembers a visitor as they talk. Don't gate this behind phone-sharing.`,
    `- \`capture_lead\` — call this the moment you have a phone number AND a clear intent (showing OR meaningful question that needs the agent). Promotes the session to a real lead. After calling, your reply confirms warmly and tells them the agent will reach out. Don't ask for phone in turn 1 — let it come up naturally; by turn 3 if you don't have it, ask once: \"what's the best number for the agent to reach you?\"`,
    `- \`search_workspace_listings\` — if THIS listing isn't a fit (status sold/pending/contract, price wrong, area wrong, sizing wrong) IMMEDIATELY surface alternatives. Don't dead-end the buyer. Filter by what you know (price range from budget, beds from family size, area from target).`,
    `- \`get_listing_location\` — call when the buyer asks anything location-specific (state, zip, school district, commute area) and you want a clean structured answer. The location is already partially parsed in the facts below, but use this tool to be sure.`,
    "",
    "ALWAYS-CAPTURE RULE",
    "- The first message a buyer sends ALWAYS contains something useful. Even \"is this still available\" tells you they're interested-enough-to-ask. ALWAYS call note_qualification at least once early in the conversation, even with thin signal, to make sure the visitor leaves a trail.",
    "- When in doubt about leadType, set buyer. When in doubt about intentTier, set medium for first turn, high after any showing/specific-listing question.",
    "",
    "WHEN THE LISTING ISN'T THE FIT",
    statusIsSold
      ? "- THIS LISTING IS NOT AVAILABLE (status indicates sold/pending/contract). Your first move should be search_workspace_listings to find what they CAN see, not to apologize. Lead with the alternative."
      : "- If the buyer is clearly off-fit (budget way under list, wrong area, wants different bedroom count), surface alternatives via search_workspace_listings BEFORE losing them.",
    "",
    "LISTING FACTS (verified — answer from these only)",
    factsBlock,
    publicMemory.length === 0 ? "" : ["", "WHAT BUYERS USUALLY ASK ABOUT THIS LISTING", ...publicMemory.map((row) => `- ${row.prompt ?? "(no prompt)"} — ${row.content}`)].join("\n"),
    internalMemory.length === 0 ? "" : ["", "INTERNAL CONTEXT (don't repeat verbatim, but use to shape your answer)", ...internalMemory.map((row) => `- ${row.content}`)].join("\n"),
    qualBlock.length === 0 ? "" : ["", "WHAT WE'VE LEARNED ABOUT THIS VISITOR SO FAR", ...qualBlock].join("\n"),
    "",
    "HARD GUARDRAILS",
    "- Never invent prices, availability, school ratings, financing certainty, legal advice, or contract advice.",
    "- Never promise a specific showing time — that needs agent approval. You can offer windows (\"Saturdays usually work for this team\") but always frame as something the agent confirms.",
    "- Never claim a feature/amenity that isn't in the verified facts.",
  ].join("\n");
}

function summarizeConversation(conversation: ReadonlyArray<{ actor: string; body: string }>): string {
  return conversation
    .slice(-10)
    .map((turn) => `${turn.actor === "visitor" || turn.actor === "lead" ? "BUYER" : "HARWICK"}: ${turn.body}`)
    .join("\n");
}

export type FindOtherListings = (params: {
  excludeListingId: string;
  criteria: {
    minPrice?: number | null;
    maxPrice?: number | null;
    minBeds?: number | null;
    areaContains?: string | null;
    propertyType?: string | null;
  };
  limit: number;
}) => Promise<ReadonlyArray<{
  id: string;
  address: string;
  status: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  rawFacts: Record<string, unknown>;
}>>;

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
  // Surfaces other workspace listings the model can recommend. Required —
  // without this Harwick dead-ends on a single listing.
  findOtherListings: FindOtherListings;
}): Promise<GenerateListingChatReplyResult> {
  let capturedLead: ListingChatCaptureResult | null = null;
  const accumulatedPatch: Partial<PublicListingChatQualification> = {};

  const openai = createOpenAI({ apiKey: params.openaiApiKey });
  const systemPrompt = buildSystemPrompt({
    workspaceName: params.workspaceName,
    listing: params.listing,
    memory: params.memory,
    priorQualification: params.priorQualification,
  });

  const tools = {
    note_qualification: tool({
      description: "Record qualification facts learned from the conversation. Call this on EVERY meaningful turn, even before phone is shared. Updates the session so future turns know what's been said. Pass only the fields you actually learned this turn; null/omit the rest.",
      inputSchema: z.object({
        leadType: z.enum(["buyer", "seller", "renter", "investor", "unknown"]).nullable().describe("Buyer/seller/renter/investor if it became clear this turn, else null"),
        intentTier: z.enum(["high", "medium", "low"]).nullable().describe("How serious do they read? Showing requests / specific listings = high; engaged questions = medium; casual = low"),
        timeline: z.string().nullable().describe("Time horizon they mentioned, e.g. 'this weekend', 'next 60 days', or null"),
        budget: z.string().nullable().describe("Budget as they said it, e.g. '$300k', '350-400k', or null"),
        targetArea: z.string().nullable().describe("Area / neighborhood / city / commute target they mentioned, or null"),
        propertyType: z.string().nullable().describe("Property type they mentioned (single family, townhome, condo, etc.), or null"),
        financingStatus: z.enum(["preapproved", "cash", "needs_lender", "unknown"]).nullable().describe("Financing posture if you learned it, else null"),
        learned: z.string().describe("One short sentence of what you learned this turn, for operator visibility"),
      }),
      execute: async (input) => {
        if (input.leadType !== null) accumulatedPatch.leadType = input.leadType;
        if (input.intentTier !== null) accumulatedPatch.intent = input.intentTier;
        if (input.timeline !== null) accumulatedPatch.timeline = input.timeline;
        if (input.budget !== null) accumulatedPatch.budget = input.budget;
        if (input.targetArea !== null) accumulatedPatch.targetArea = input.targetArea;
        if (input.propertyType !== null) accumulatedPatch.propertyType = input.propertyType;
        if (input.financingStatus !== null) accumulatedPatch.financingStatus = input.financingStatus;
        return { recorded: true, learned: input.learned };
      },
    }),

    capture_lead: tool({
      description: "Call when the buyer has shared a phone number AND a clear intent (showing OR a question that needs the agent to follow up). Promotes this anonymous chat session to a real lead and queues the right operator action. Don't call this just because you have a phone — wait for clear intent. Don't call twice in the same session.",
      inputSchema: z.object({
        phone: z.string().min(7).describe("Buyer's phone number"),
        email: z.string().email().nullable().describe("Email if shared, otherwise null"),
        fullName: z.string().nullable().describe("Name if shared, otherwise null"),
        intent: z.enum(["question", "showing"]).describe("'showing' if they asked to see the place; 'question' otherwise"),
        leadType: z.enum(["buyer", "seller", "renter", "investor", "unknown"]).describe("Best guess; 'buyer' if unsure for a listing chat"),
        intentTier: z.enum(["high", "medium", "low"]).describe("'high' for showing requests; 'medium' for engaged questions"),
        timeline: z.string().nullable(),
        budget: z.string().nullable(),
        targetArea: z.string().nullable(),
        financingStatus: z.enum(["preapproved", "cash", "needs_lender", "unknown"]),
        conversationSummary: z.string().describe("One-sentence summary written for the agent to read in 5 seconds"),
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
        accumulatedPatch.phone = input.phone;
        if (input.email !== null) accumulatedPatch.email = input.email;
        if (input.fullName !== null) accumulatedPatch.name = input.fullName;
        accumulatedPatch.leadType = input.leadType;
        accumulatedPatch.intent = input.intentTier;
        if (input.timeline !== null) accumulatedPatch.timeline = input.timeline;
        if (input.budget !== null) accumulatedPatch.budget = input.budget;
        if (input.targetArea !== null) accumulatedPatch.targetArea = input.targetArea;
        accumulatedPatch.financingStatus = input.financingStatus;
        return {
          status: result.status,
          leadId: result.leadId,
          showingTaskId: result.showingTaskId,
        };
      },
    }),

    search_workspace_listings: tool({
      description: "Surface other active listings from this workspace when the current listing isn't the right fit (sold, wrong price, wrong area, wrong size). Returns up to 5 candidates the buyer can consider. Use this AGGRESSIVELY — better to suggest 1-2 alternatives than dead-end the conversation.",
      inputSchema: z.object({
        minPrice: z.number().nullable().describe("Floor in dollars, e.g. 250000, or null"),
        maxPrice: z.number().nullable().describe("Ceiling in dollars, e.g. 400000, or null"),
        minBeds: z.number().int().nullable().describe("Minimum bedrooms, or null"),
        areaContains: z.string().nullable().describe("Substring to match against address/neighborhood/city (e.g. 'Katy', 'Sugar Land'), or null"),
        propertyType: z.string().nullable().describe("Property type substring (e.g. 'single family', 'townhome'), or null"),
      }),
      execute: async (input) => {
        const matches = await params.findOtherListings({
          excludeListingId: params.listing.id,
          criteria: {
            minPrice: input.minPrice,
            maxPrice: input.maxPrice,
            minBeds: input.minBeds,
            areaContains: input.areaContains,
            propertyType: input.propertyType,
          },
          limit: 5,
        });
        return {
          count: matches.length,
          listings: matches.map((listing) => ({
            id: listing.id,
            address: listing.address,
            status: listing.status,
            price: formatMoney(listing.price),
            beds: listing.beds,
            baths: listing.baths,
            neighborhood: readString(listing.rawFacts, "neighborhood"),
            city: readString(listing.rawFacts, "city"),
            propertyType: readString(listing.rawFacts, "propertyType"),
          })),
        };
      },
    }),

    get_listing_location: tool({
      description: "Returns the structured location of the CURRENT listing — city, state, zip, neighborhood, school district. Use when the buyer asks anything location-specific so you don't have to parse the address string yourself.",
      inputSchema: z.object({}),
      execute: async () => parseListingLocation(params.listing),
    }),
  };

  const conversationContext = summarizeConversation(params.conversation);
  const userMessage = conversationContext.length === 0
    ? params.message
    : `Conversation so far:\n${conversationContext}\n\nBuyer's latest message: ${params.message}`;

  const result = await generateText({
    model: openai(params.model),
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
    tools,
    // 6 steps: lets the model chain note_qualification → search_workspace_listings
    // → optionally capture_lead → final reply. 6 matches operator-side
    // harwick-chat's bound.
    stopWhen: stepCountIs(6),
  });

  return {
    reply: result.text.trim().length > 0
      ? result.text.trim()
      : capturedLead === null
        ? "Got it — what else do you want to know about this place?"
        : "All set — the agent will reach out shortly with next steps.",
    capturedLead,
    qualificationPatch: accumulatedPatch,
  };
}
