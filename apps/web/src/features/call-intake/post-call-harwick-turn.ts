import {
  HarwickAiRuntimeInputSchema,
  type HarwickAiListingMemory,
  type HarwickAiToolCall,
  type HarwickAiTurn,
  type ListingMemory,
} from "@realty-ops/core";
import type { HarwickAiRuntimeClient } from "@realty-ops/integrations";

/**
 * Post-call Harwick typed turn.
 *
 * The architectural principle the codex session crystallized: *Retell
 * talks live, Harwick thinks after, listings are the common ground.*
 * Retell's typed call tools (lookup_listing, create_lead_handoff,
 * transfer_call, end_call) keep the live call low-latency and
 * deterministic. Once `call_analyzed` fires, this function runs the
 * structured Harwick runtime over the transcript + normalized
 * handoff + the persisted lead/workspace context, and emits the
 * follow-on actions that turn a phone call into a concrete next step
 * an operator can act on:
 *
 *   - Update the lead document with refined qualification
 *   - Queue a callback task (god flow 2 primary output)
 *   - Queue a showing approval if the caller asked for one
 *   - Route the lead if intent + budget warrant it
 *   - Record a listing memory note if a recurring question came up
 *
 * The lead-event row anchors all of this back to the original call so
 * the operator sees one trail: call → Harwick read → here's what to do.
 *
 * The function is repository-injected so the unit test can run without
 * Supabase — same pattern as the public listing chat handler.
 */

export type PostCallHarwickLead = {
  id: string;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  qualificationSummary: string | null;
  assignedAgentId: string | null;
};

export type PostCallHarwickListing = {
  id: string;
  address: string;
  mlsNumber: string | null;
  status: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  rawFacts: Record<string, unknown>;
  verifiedAt: string | null;
};

export type PostCallHarwickWorkspace = {
  id: string;
  name: string;
};

export type PostCallQualificationPatch = {
  leadType?: "buyer" | "seller" | "renter" | "investor" | "unknown" | undefined;
  intent?: "high" | "medium" | "low" | "spam" | "unknown" | undefined;
  timeline?: string | null | undefined;
  budget?: string | number | null | undefined;
  targetArea?: string | null | undefined;
  propertyType?: string | null | undefined;
  financingStatus?: "preapproved" | "cash" | "needs_lender" | "unknown" | undefined;
  score?: number | undefined;
};

export type PostCallHarwickRepository = {
  findWorkspace(workspaceId: string): Promise<PostCallHarwickWorkspace | null>;
  findLead(leadId: string): Promise<PostCallHarwickLead | null>;
  findListing(params: {
    workspaceId: string;
    listingId: string;
  }): Promise<PostCallHarwickListing | null>;
  findListingMemory(params: {
    workspaceId: string;
    listingId: string;
  }): Promise<ListingMemory[]>;
  updateLeadDocument(params: {
    leadId: string;
    qualification: PostCallQualificationPatch;
    qualificationSummary: string;
    updatedAt: string;
  }): Promise<void>;
  insertLeadEvent(params: {
    workspaceId: string;
    leadId: string;
    callId: string;
    summary: string;
    occurredAt: string;
  }): Promise<void>;
  insertCallbackTask(params: {
    workspaceId: string;
    leadId: string;
    listingId: string | null;
    assignedMemberId: string | null;
    reason: string;
    urgency: "now" | "today" | "this_week";
    dueAt: string | null;
    createdAt: string;
  }): Promise<string>;
  insertShowingApproval(params: {
    workspaceId: string;
    leadId: string;
    listingId: string;
    assignedMemberId: string | null;
    summary: string;
    requestedStartAt: string | null;
    requestedEndAt: string | null;
    createdAt: string;
  }): Promise<string>;
  logListingMemory(params: {
    workspaceId: string;
    listingId: string;
    kind: "common_question" | "common_objection" | "context_note" | "incentive" | "sales_angle";
    visibility: "public" | "internal";
    prompt: string | null;
    content: string;
    createdAt: string;
  }): Promise<string>;
};

export type PostCallHarwickResult = {
  leadDocumentUpdated: boolean;
  callbackTaskId: string | null;
  showingTaskId: string | null;
  loggedMemoryIds: readonly string[];
  toolCallCount: number;
  reply: string;
};

function readString(rawFacts: Record<string, unknown>, key: string): string | null {
  const value = rawFacts[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function buildListingContextFor(params: {
  listing: PostCallHarwickListing | null;
  memory: readonly ListingMemory[];
}): HarwickAiListingMemory | null {
  if (params.listing === null) return null;
  const { listing } = params;
  const neighborhood = readString(listing.rawFacts, "neighborhood");
  const city = readString(listing.rawFacts, "city");
  const facts = [
    listing.mlsNumber === null ? null : `MLS ${listing.mlsNumber}`,
    neighborhood,
    city,
    listing.beds === null ? null : `${listing.beds} beds`,
    listing.baths === null ? null : `${listing.baths} baths`,
    ...params.memory
      .filter((row) => row.content.trim().length > 0)
      .map((row) => row.visibility === "public" ? row.content : `internal: ${row.content}`),
  ].filter((fact): fact is string => fact !== null);
  return {
    listingId: listing.id,
    label: listing.address,
    address: listing.address,
    price: listing.price === null ? null : new Intl.NumberFormat("en-US", { currency: "USD", maximumFractionDigits: 0, style: "currency" }).format(listing.price),
    status: listing.status,
    beds: listing.beds === null ? null : String(listing.beds),
    baths: listing.baths === null ? null : String(listing.baths),
    area: neighborhood ?? city,
    facts,
    lastVerifiedAt: listing.verifiedAt,
  };
}

function urgencyFromTool(payload: unknown): "now" | "today" | "this_week" {
  if (typeof payload !== "object" || payload === null) return "today";
  const raw = (payload as Record<string, unknown>)["urgency"];
  return raw === "now" || raw === "today" || raw === "this_week" ? raw : "today";
}

function readStringField(payload: unknown, key: string): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export async function runPostCallHarwickTurn(params: {
  callId: string;
  leadId: string;
  workspaceId: string;
  listingId: string | null;
  transcript: string;
  callDurationMs: number | null;
  repository: PostCallHarwickRepository;
  runtimeClient: HarwickAiRuntimeClient;
  now?: () => Date;
}): Promise<PostCallHarwickResult | null> {
  const [workspace, lead, listing] = await Promise.all([
    params.repository.findWorkspace(params.workspaceId),
    params.repository.findLead(params.leadId),
    params.listingId === null
      ? Promise.resolve(null)
      : params.repository.findListing({ workspaceId: params.workspaceId, listingId: params.listingId }),
  ]);

  // Either side missing = nothing to write against; bail before spending model tokens.
  if (workspace === null || lead === null) return null;

  const memory = listing === null
    ? []
    : await params.repository.findListingMemory({ workspaceId: params.workspaceId, listingId: listing.id });

  const now = params.now?.() ?? new Date();
  const occurredAt = now.toISOString();

  const inboundText = [
    `Call completed (${params.callDurationMs === null ? "duration unknown" : `${Math.round(params.callDurationMs / 1000)}s`}).`,
    "Transcript:",
    params.transcript,
  ].join("\n");

  const runtimeInput = HarwickAiRuntimeInputSchema.parse({
    workspaceName: workspace.name,
    channel: "manual",
    inboundText,
    conversation: [],
    state: {
      workspaceId: workspace.id,
      leadId: lead.id,
      providerThreadId: null,
      channel: "manual",
      automationMode: "ai_on",
      currentIntent: "post_call_synthesis",
      qualification: {
        name: lead.fullName,
        phone: lead.phone,
        email: lead.email,
        leadType: "unknown",
        intent: "unknown",
        timeline: null,
        budget: null,
        targetArea: null,
        propertyType: null,
        financingStatus: "unknown",
        score: 0,
      },
      knownFacts: [],
      lastAiAction: null,
      assignedAgentName: null,
      sourceOwnerName: workspace.name,
    },
    toneProfile: {
      name: `${workspace.name} post-call synthesis`,
      voice: "decisive, concise, specific, operator-facing — write for the agent reading this in 10 seconds",
      bannedPhrases: [],
      preferredPhrases: [],
      emojiPolicy: "none",
      signature: null,
    },
    postContext: null,
    listingContext: buildListingContextFor({ listing, memory }),
    calendarContext: [],
    buyerBlueprintUrl: null,
    // The principle the codex session named: Retell talked live, Harwick
    // thinks after, listings are the common ground. Tell the model that
    // here so the tool selection makes sense.
    policyNarrative: "Synthesize what happened on this call. Update the lead document with refined qualification, queue a callback task if the operator needs to call back, queue a showing approval if the caller asked for one, route the lead if intent + budget warrant it, and log a listing memory note if a recurring question came up that future visitors would benefit from. Never invent facts not in the transcript or listing context. Prefer concrete next actions over restating what the caller said.",
    leadDocument: lead.qualificationSummary ?? `Lead ${lead.fullName ?? "(no name)"} called about ${listing?.address ?? "the workspace number"}.`,
  });

  let turn: HarwickAiTurn;
  try {
    turn = await params.runtimeClient.runTurn(runtimeInput);
  } catch (error) {
    console.error("[post-call-harwick] runtime turn failed", {
      callId: params.callId,
      leadId: params.leadId,
      workspaceId: params.workspaceId,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  // The lead-event anchors everything to this specific call so the operator
  // sees one trail: phone call → Harwick read → here's what's queued.
  await params.repository.insertLeadEvent({
    workspaceId: workspace.id,
    leadId: lead.id,
    callId: params.callId,
    summary: turn.documentUpdate.length > 0
      ? turn.documentUpdate
      : turn.handoffBrief ?? `Post-call Harwick synthesis: ${turn.reply.slice(0, 240)}`,
    occurredAt,
  });

  // Patch the lead document with refined qualification picked up on the call.
  const statePatch = (turn.statePatch ?? {}) as Record<string, unknown>;
  const qualificationPatch: PostCallQualificationPatch = {};
  if (typeof statePatch["leadType"] === "string" && ["buyer", "seller", "renter", "investor", "unknown"].includes(statePatch["leadType"])) {
    qualificationPatch.leadType = statePatch["leadType"] as PostCallQualificationPatch["leadType"];
  }
  if (typeof statePatch["intent"] === "string" && ["high", "medium", "low", "spam", "unknown"].includes(statePatch["intent"])) {
    qualificationPatch.intent = statePatch["intent"] as PostCallQualificationPatch["intent"];
  }
  if (typeof statePatch["timeline"] === "string") qualificationPatch.timeline = statePatch["timeline"];
  if (typeof statePatch["budget"] === "string" || typeof statePatch["budget"] === "number") {
    qualificationPatch.budget = statePatch["budget"] as string | number;
  }
  if (typeof statePatch["targetArea"] === "string") qualificationPatch.targetArea = statePatch["targetArea"];
  if (typeof statePatch["propertyType"] === "string") qualificationPatch.propertyType = statePatch["propertyType"];
  if (typeof statePatch["financingStatus"] === "string" && ["preapproved", "cash", "needs_lender", "unknown"].includes(statePatch["financingStatus"])) {
    qualificationPatch.financingStatus = statePatch["financingStatus"] as PostCallQualificationPatch["financingStatus"];
  }
  // Note: HarwickAiStatePatch doesn't carry `score` — score is on the input
  // qualification only. If post-call score evolution becomes useful, extend
  // the state-patch schema first.

  let leadDocumentUpdated = false;
  if (Object.keys(qualificationPatch).length > 0 || turn.documentUpdate.length > 0) {
    await params.repository.updateLeadDocument({
      leadId: lead.id,
      qualification: qualificationPatch,
      qualificationSummary: turn.documentUpdate.length > 0
        ? turn.documentUpdate
        : lead.qualificationSummary ?? "",
      updatedAt: occurredAt,
    });
    leadDocumentUpdated = true;
  }

  // Apply tool calls in priority order: callback task → showing approval → memory.
  let callbackTaskId: string | null = null;
  let showingTaskId: string | null = null;
  const loggedMemoryIds: string[] = [];

  for (const toolCall of turn.toolCalls as readonly HarwickAiToolCall[]) {
    if (toolCall.tool === "queue_callback_task" && callbackTaskId === null) {
      callbackTaskId = await params.repository.insertCallbackTask({
        workspaceId: workspace.id,
        leadId: lead.id,
        listingId: listing?.id ?? null,
        assignedMemberId: lead.assignedAgentId,
        reason: readStringField(toolCall.payload, "reason") ?? turn.reply,
        urgency: urgencyFromTool(toolCall.payload),
        dueAt: readStringField(toolCall.payload, "dueAt"),
        createdAt: occurredAt,
      });
    }
    if (toolCall.tool === "request_showing_approval" && showingTaskId === null && listing !== null) {
      showingTaskId = await params.repository.insertShowingApproval({
        workspaceId: workspace.id,
        leadId: lead.id,
        listingId: listing.id,
        assignedMemberId: lead.assignedAgentId,
        summary: readStringField(toolCall.payload, "reason") ?? turn.reply,
        requestedStartAt: readStringField(toolCall.payload, "requestedStartAt"),
        requestedEndAt: readStringField(toolCall.payload, "requestedEndAt"),
        createdAt: occurredAt,
      });
    }
    if (toolCall.tool === "log_listing_memory" && listing !== null) {
      const content = readStringField(toolCall.payload, "content");
      if (content !== null) {
        const kindRaw = readStringField(toolCall.payload, "kind") ?? "context_note";
        const kind = (["common_question", "common_objection", "context_note", "incentive", "sales_angle"] as const).includes(
          kindRaw as "context_note",
        ) ? kindRaw as "context_note" : "context_note";
        const visibility = readStringField(toolCall.payload, "visibility") === "public" ? "public" : "internal";
        const id = await params.repository.logListingMemory({
          workspaceId: workspace.id,
          listingId: listing.id,
          kind,
          visibility,
          prompt: readStringField(toolCall.payload, "prompt"),
          content,
          createdAt: occurredAt,
        });
        loggedMemoryIds.push(id);
      }
    }
  }

  return {
    leadDocumentUpdated,
    callbackTaskId,
    showingTaskId,
    loggedMemoryIds,
    toolCallCount: turn.toolCalls.length,
    reply: turn.reply,
  };
}
