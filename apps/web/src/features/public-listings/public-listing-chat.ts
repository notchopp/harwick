import { randomBytes } from "node:crypto";

import {
  PublicListingChatRequestSchema,
  PublicListingChatResponseSchema,
  type ListingMemory,
  type PublicListingChatQualification,
  type PublicListingChatResponse,
} from "@realty-ops/core";

import type {
  GenerateListingChatReplyResult,
  ListingChatCaptureInput,
  ListingChatCaptureResult,
} from "./listing-chat-generator";

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

function generateSessionToken(): string {
  return randomBytes(24).toString("base64url");
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

// Folds the qualification patch returned by the generator into the session
// qualification jsonb so the next turn starts from the latest state.
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
  return next;
}

export type HandlePublicListingChatResult = {
  response: PublicListingChatResponse;
  sessionToken: string;
  sessionCreated: boolean;
};

/**
 * Function the handler calls to actually generate the model reply. Defaults
 * to `generateListingChatReply` from `./listing-chat-generator` (which uses
 * `generateText` + tools — the same proven pattern operator-side harwick-chat
 * uses). Injectable so tests can mock without spinning up the AI SDK.
 */
export type PublicListingChatGenerator = (params: {
  workspaceName: string;
  listing: PublicListingChatListing;
  memory: readonly ListingMemory[];
  conversation: ReadonlyArray<{ actor: string; body: string }>;
  message: string;
  priorQualification: PublicListingChatQualification;
  onCaptureLead: (input: ListingChatCaptureInput) => Promise<ListingChatCaptureResult>;
}) => Promise<GenerateListingChatReplyResult>;

export async function handlePublicListingChat(params: {
  workspaceSlug: string;
  request: unknown;
  repository: PublicListingChatRepository;
  // The generator is the seam where the model is actually called. Route
  // wires it to the real generateListingChatReply with an openai key; tests
  // pass a fake that returns deterministic {reply, capturedLead, qualificationPatch}.
  generator: PublicListingChatGenerator;
  sessionToken: string | null;
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

  // Persist visitor turn upfront so even if the model fails we have the
  // inbound recorded for support / debugging.
  await params.repository.appendTurn({
    sessionId: session.id,
    actor: "visitor",
    body: request.message,
    statePatch: null,
    nextAction: null,
    occurredAt,
  });

  // Server-side conversation is authoritative; client-sent conversation
  // is ignored.
  const priorTurns = await params.repository.findRecentTurns({
    sessionId: session.id,
    limit: 20,
  });

  // capture_lead tool implementation. The model decides WHEN to call this
  // (it has the policy in its system prompt: phone captured + clear intent).
  // We do the persistence: findExistingLead → insert/update → write event →
  // queue showing task if intent = showing → pin session to promoted lead.
  let promotionTookPlace = false;
  const onCaptureLead = async (input: ListingChatCaptureInput): Promise<ListingChatCaptureResult> => {
    const captureValues: PublicListingChatLeadCapture = {
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      message: input.conversationSummary,
      intent: input.intent,
      leadType: input.leadType ?? "buyer",
      leadIntent: input.intentTier ?? "medium",
      timeline: input.timeline,
      budget: input.budget === null ? null : parseBudget(input.budget),
      targetArea: input.targetArea ?? readRawString(listing.rawFacts, "neighborhood"),
      propertyType: input.propertyType ?? readRawString(listing.rawFacts, "propertyType"),
      financingStatus: input.financingStatus,
      score: input.intent === "showing" ? 75 : input.intentTier === "high" ? 70 : 50,
      documentUpdate: input.conversationSummary,
    };

    const existingLead = session === null || session.promotedLeadId === null
      ? await params.repository.findExistingLead({
          workspaceId: workspace.id,
          email: captureValues.email,
          phone: captureValues.phone,
        })
      : { id: session.promotedLeadId, assignedAgentId: null };

    const lead = existingLead === null
      ? await params.repository.insertLead({
          workspaceId: workspace.id,
          values: captureValues,
          createdAt: occurredAt,
        })
      : existingLead;

    if (existingLead !== null) {
      await params.repository.updateLead({
        leadId: existingLead.id,
        values: captureValues,
        updatedAt: occurredAt,
      });
    }

    await params.repository.insertLeadEvent({
      workspaceId: workspace.id,
      leadId: lead.id,
      listing,
      values: captureValues,
      providerEventId: buildProviderEventId({
        workspaceId: workspace.id,
        listingId: listing.id,
        phone: captureValues.phone,
        occurredAt,
      }),
      occurredAt,
    });

    const showingTaskId = captureValues.intent === "showing"
      ? await params.repository.insertShowingTask({
          workspaceId: workspace.id,
          leadId: lead.id,
          listing,
          assignedMemberId: lead.assignedAgentId,
          values: captureValues,
          createdAt: occurredAt,
        })
      : null;

    if (session !== null && session.promotedLeadId !== lead.id) {
      await params.repository.linkSessionLead({
        sessionId: session.id,
        leadId: lead.id,
        promotedAt: occurredAt,
      });
    }

    promotionTookPlace = existingLead === null;
    return {
      leadId: lead.id,
      status: existingLead === null ? "created" : "updated",
      intent: captureValues.intent,
      showingTaskId,
    };
  };

  // Call the generator (real or test fake). Errors here bubble up — the
  // visitor turn is already persisted at the top of the handler so the
  // session has a record even if the model call dies.
  const generated = await params.generator({
    workspaceName: workspace.name,
    listing,
    memory,
    conversation: priorTurns,
    message: request.message,
    priorQualification: session.qualification,
    onCaptureLead,
  });

  // Persist the assistant turn (the natural-language reply). State patch
  // and nextAction columns get derived values from the qualification patch
  // the generator returned, so the operator-side replay still sees what
  // changed.
  await params.repository.appendTurn({
    sessionId: session.id,
    actor: "harwick_ai",
    body: generated.reply,
    statePatch: Object.keys(generated.qualificationPatch).length > 0
      ? generated.qualificationPatch as Record<string, unknown>
      : null,
    nextAction: generated.capturedLead === null
      ? "send_reply"
      : generated.capturedLead.intent === "showing"
        ? "request_showing_approval"
        : "handoff_to_agent",
    occurredAt,
  });

  // Merge qualification updates into the session for the next turn.
  const mergedQualification = mergeQualification(
    session.qualification,
    generated.qualificationPatch as Record<string, unknown>,
  );
  await params.repository.updateSessionQualification({
    sessionId: session.id,
    qualification: mergedQualification,
    lastActiveAt: occurredAt,
  });

  // Build the response in the existing PublicListingChatResponse shape so
  // the client doesn't need any changes. Fields the old typed runtime
  // returned (missingFields, safetyFlags, etc.) become empty arrays —
  // the tools-based generator doesn't surface them in the same way, but
  // they're not consumed by the client today either.
  const response = PublicListingChatResponseSchema.parse({
    reply: generated.reply,
    nextAction: generated.capturedLead === null ? "send_reply" : "request_showing_approval",
    missingFields: [],
    statePatch: {
      currentIntent: generated.capturedLead === null ? "qualification_in_progress" : "lead_captured",
      leadType: mergedQualification.leadType ?? null,
      intent: mergedQualification.intent ?? null,
      timeline: mergedQualification.timeline ?? null,
      budget: mergedQualification.budget ?? null,
      targetArea: mergedQualification.targetArea ?? null,
      propertyType: mergedQualification.propertyType ?? null,
      financingStatus: mergedQualification.financingStatus ?? null,
      knownFacts: [],
    },
    handoffBrief: null,
    safetyFlags: [],
    confidence: 0.85,
    toolCalls: generated.capturedLead === null ? [] : [{
      tool: "request_showing_approval",
      reason: "capture_lead tool was invoked with shared contact + intent",
      requiresApproval: true,
      payload: { leadId: generated.capturedLead.leadId },
    }],
    documentUpdate: "",
    leadCapture: generated.capturedLead === null ? null : {
      leadId: generated.capturedLead.leadId,
      status: generated.capturedLead.status,
      intent: generated.capturedLead.intent,
      showingTaskId: generated.capturedLead.showingTaskId,
    },
  });

  // Silence the unused-var warning — promotionTookPlace is observable
  // through the response.leadCapture.status field but the variable itself
  // is informational only.
  void promotionTookPlace;

  return { response, sessionToken: session.sessionToken, sessionCreated };
}
