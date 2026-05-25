import {
  HarwickAiRuntimeInputSchema,
  PublicListingChatRequestSchema,
  PublicListingChatResponseSchema,
  type HarwickAiListingMemory,
  type PublicListingChatRequest,
  type PublicListingChatResponse,
} from "@realty-ops/core";
import type { HarwickAiRuntimeClient } from "@realty-ops/integrations";

export type PublicListingChatWorkspace = {
  id: string;
  name: string;
};

export type PublicListingChatListing = {
  id: string;
  address: string;
  workspaceId: string;
  mlsNumber: string | null;
  status: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  rawFacts: Record<string, unknown>;
  verifiedAt: string | null;
};

export type PublicListingChatLead = {
  id: string;
  assignedAgentId: string | null;
};

export type PublicListingChatLeadCapture = {
  fullName: string | null;
  email: string | null;
  phone: string;
  message: string;
  intent: "question" | "showing";
  leadType: "buyer" | "seller" | "renter" | "investor" | "unknown";
  leadIntent: "high" | "medium" | "low" | "spam" | "unknown";
  timeline: string | null;
  budget: number | null;
  targetArea: string | null;
  propertyType: string | null;
  financingStatus: "preapproved" | "cash" | "needs_lender" | "unknown";
  score: number;
  documentUpdate: string;
};

export type PublicListingChatRepository = {
  findWorkspaceBySlug(workspaceSlug: string): Promise<PublicListingChatWorkspace | null>;
  findListing(params: {
    workspaceId: string;
    listingId: string;
  }): Promise<PublicListingChatListing | null>;
  findExistingLead(params: {
    workspaceId: string;
    email: string | null;
    phone: string;
  }): Promise<PublicListingChatLead | null>;
  insertLead(params: {
    workspaceId: string;
    values: PublicListingChatLeadCapture;
    createdAt: string;
  }): Promise<PublicListingChatLead>;
  updateLead(params: {
    leadId: string;
    values: PublicListingChatLeadCapture;
    updatedAt: string;
  }): Promise<void>;
  insertLeadEvent(params: {
    workspaceId: string;
    leadId: string;
    listing: PublicListingChatListing;
    values: PublicListingChatLeadCapture;
    providerEventId: string;
    occurredAt: string;
  }): Promise<void>;
  insertShowingTask(params: {
    workspaceId: string;
    leadId: string;
    listing: PublicListingChatListing;
    assignedMemberId: string | null;
    values: PublicListingChatLeadCapture;
    createdAt: string;
  }): Promise<string>;
};

export class PublicListingChatError extends Error {
  constructor(
    readonly code: "workspace_not_found" | "listing_not_found",
    readonly status: 404,
  ) {
    super(code);
  }
}

function readRawString(rawFacts: Record<string, unknown>, key: string): string | null {
  const value = rawFacts[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readRawStringArray(rawFacts: Record<string, unknown>, key: string): string[] {
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

function buildListingMemory(listing: PublicListingChatListing): HarwickAiListingMemory {
  const neighborhood = readRawString(listing.rawFacts, "neighborhood");
  const city = readRawString(listing.rawFacts, "city");
  const propertyType = readRawString(listing.rawFacts, "propertyType");
  const squareFeet = typeof listing.rawFacts["squareFeet"] === "number"
    ? `${Math.round(listing.rawFacts["squareFeet"]).toLocaleString()} sqft`
    : null;
  const incentives = readRawStringArray(listing.rawFacts, "incentives");
  const amenities = readRawStringArray(listing.rawFacts, "amenities");
  const facts = [
    listing.mlsNumber === null ? null : `MLS ${listing.mlsNumber}`,
    propertyType,
    neighborhood,
    city,
    squareFeet,
    listing.beds === null ? null : `${listing.beds} beds`,
    listing.baths === null ? null : `${listing.baths} baths`,
    ...incentives.map((value) => `incentive: ${value}`),
    ...amenities.slice(0, 6),
  ].filter((fact): fact is string => fact !== null && fact.trim().length > 0);

  return {
    listingId: listing.id,
    label: listing.address,
    address: listing.address,
    price: formatMoney(listing.price),
    status: listing.status,
    beds: listing.beds === null ? null : String(listing.beds),
    baths: listing.baths === null ? null : String(listing.baths),
    area: neighborhood ?? city,
    facts,
    lastVerifiedAt: listing.verifiedAt,
  };
}

function buildLeadDocument(params: {
  listing: PublicListingChatListing;
  request: PublicListingChatRequest;
}): string {
  const qualification = params.request.qualification;
  const lines = [
    `Public listing visitor is asking about ${params.listing.address}.`,
    qualification.timeline === null || qualification.timeline === undefined ? null : `Timeline: ${qualification.timeline}.`,
    qualification.budget === null || qualification.budget === undefined ? null : `Budget: ${qualification.budget}.`,
    qualification.targetArea === null || qualification.targetArea === undefined ? null : `Target area: ${qualification.targetArea}.`,
    qualification.financingStatus === undefined || qualification.financingStatus === "unknown" ? null : `Financing: ${qualification.financingStatus}.`,
  ];

  return lines.filter((line): line is string => line !== null).join("\n");
}

function normalizePhone(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return trimmed;
}

function normalizeEmail(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null;
}

function parseBudget(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const normalized = value.toLowerCase().replace(/,/g, "");
  const match = normalized.match(/(\d+(?:\.\d+)?)/);
  if (match === null) return null;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) return null;
  const multiplier = normalized.includes("m") ? 1_000_000 : normalized.includes("k") ? 1_000 : 1;
  return Math.round(parsed * multiplier);
}

function extractPhoneFromText(text: string): string | null {
  const match = text.match(/(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/);
  return normalizePhone(match?.[0] ?? null);
}

function extractEmailFromText(text: string): string | null {
  const match = text.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
  return normalizeEmail(match?.[0] ?? null);
}

function extractNameFromText(text: string): string | null {
  const match = text.match(/\b(?:my name is|i'm|i am)\s+([a-z][a-z' -]{1,80})/i);
  if (match === null) return null;
  const name = match[1]?.replace(/[.,;:!?].*$/, "").trim();
  return name !== undefined && name.length > 0 ? name : null;
}

function isShowingRequest(params: {
  request: PublicListingChatRequest;
  response: Pick<PublicListingChatResponse, "nextAction" | "statePatch">;
}): boolean {
  if (params.response.nextAction === "offer_showing" || params.response.nextAction === "request_showing_approval") return true;
  if (params.response.statePatch.currentIntent?.toLowerCase().includes("showing") === true) return true;
  const text = params.request.message.toLowerCase();
  return ["showing", "tour", "see it", "see this", "walk through", "walkthrough", "visit"].some((term) => text.includes(term));
}

function buildProviderEventId(params: {
  workspaceId: string;
  listingId: string;
  phone: string;
  occurredAt: string;
}): string {
  return [
    "public_listing_chat",
    params.workspaceId,
    params.listingId,
    params.phone.replace(/[^0-9]/g, ""),
    Date.parse(params.occurredAt),
  ].join(":");
}

function buildLeadCapture(params: {
  listing: PublicListingChatListing;
  request: PublicListingChatRequest;
  response: Pick<PublicListingChatResponse, "documentUpdate" | "nextAction" | "statePatch">;
}): PublicListingChatLeadCapture | null {
  const phone = normalizePhone(params.request.qualification.phone) ?? extractPhoneFromText(params.request.message);
  if (phone === null) return null;

  const showing = isShowingRequest({ request: params.request, response: params.response });
  const statePatch = params.response.statePatch;
  const qualification = params.request.qualification;
  const name = qualification.name ?? extractNameFromText(params.request.message);
  const email = normalizeEmail(qualification.email) ?? extractEmailFromText(params.request.message);
  const leadIntent = statePatch.intent ?? qualification.intent ?? (showing ? "high" : "medium");

  return {
    fullName: name ?? null,
    email,
    phone,
    message: [
      params.request.message,
      params.response.documentUpdate.length > 0 ? `Harwick note: ${params.response.documentUpdate}` : null,
    ].filter((line): line is string => line !== null).join("\n"),
    intent: showing ? "showing" : "question",
    leadType: statePatch.leadType ?? qualification.leadType ?? "buyer",
    leadIntent,
    timeline: statePatch.timeline ?? qualification.timeline ?? null,
    budget: parseBudget(statePatch.budget ?? qualification.budget ?? null),
    targetArea: statePatch.targetArea ?? qualification.targetArea ?? readRawString(params.listing.rawFacts, "neighborhood"),
    propertyType: statePatch.propertyType ?? qualification.propertyType ?? readRawString(params.listing.rawFacts, "propertyType"),
    financingStatus: statePatch.financingStatus ?? qualification.financingStatus ?? "unknown",
    score: Math.max(qualification.score ?? 0, showing ? 75 : leadIntent === "high" ? 70 : 50),
    documentUpdate: params.response.documentUpdate,
  };
}

export async function handlePublicListingChat(params: {
  workspaceSlug: string;
  request: unknown;
  repository: PublicListingChatRepository;
  runtimeClient: HarwickAiRuntimeClient;
  now?: () => Date;
}): Promise<PublicListingChatResponse> {
  const request = PublicListingChatRequestSchema.parse(params.request);
  const workspace = await params.repository.findWorkspaceBySlug(params.workspaceSlug);
  if (workspace === null) {
    throw new PublicListingChatError("workspace_not_found", 404);
  }

  const listing = await params.repository.findListing({
    workspaceId: workspace.id,
    listingId: request.listingId,
  });
  if (listing === null) {
    throw new PublicListingChatError("listing_not_found", 404);
  }

  const runtimeInput = HarwickAiRuntimeInputSchema.parse({
    workspaceName: workspace.name,
    channel: "manual",
    inboundText: request.message,
    conversation: request.conversation.map((message) => ({
      id: message.id,
      actor: message.actor,
      body: message.body,
      occurredAt: message.occurredAt,
    })),
    state: {
      workspaceId: workspace.id,
      leadId: null,
      providerThreadId: null,
      channel: "manual",
      automationMode: "ai_on",
      currentIntent: "qualification_in_progress",
      qualification: {
        name: request.qualification.name ?? null,
        phone: request.qualification.phone ?? null,
        email: request.qualification.email ?? null,
        leadType: request.qualification.leadType ?? "unknown",
        intent: request.qualification.intent ?? "unknown",
        timeline: request.qualification.timeline ?? null,
        budget: request.qualification.budget ?? null,
        targetArea: request.qualification.targetArea ?? null,
        propertyType: request.qualification.propertyType ?? null,
        financingStatus: request.qualification.financingStatus ?? "unknown",
        score: request.qualification.score ?? 0,
      },
      knownFacts: [],
      lastAiAction: null,
      assignedAgentName: null,
      sourceOwnerName: workspace.name,
    },
    toneProfile: {
      name: `${workspace.name} public listings`,
      voice: "warm, concise, specific, premium, and helpful without sounding scripted",
      bannedPhrases: ["submit this form", "fill out this form"],
      preferredPhrases: ["I can help with that", "What matters most for you"],
      emojiPolicy: "none",
      signature: null,
    },
    postContext: null,
    listingContext: buildListingMemory(listing),
    calendarContext: [],
    buyerBlueprintUrl: null,
    policyNarrative: "Public listing conversations should answer from verified listing facts, qualify naturally one question at a time, and request agent approval before confirming private showings. Do not invent availability, school ratings, financing certainty, legal advice, or contract advice.",
    leadDocument: buildLeadDocument({ listing, request }),
  });

  const turn = await params.runtimeClient.runTurn(runtimeInput);
  const response = PublicListingChatResponseSchema.parse({
    reply: turn.reply,
    nextAction: turn.nextAction,
    missingFields: turn.missingFields,
    statePatch: turn.statePatch,
    handoffBrief: turn.handoffBrief,
    safetyFlags: turn.safetyFlags,
    confidence: turn.confidence,
    toolCalls: turn.toolCalls,
    documentUpdate: turn.documentUpdate,
    leadCapture: null,
  });

  const leadCapture = buildLeadCapture({ listing, request, response });
  if (leadCapture === null || leadCapture.leadIntent === "spam") {
    return response;
  }

  const occurredAt = (params.now?.() ?? new Date()).toISOString();
  const existingLead = await params.repository.findExistingLead({
    workspaceId: workspace.id,
    email: leadCapture.email,
    phone: leadCapture.phone,
  });
  const lead = existingLead === null
    ? await params.repository.insertLead({
        workspaceId: workspace.id,
        values: leadCapture,
        createdAt: occurredAt,
      })
    : existingLead;
  if (existingLead !== null) {
    await params.repository.updateLead({
      leadId: existingLead.id,
      values: leadCapture,
      updatedAt: occurredAt,
    });
  }

  await params.repository.insertLeadEvent({
    workspaceId: workspace.id,
    leadId: lead.id,
    listing,
    values: leadCapture,
    providerEventId: buildProviderEventId({
      workspaceId: workspace.id,
      listingId: listing.id,
      phone: leadCapture.phone,
      occurredAt,
    }),
    occurredAt,
  });

  const showingTaskId = leadCapture.intent === "showing"
    ? await params.repository.insertShowingTask({
        workspaceId: workspace.id,
        leadId: lead.id,
        listing,
        assignedMemberId: lead.assignedAgentId,
        values: leadCapture,
        createdAt: occurredAt,
      })
    : null;

  return PublicListingChatResponseSchema.parse({
    ...response,
    leadCapture: {
      leadId: lead.id,
      status: existingLead === null ? "created" : "updated",
      intent: leadCapture.intent,
      showingTaskId,
    },
  });
}
