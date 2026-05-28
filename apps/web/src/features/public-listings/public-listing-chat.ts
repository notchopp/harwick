import {
  type HarwickAiMissingFieldRuntime,
  type HarwickAiToolCall,
  type ListingAreaIntel,
  type ListingMemory,
  type PublicListingChatQualification,
  type PublicListingPortalAgent,
  type PublicListingPortalShowing,
  type PublicListingPortalState,
} from "@realty-ops/core";

export type PublicListingChatSession = {
  id: string;
  sessionToken: string;
  qualification: PublicListingChatQualification;
  promotedLeadId: string | null;
};

export type PublicListingChatSessionTurn = {
  actor: "visitor" | "harwick_ai";
  body: string;
  occurredAt: string;
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
  // Pre-enriched area intelligence. Written by area-enrichment.ts during
  // listing import; read by the chat generator at zero per-message cost.
  // Null when enrichment hasn't run yet — generator falls back to the
  // runtime lookup_area_info tool (Brave Search).
  areaIntel: ListingAreaIntel | null;
};

export type PublicListingChatTeamMember = {
  memberId: string;
  displayName: string;
  role: string;
  email: string | null;
  phone: string | null;
  // Free-text from member profile — agents often note specialties
  // ("luxury / Cinco Ranch / first-time buyers"). Surfaced so Harwick
  // can match a buyer to the right agent.
  specialties: string | null;
  // workspace_members.avatar_url. Rendered as real photo on the
  // Meet-the-Team and assigned-agent cards; falls back to initials.
  avatarUrl: string | null;
};

/**
 * Returned by findVisitorContext — the moat that makes Harwick feel
 * like a real employee. Lets the chat greet returning visitors by name,
 * pick up where the prior conversation left off, and skip qualification
 * steps already covered.
 */
export type PublicListingChatVisitorContext = {
  isReturning: boolean;
  lastSeenAt: string | null;
  priorQualification: PublicListingChatQualification;
  // Listings this visitor has chatted about across ALL sessions on the
  // same cookie. firstAskedAt / lastAskedAt power the cross-listing
  // timeline rendered in the buyer-portal drawer.
  priorListingsAskedAbout: Array<{
    id: string;
    address: string;
    firstAskedAt: string | null;
    lastAskedAt: string | null;
  }>;
  // Last 6 turns from the most recent session — enough to feel like
  // continuity without ballooning the prompt budget.
  recentTranscript: Array<{ actor: "visitor" | "harwick_ai"; body: string }>;
  promotedLead: { id: string; fullName: string | null; assignedAgentId: string | null } | null;
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
  // Read-only public surface: the model can offer alternatives when the
  // current listing isn't the right fit. Filters mirror what a buyer
  // would actually narrow on: price range, beds, baths, area substring.
  // Excludes the current listing from results.
  findOtherListings(params: {
    workspaceId: string;
    excludeListingId: string;
    criteria: {
      minPrice?: number | null;
      maxPrice?: number | null;
      minBeds?: number | null;
      areaContains?: string | null;
      propertyType?: string | null;
    };
    limit: number;
  }): Promise<PublicListingChatListing[]>;
  // Returns active workspace members + their roles + specialties so
  // Harwick can match a buyer to the right agent or surface "the team"
  // when asked who they'd work with.
  findWorkspaceTeam(params: { workspaceId: string }): Promise<PublicListingChatTeamMember[]>;
  // Returns full visitor context across sessions — the moat. Called once
  // per chat turn at the top of the handler; the result feeds the system
  // prompt as a RETURNING VISITOR block when isReturning is true.
  findVisitorContext(params: {
    workspaceId: string;
    sessionToken: string | null;
  }): Promise<PublicListingChatVisitorContext>;
  // Seller funnel: queues a CMA prep task for the operator. Harwick
  // surfaces the request ("agent will run real comps and reach out")
  // but never pretends to deliver a CMA itself.
  insertCMARequest(params: {
    workspaceId: string;
    leadId: string;
    sellerPropertyAddress: string;
    sellerMotivation: string | null;
    sellerTimeline: string | null;
    sellerCondition: string | null;
    sellerPriceExpectation: string | null;
    createdAt: string;
  }): Promise<string>;
  // Generic "agent please call/text me" intent — when buyer wants a
  // human voice but no specific showing window yet.
  insertCallbackTask(params: {
    workspaceId: string;
    leadId: string;
    listingId: string | null;
    assignedMemberId: string | null;
    reason: string;
    urgency: "now" | "today" | "this_week";
    createdAt: string;
  }): Promise<string>;
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
    confidence?: number | null;
    missingFields?: HarwickAiMissingFieldRuntime[];
    safetyFlags?: string[];
    handoffBrief?: string | null;
    documentUpdate?: string | null;
    toolCalls?: HarwickAiToolCall[];
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
    workspaceId: string;
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
    requestedStartAt?: string | null;
    requestedEndAt?: string | null;
    createdAt: string;
  }): Promise<string>;
  // Returns showings tied to this visitor (via promoted lead). Each row
  // carries the assigned agent so the buyer portal can render
  // "Priya confirmed Saturday 11" without a separate agent lookup.
  findShowingsForVisitor(params: {
    workspaceId: string;
    leadId: string;
  }): Promise<PublicListingPortalShowing[]>;
  // Resolve a single agent by member id — used when the promoted lead
  // has an assigned_agent_id but no showing yet, so the portal can still
  // render the "Priya Shah is helping you" card pre-showing.
  findAgentByMemberId(params: {
    workspaceId: string;
    memberId: string;
  }): Promise<PublicListingPortalAgent | null>;
};

export class PublicListingChatError extends Error {
  constructor(
    readonly code: "workspace_not_found" | "listing_not_found",
    readonly status: 404,
  ) {
    super(code);
  }
}

function defaultVisitorContext(): PublicListingChatVisitorContext {
  return {
    isReturning: false,
    lastSeenAt: null,
    priorQualification: {},
    priorListingsAskedAbout: [],
    recentTranscript: [],
    promotedLead: null,
  };
}

/**
 * GET handler — returns the dynamic buyer-portal state for the cookie
 * holder on a given listing. No state mutation, no LLM call. Cheap.
 *
 * Two roles in one shape:
 *   - "Living buyer thread" — priorTurns is the chat scrollback the
 *     visitor sees on mount, profile is what the lower-right chip+drawer
 *     renders, showings/assignedAgent power the Meet-the-Team panel
 *     transition from generic → personalized.
 *   - "Listing trust block" — team is always returned so the
 *     Meet-the-Team Airbnb-style card has something to render even for
 *     anonymous first-time visitors (no session token).
 */
export type LoadPublicListingPortalStateResult = {
  state: PublicListingPortalState;
  sessionToken: string | null;
};

function summarizeQualificationAsFacts(q: PublicListingChatQualification): string[] {
  const facts: string[] = [];
  const lifeContext = (q.lifeContext ?? []).filter((entry): entry is string => typeof entry === "string");
  // Lead with the model's own per-turn observations (auto-appended to
  // knownFacts via note_qualification.learned). These are the highest-
  // signal entries because they're whatever the model thought was
  // notable in real visitor speech.
  for (const f of q.knownFacts ?? []) {
    if (typeof f === "string" && f.trim().length > 0) facts.push(f.trim());
  }
  if (q.targetArea !== null && q.targetArea !== undefined) facts.push(`Looking in ${q.targetArea}`);
  if (q.budget !== null && q.budget !== undefined) facts.push(`Budget around ${q.budget}`);
  if (q.timeline !== null && q.timeline !== undefined) facts.push(`Timeline: ${q.timeline}`);
  if (q.propertyType !== null && q.propertyType !== undefined) facts.push(`${q.propertyType} preferred`);
  if (q.financingStatus !== undefined && q.financingStatus !== "unknown") {
    facts.push(`Financing: ${q.financingStatus.replace(/_/g, " ")}`);
  }
  if (q.preApprovalStatus !== undefined && q.preApprovalStatus !== "unknown") {
    facts.push(`Pre-approval: ${q.preApprovalStatus.replace(/_/g, " ")}`);
  }
  if (q.hasBuyerRep === true) facts.push("Has buyer-rep agreement");
  if (q.sellerPropertyAddress !== null && q.sellerPropertyAddress !== undefined) {
    facts.push(`Selling ${q.sellerPropertyAddress}`);
  }
  // Dedupe (case-insensitive) — knownFacts and structured fields can
  // overlap (e.g. model says "Looking in Coral Gables" AND captures
  // targetArea = "Coral Gables").
  const seen = new Set<string>();
  return facts.filter((f) => {
    const k = normalizeMemoryFact(f);
    if (seen.has(k)) return false;
    if (duplicatesLifeContext(f, lifeContext)) return false;
    seen.add(k);
    return true;
  });
}

function normalizeMemoryFact(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(visitor|buyer|client|they|their|is|are|has|have|and|with|looking|for|needs|need|wants|want|must)\b/g, " ")
    .replace(/\bchildren\b/g, "kids")
    .replace(/\bsons\b/g, "kids")
    .replace(/\bdaughters\b/g, "kids")
    .replace(/\s+/g, " ")
    .trim();
}

function duplicatesLifeContext(fact: string, lifeContext: readonly string[]): boolean {
  const factKey = normalizeMemoryFact(fact);
  if (factKey.length < 3) return false;
  return lifeContext.some((life) => {
    const lifeKey = normalizeMemoryFact(life);
    if (lifeKey.length < 3) return false;
    return factKey.includes(lifeKey) || lifeKey.includes(factKey);
  });
}

export async function loadPublicListingPortalState(params: {
  workspaceSlug: string;
  listingId: string;
  sessionToken: string | null;
  repository: PublicListingChatRepository;
}): Promise<LoadPublicListingPortalStateResult> {
  const workspace = await params.repository.findWorkspaceBySlug(params.workspaceSlug);
  if (workspace === null) {
    throw new PublicListingChatError("workspace_not_found", 404);
  }
  const listing = await params.repository.findListing({
    workspaceId: workspace.id,
    listingId: params.listingId,
  });
  if (listing === null) {
    throw new PublicListingChatError("listing_not_found", 404);
  }

  // Team is unconditional — first-time anonymous visitors still get the
  // brokerage trust block.
  const team = await params.repository.findWorkspaceTeam({ workspaceId: workspace.id });

  // No cookie = empty portal but full team. The Meet-the-Team card still
  // renders; the chip/drawer/showings/scrollback simply aren't there yet.
  if (params.sessionToken === null) {
    const state: PublicListingPortalState = {
      priorTurns: [],
      profile: {
        isReturning: false,
        name: null,
        phone: null,
        email: null,
        lastSeenAt: null,
        headline: null,
        knownFacts: [],
        lifeContext: [],
        preferredShowingTimes: [],
        vibeNotes: [],
        listingsAskedAbout: [],
      },
      team: team.map((m) => ({
        memberId: m.memberId,
        displayName: m.displayName,
        role: m.role,
        specialties: m.specialties,
        avatarUrl: m.avatarUrl,
      })),
      assignedAgent: null,
      showings: [],
    };
    return { state, sessionToken: null };
  }

  const [session, visitorContext] = await Promise.all([
    params.repository.findSessionByToken({
      sessionToken: params.sessionToken,
      workspaceId: workspace.id,
      listingId: listing.id,
    }),
    params.repository.findVisitorContext({
      workspaceId: workspace.id,
      sessionToken: params.sessionToken,
    }).catch(() => defaultVisitorContext()),
  ]);

  const priorTurns: PublicListingPortalState["priorTurns"] = session === null
    ? []
    : (await params.repository.findRecentTurns({
        sessionId: session.id,
        limit: 40,
      }))
        .filter((turn) => turn.body.trim().length > 0)
        .map((turn) => ({
          actor: turn.actor,
          body: turn.body,
          occurredAt: turn.occurredAt,
        }));

  const liveQualification = session === null
    ? visitorContext.priorQualification
    : { ...visitorContext.priorQualification, ...session.qualification };

  // Showings + assigned agent only resolve if the visitor has been
  // promoted to a lead (capture_lead fired). Pre-promotion the portal
  // is just "thread + maybe team."
  const promotedLeadId = session?.promotedLeadId ?? visitorContext.promotedLead?.id ?? null;
  const promotedAgentId = visitorContext.promotedLead?.assignedAgentId ?? null;
  const [showings, assignedAgent] = promotedLeadId === null
    ? [[] as PublicListingPortalShowing[], null as PublicListingPortalAgent | null]
    : await Promise.all([
        params.repository.findShowingsForVisitor({
          workspaceId: workspace.id,
          leadId: promotedLeadId,
        }),
        promotedAgentId === null
          ? Promise.resolve<PublicListingPortalAgent | null>(null)
          : params.repository.findAgentByMemberId({
              workspaceId: workspace.id,
              memberId: promotedAgentId,
            }),
      ]);

  // Prefer the agent attached to the most recent showing — it's the
  // person actually committed to this visitor's request. Falls back to
  // the lead's assigned_agent_id (set by routing) when no showing yet.
  const showingAgent = showings.find((s) => s.assignedAgent !== null)?.assignedAgent ?? null;
  const resolvedAgent = showingAgent ?? assignedAgent;

  const state: PublicListingPortalState = {
    priorTurns,
    profile: {
      isReturning: visitorContext.isReturning,
      name: liveQualification.name ?? null,
      phone: liveQualification.phone ?? null,
      email: liveQualification.email ?? null,
      lastSeenAt: visitorContext.lastSeenAt,
      headline: liveQualification.headline ?? null,
      knownFacts: summarizeQualificationAsFacts(liveQualification),
      lifeContext: (liveQualification.lifeContext ?? []).slice(0, 12),
      preferredShowingTimes: (liveQualification.preferredShowingTimes ?? []).slice(0, 8),
      vibeNotes: (liveQualification.vibeNotes ?? []).slice(0, 8),
      listingsAskedAbout: visitorContext.priorListingsAskedAbout,
    },
    team: team.map((m) => ({
      memberId: m.memberId,
      displayName: m.displayName,
      role: m.role,
      specialties: m.specialties,
      avatarUrl: m.avatarUrl,
    })),
    assignedAgent: resolvedAgent,
    showings,
  };
  return { state, sessionToken: session?.sessionToken ?? params.sessionToken };
}
