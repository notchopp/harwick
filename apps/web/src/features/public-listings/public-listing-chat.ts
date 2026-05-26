import { randomBytes } from "node:crypto";

import {
  HarwickAiRuntimeInputSchema,
  PublicListingChatRequestSchema,
  PublicListingChatResponseSchema,
  type HarwickAiListingMemory,
  type ListingMemory,
  type PublicListingChatMessage,
  type PublicListingChatQualification,
  type PublicListingChatRequest,
  type PublicListingChatResponse,
} from "@realty-ops/core";
import type { HarwickAiRuntimeClient } from "@realty-ops/integrations";

export type PublicListingChatSession = {
  id: string;
  sessionToken: string;
  qualification: PublicListingChatQualification;
  promotedLeadId: string | null;
};

export type PublicListingChatSessionTurn = {
  actor: "visitor" | "harwick_ai";
  body: string;
};

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
  findListingMemory(params: {
    workspaceId: string;
    listingId: string;
  }): Promise<ListingMemory[]>;
  findSessionByToken(params: {
    sessionToken: string;
    workspaceId: string;
    listingId: string;
  }): Promise<PublicListingChatSession | null>;
  createSession(params: {
    workspaceId: string;
    listingId: string;
    sessionToken: string;
    ipHash: string | null;
    userAgent: string | null;
    createdAt: string;
  }): Promise<PublicListingChatSession>;
  findRecentTurns(params: {
    sessionId: string;
    limit: number;
  }): Promise<PublicListingChatSessionTurn[]>;
  appendTurn(params: {
    sessionId: string;
    actor: "visitor" | "harwick_ai";
    body: string;
    statePatch: Record<string, unknown> | null;
    nextAction: string | null;
    occurredAt: string;
  }): Promise<void>;
  updateSessionQualification(params: {
    sessionId: string;
    qualification: PublicListingChatQualification;
    lastActiveAt: string;
  }): Promise<void>;
  linkSessionLead(params: {
    sessionId: string;
    leadId: string;
    promotedAt: string;
  }): Promise<void>;
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

function buildListingMemory(params: {
  listing: PublicListingChatListing;
  memory: readonly ListingMemory[];
}): HarwickAiListingMemory {
  const { listing } = params;
  const neighborhood = readRawString(listing.rawFacts, "neighborhood");
  const city = readRawString(listing.rawFacts, "city");
  const propertyType = readRawString(listing.rawFacts, "propertyType");
  const squareFeet = typeof listing.rawFacts["squareFeet"] === "number"
    ? `${Math.round(listing.rawFacts["squareFeet"]).toLocaleString()} sqft`
    : null;
  const incentives = readRawStringArray(listing.rawFacts, "incentives");
  const amenities = readRawStringArray(listing.rawFacts, "amenities");
  // Operator-authored memory rows feed in as facts so the model can answer
  // the question behind every smart-prompt chip with real depth. We include
  // BOTH visibility tiers because Harwick is the operator's proxy — she
  // sees the internal notes too ("seller will hold on price until July 1").
  const memoryFacts = params.memory
    .filter((row) => row.content.length > 0)
    .map((row) => row.visibility === "public" ? row.content : `internal: ${row.content}`);
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
    ...memoryFacts,
  ].filter((fact): fact is string => fact !== null && fact.trim().length > 0);

  // Supabase returns Postgres timestamp format ("2026-05-25 12:00:00+00")
  // but HarwickAiListingMemorySchema.lastVerifiedAt requires strict ISO 8601
  // ("2026-05-25T12:00:00.000Z"). Normalize through Date — if parsing fails
  // for any reason, fall back to null so the chat doesn't blow up over
  // an unparseable verified_at.
  let normalizedVerifiedAt: string | null = null;
  if (listing.verifiedAt !== null) {
    const parsed = new Date(listing.verifiedAt);
    if (!Number.isNaN(parsed.getTime())) {
      normalizedVerifiedAt = parsed.toISOString();
    }
  }

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
    lastVerifiedAt: normalizedVerifiedAt,
  };
}

function generateSessionToken(): string {
  return randomBytes(24).toString("base64url");
}

function mergeQualification(
  current: PublicListingChatQualification,
  patch: Record<string, unknown>,
): PublicListingChatQualification {
  const next: PublicListingChatQualification = { ...current };
  const set = <K extends keyof PublicListingChatQualification>(key: K, value: PublicListingChatQualification[K] | undefined) => {
    if (value !== undefined) next[key] = value;
  };

  if (typeof patch["name"] === "string") set("name", patch["name"]);
  if (typeof patch["phone"] === "string") set("phone", patch["phone"]);
  if (typeof patch["email"] === "string") set("email", patch["email"]);
  if (typeof patch["timeline"] === "string") set("timeline", patch["timeline"]);
  if (typeof patch["budget"] === "string" || typeof patch["budget"] === "number") {
    set("budget", String(patch["budget"]));
  }
  if (typeof patch["targetArea"] === "string") set("targetArea", patch["targetArea"]);
  if (typeof patch["propertyType"] === "string") set("propertyType", patch["propertyType"]);
  const leadType = patch["leadType"];
  if (leadType === "buyer" || leadType === "seller" || leadType === "renter" || leadType === "investor" || leadType === "unknown") {
    set("leadType", leadType);
  }
  const intent = patch["intent"];
  if (intent === "high" || intent === "medium" || intent === "low" || intent === "spam" || intent === "unknown") {
    set("intent", intent);
  }
  const financingStatus = patch["financingStatus"];
  if (financingStatus === "preapproved" || financingStatus === "cash" || financingStatus === "needs_lender" || financingStatus === "unknown") {
    set("financingStatus", financingStatus);
  }
  if (typeof patch["score"] === "number") {
    const score = Math.max(0, Math.min(100, Math.round(patch["score"])));
    set("score", score);
  }
  return next;
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

export type HandlePublicListingChatResult = {
  response: PublicListingChatResponse;
  sessionToken: string;
  sessionCreated: boolean;
};

export async function handlePublicListingChat(params: {
  workspaceSlug: string;
  request: unknown;
  repository: PublicListingChatRepository;
  runtimeClient: HarwickAiRuntimeClient;
  // Cookie-derived session token, if the visitor already has one. If null
  // the handler creates a fresh session and returns the new token so the
  // route layer can set the cookie on the response.
  sessionToken: string | null;
  // PII-safe correlation (sha-256 truncated). Optional — used for abuse
  // attribution but never required.
  ipHash?: string | null;
  userAgent?: string | null;
  now?: () => Date;
}): Promise<HandlePublicListingChatResult> {
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

  // Listing memory is the operator-authored knowledge layer powering god-flow
  // smart prompts and giving Harwick context beyond raw_facts. Both public
  // and internal rows feed in — internal ones get tagged in the prompt so
  // the model knows they're operator-only context.
  const memory = await params.repository.findListingMemory({
    workspaceId: workspace.id,
    listingId: listing.id,
  });

  const now = params.now?.() ?? new Date();
  const occurredAt = now.toISOString();

  // Load or create session FIRST so every subsequent persistence step has a
  // session_id to anchor on. This is what makes pre-promotion transcripts
  // recoverable by operators on the promoted lead.
  let session = params.sessionToken === null
    ? null
    : await params.repository.findSessionByToken({
        sessionToken: params.sessionToken,
        workspaceId: workspace.id,
        listingId: listing.id,
      });
  let sessionCreated = false;
  if (session === null) {
    const newToken = generateSessionToken();
    session = await params.repository.createSession({
      workspaceId: workspace.id,
      listingId: listing.id,
      sessionToken: newToken,
      ipHash: params.ipHash ?? null,
      userAgent: params.userAgent ?? null,
      createdAt: occurredAt,
    });
    sessionCreated = true;
  }

  // Persist the visitor's message immediately. If anything below throws
  // we still have the inbound recorded for support / debugging.
  await params.repository.appendTurn({
    sessionId: session.id,
    actor: "visitor",
    body: request.message,
    statePatch: null,
    nextAction: null,
    occurredAt,
  });

  // Server-side conversation history is authoritative. The legacy
  // `request.conversation` from clients is ignored on purpose — trusting
  // the client to maintain history made the pre-promotion transcript
  // unrecoverable for operators.
  const priorTurns = await params.repository.findRecentTurns({
    sessionId: session.id,
    // 20-turn window matches the typed runtime input ceiling.
    limit: 20,
  });
  const conversation: PublicListingChatMessage[] = priorTurns.map((turn, index) => ({
    id: `turn-${index}`,
    actor: turn.actor === "visitor" ? "lead" : "harwick_ai",
    body: turn.body,
    occurredAt: null,
  }));

  const runtimeInput = HarwickAiRuntimeInputSchema.parse({
    workspaceName: workspace.name,
    channel: "manual",
    inboundText: request.message,
    conversation: conversation.map((message) => ({
      id: message.id,
      actor: message.actor,
      body: message.body,
      occurredAt: message.occurredAt,
    })),
    state: {
      workspaceId: workspace.id,
      leadId: session.promotedLeadId,
      providerThreadId: null,
      channel: "manual",
      automationMode: "ai_on",
      currentIntent: "qualification_in_progress",
      qualification: {
        name: session.qualification.name ?? null,
        phone: session.qualification.phone ?? null,
        email: session.qualification.email ?? null,
        leadType: session.qualification.leadType ?? "unknown",
        intent: session.qualification.intent ?? "unknown",
        timeline: session.qualification.timeline ?? null,
        budget: session.qualification.budget ?? null,
        targetArea: session.qualification.targetArea ?? null,
        propertyType: session.qualification.propertyType ?? null,
        financingStatus: session.qualification.financingStatus ?? "unknown",
        score: session.qualification.score ?? 0,
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
    listingContext: buildListingMemory({ listing, memory }),
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

  // Persist assistant turn with state patch + next action so operators can
  // replay Harwick's reasoning trail without re-running the model.
  await params.repository.appendTurn({
    sessionId: session.id,
    actor: "harwick_ai",
    body: turn.reply,
    statePatch: turn.statePatch as Record<string, unknown>,
    nextAction: turn.nextAction,
    occurredAt,
  });

  // Fold the runtime's qualification updates back into the session so the
  // next turn picks up where this one left off.
  const mergedQualification = mergeQualification(
    session.qualification,
    turn.statePatch as Record<string, unknown>,
  );
  await params.repository.updateSessionQualification({
    sessionId: session.id,
    qualification: mergedQualification,
    lastActiveAt: occurredAt,
  });

  const leadCapture = buildLeadCapture({
    listing,
    request: { ...request, qualification: mergedQualification },
    response,
  });
  if (leadCapture === null || leadCapture.leadIntent === "spam") {
    return { response, sessionToken: session.sessionToken, sessionCreated };
  }

  const existingLead = session.promotedLeadId === null
    ? await params.repository.findExistingLead({
        workspaceId: workspace.id,
        email: leadCapture.email,
        phone: leadCapture.phone,
      })
    : { id: session.promotedLeadId, assignedAgentId: null };
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

  // Pin the session to the promoted lead — only on first promotion. If the
  // session already pointed at this lead, this is a no-op write.
  if (session.promotedLeadId !== lead.id) {
    await params.repository.linkSessionLead({
      sessionId: session.id,
      leadId: lead.id,
      promotedAt: occurredAt,
    });
  }

  const finalResponse = PublicListingChatResponseSchema.parse({
    ...response,
    leadCapture: {
      leadId: lead.id,
      status: existingLead === null ? "created" : "updated",
      intent: leadCapture.intent,
      showingTaskId,
    },
  });

  return { response: finalResponse, sessionToken: session.sessionToken, sessionCreated };
}
