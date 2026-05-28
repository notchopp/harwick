import { describe, expect, it } from "vitest";

import type { ListingChatGateJudge } from "./listing-chat-gate-judge";
import { buildListingChatTools, type ListingChatTurnState } from "./listing-chat-tools";
import type { PublicListingChatListing, PublicListingChatRepository } from "./public-listing-chat";

/**
 * Fake gate judge for unit tests — pure decision table, no LLM. Returns
 * `ok: false` for the exact "trusted lender network" / "buyer is interested"
 * style filler, `ok: true` otherwise. Lets us assert the wiring without
 * paying for OpenAI calls.
 */
function fakeGateJudge(): ListingChatGateJudge {
  return async ({ value }) => {
    const trimmed = value.trim().toLowerCase();
    const isFiller =
      trimmed === "trusted lender network"
      || trimmed === "agent will reach out"
      || trimmed === "lender intro"
      || trimmed === "callback"
      || trimmed === "buyer is interested"
      || trimmed === "wants more info"
      || trimmed.startsWith("we'll have someone reach out");
    if (isFiller) {
      return { ok: false, coaching: "Reason is too vague — name who's calling and what about." };
    }
    return { ok: true };
  };
}

const workspaceId = "649a4f39-2c40-4a51-ae2c-2ac0f8fa5d6f";
const focusListingId = "0b77809a-344d-4314-872b-ff129f5706f5";
const activeListingId = "54eb11cd-a4e4-4337-9f97-88330e9c3550";

function listing(id: string, values: Partial<PublicListingChatListing> = {}): PublicListingChatListing {
  return {
    id,
    address: values.address ?? "Lennar at Arabella on the Prairie, Richmond, TX",
    workspaceId,
    mlsNumber: null,
    status: values.status ?? "Sold",
    price: values.price ?? 340_000,
    beds: values.beds ?? 4,
    baths: values.baths ?? 3,
    rawFacts: values.rawFacts ?? {},
    verifiedAt: null,
    areaIntel: null,
  };
}

function repository(): PublicListingChatRepository {
  const noop = async () => {};
  const active = listing(activeListingId, {
    address: "78 Banyan Row",
    status: "Active",
    price: 1_150_000,
    beds: 3,
    baths: 3,
    rawFacts: { neighborhood: "South Miami", propertyType: "townhome" },
  });
  return {
    findWorkspaceBySlug: async () => ({ id: workspaceId, name: "Prestige Realty" }),
    findListing: async ({ listingId }) => (listingId === activeListingId ? active : listing(focusListingId)),
    findOtherListings: async ({ criteria }) => {
      const hasFilter = criteria.areaContains !== null
        || criteria.maxPrice !== null
        || criteria.minPrice !== null
        || criteria.minBeds !== null
        || criteria.propertyType !== null;
      return hasFilter ? [] : [active];
    },
    findWorkspaceTeam: async () => [],
    findVisitorContext: async () => ({
      isReturning: false,
      lastSeenAt: null,
      priorQualification: {},
      priorListingsAskedAbout: [],
      recentTranscript: [],
      promotedLead: null,
    }),
    findListingMemory: async () => [],
    findSessionByToken: async () => null,
    createSession: async ({ sessionToken }) => ({ id: "session-id", sessionToken, qualification: {}, promotedLeadId: null }),
    findRecentTurns: async () => [],
    appendTurn: noop,
    updateSessionQualification: noop,
    linkSessionLead: noop,
    findExistingLead: async () => null,
    insertLead: async () => ({ id: "lead-id", assignedAgentId: null }),
    updateLead: noop,
    insertLeadEvent: noop,
    insertShowingTask: async () => "showing-task-id",
    insertCallbackTask: async () => "callback-task-id",
    insertCMARequest: async () => "cma-task-id",
    findShowingsForVisitor: async () => [],
    findAgentByMemberId: async () => null,
  };
}

type ShowingTool = {
  execute(input: {
    requestedStartAt: string | null;
    requestedEndAt: string | null;
    preferredAgentMemberId: string | null;
    contactPhone: string;
    contactName: string | null;
    contactEmail: string | null;
    notes: string;
  }): Promise<Record<string, unknown>>;
};

type CallbackTool = {
  execute(input: {
    contactPhone: string;
    contactName: string | null;
    reason: string;
    urgency: "now" | "today" | "this_week";
    preferredAgentMemberId: string | null;
  }): Promise<Record<string, unknown>>;
};

type CaptureLeadTool = {
  execute(input: {
    fullName: string | null;
    phone: string;
    email: string | null;
    funnelType: "buyer" | "seller" | "investor" | "renter" | "browser" | "unknown";
    intent: "question" | "showing";
    intentTier: "high" | "medium" | "low" | "spam" | "unknown";
    timeline: string | null;
    budget: string | null;
    targetArea: string | null;
    financingStatus: "preapproved" | "cash" | "needs_lender" | "unknown";
    conversationSummary: string;
  }): Promise<Record<string, unknown>>;
};

describe("listing chat tools", () => {
  it("returns broader active inventory when stale filters produce zero exact matches", async () => {
    const state: ListingChatTurnState = { qualificationDelta: {}, capturedLead: null };
    const tools = buildListingChatTools({
      repository: repository(),
      workspaceId,
      workspaceName: "Prestige Realty",
      listing: listing(focusListingId),
      priorQualification: { targetArea: "Richmond", budget: "400K" },
      team: [],
      assignedAgent: null,
      braveSearchApiKey: undefined,
      occurredAt: new Date().toISOString(),
      state,
    });

    const searchTool = tools.search_workspace_listings as unknown as {
      execute(input: {
        minPrice: number | null;
        maxPrice: number | null;
        minBeds: number | null;
        areaContains: string | null;
        propertyType: string | null;
        limit: number;
      }): Promise<Record<string, unknown>>;
    };
    const result = await searchTool.execute({
      minPrice: null,
      maxPrice: 400_000,
      minBeds: 4,
      areaContains: "Richmond",
      propertyType: "single-family",
      limit: 4,
    });

    expect(result["count"]).toBe(0);
    expect(result["broadened"]).toBe(true);
    expect(result["broadenedCount"]).toBe(1);
    expect(result["message"]).toMatch(/active inventory exists/i);
    expect(result["broadenedListings"]).toEqual([
      expect.objectContaining({
        id: activeListingId,
        address: "78 Banyan Row",
      }),
    ]);
  });

  it("blocks showing task creation until name and budget are known", async () => {
    let insertedShowing = false;
    const state: ListingChatTurnState = { qualificationDelta: {}, capturedLead: null };
    const repo = {
      ...repository(),
      insertShowingTask: async () => {
        insertedShowing = true;
        return "showing-task-id";
      },
    } satisfies PublicListingChatRepository;
    const tools = buildListingChatTools({
      repository: repo,
      workspaceId,
      workspaceName: "Prestige Realty",
      listing: listing(activeListingId, { status: "Active" }),
      priorQualification: { funnelType: "buyer" },
      team: [],
      assignedAgent: null,
      braveSearchApiKey: undefined,
      occurredAt: "2026-05-28T00:52:00.000Z",
      latestVisitorText: "can we do tuesday 4pm?",
      state,
    });

    const result = await (tools.propose_showing_window as unknown as ShowingTool).execute({
      requestedStartAt: "2026-06-06T16:00:00-05:00",
      requestedEndAt: "2026-06-06T17:00:00-05:00",
      preferredAgentMemberId: null,
      contactPhone: "4848456393",
      contactName: null,
      contactEmail: null,
      notes: "Buyer wants a showing.",
    });

    expect(result["error"]).toMatch(/Name required/i);
    expect(insertedShowing).toBe(false);
    expect(state.capturedLead).toBeNull();
  });

  it("uses the visitor's weekday and time text for showing cards", async () => {
    let requestedStartAt: string | null = null;
    const state: ListingChatTurnState = { qualificationDelta: {}, capturedLead: null };
    const repo = {
      ...repository(),
      insertShowingTask: async (params) => {
        requestedStartAt = params.requestedStartAt ?? null;
        return "showing-task-id";
      },
    } satisfies PublicListingChatRepository;
    const tools = buildListingChatTools({
      repository: repo,
      workspaceId,
      workspaceName: "Prestige Realty",
      listing: listing(activeListingId, { status: "Active" }),
      priorQualification: { funnelType: "buyer", name: "Clinton", budget: "under $750k" },
      team: [],
      assignedAgent: null,
      braveSearchApiKey: undefined,
      occurredAt: "2026-05-28T00:52:00.000Z",
      latestVisitorText: "can we do tuesday 4pm?",
      state,
    });

    const result = await (tools.propose_showing_window as unknown as ShowingTool).execute({
      requestedStartAt: "2026-06-06T16:00:00-05:00",
      requestedEndAt: "2026-06-06T17:00:00-05:00",
      preferredAgentMemberId: null,
      contactPhone: "4848456393",
      contactName: null,
      contactEmail: null,
      notes: "Buyer wants a showing Tuesday at 4pm.",
    });

    expect(result).toEqual(expect.objectContaining({
      kind: "showing_proposal_card",
      requestedStartAt: "2026-06-02T16:00:00-05:00",
      requestedEndAt: "2026-06-02T17:00:00-05:00",
    }));
    expect(requestedStartAt).toBe("2026-06-02T16:00:00-05:00");
  });

  it("blocks callback creation until first name is known", async () => {
    let insertedCallback = false;
    const state: ListingChatTurnState = { qualificationDelta: {}, capturedLead: null };
    const repo = {
      ...repository(),
      insertCallbackTask: async () => {
        insertedCallback = true;
        return "callback-task-id";
      },
    } satisfies PublicListingChatRepository;
    const tools = buildListingChatTools({
      repository: repo,
      workspaceId,
      workspaceName: "Prestige Realty",
      listing: listing(activeListingId, { status: "Active" }),
      priorQualification: { funnelType: "buyer" },
      team: [],
      assignedAgent: null,
      braveSearchApiKey: undefined,
      occurredAt: "2026-05-28T01:03:30.000Z",
      state,
    });

    const result = await (tools.request_agent_callback as unknown as CallbackTool).execute({
      contactPhone: "4848456393",
      contactName: null,
      reason: "First-time cash buyer wants lender intro for $625k on 18611 Parkland Crossing, $200k down.",
      urgency: "this_week",
      preferredAgentMemberId: null,
    });

    expect(result["error"]).toMatch(/First name required/i);
    expect(insertedCallback).toBe(false);
    expect(state.capturedLead).toBeNull();
  });

  it("blocks callback creation when the LLM gate judges the reason vague (no 'trusted lender network' anti-pattern)", async () => {
    let insertedCallback = false;
    const state: ListingChatTurnState = { qualificationDelta: {}, capturedLead: null };
    const repo = {
      ...repository(),
      insertCallbackTask: async () => {
        insertedCallback = true;
        return "callback-task-id";
      },
    } satisfies PublicListingChatRepository;
    const tools = buildListingChatTools({
      repository: repo,
      workspaceId,
      workspaceName: "Prestige Realty",
      listing: listing(activeListingId, { status: "Active" }),
      priorQualification: { funnelType: "buyer", name: "Clinton" },
      team: [],
      assignedAgent: null,
      braveSearchApiKey: undefined,
      occurredAt: "2026-05-28T01:03:30.000Z",
      gateJudge: fakeGateJudge(),
      state,
    });

    const result = await (tools.request_agent_callback as unknown as CallbackTool).execute({
      contactPhone: "4848456393",
      contactName: null,
      reason: "trusted lender network",
      urgency: "this_week",
      preferredAgentMemberId: null,
    });

    expect(result["error"]).toMatch(/vague/i);
    expect(insertedCallback).toBe(false);
    expect(state.capturedLead).toBeNull();
  });

  it("falls open when no gate judge is supplied (cheap length floor still rejects too-thin reasons)", async () => {
    const state: ListingChatTurnState = { qualificationDelta: {}, capturedLead: null };
    const tools = buildListingChatTools({
      repository: repository(),
      workspaceId,
      workspaceName: "Prestige Realty",
      listing: listing(activeListingId, { status: "Active" }),
      priorQualification: { funnelType: "buyer", name: "Clinton" },
      team: [],
      assignedAgent: null,
      braveSearchApiKey: undefined,
      occurredAt: "2026-05-28T01:03:30.000Z",
      state,
    });

    // Too short — the length floor (10 chars) blocks this even without the judge.
    const tooShort = await (tools.request_agent_callback as unknown as CallbackTool).execute({
      contactPhone: "4848456393",
      contactName: null,
      reason: "callback",
      urgency: "this_week",
      preferredAgentMemberId: null,
    });
    expect(tooShort["error"]).toMatch(/too thin|vague/i);

    // Borderline filler that passes the length floor — without a judge, it's allowed
    // (we'd rather fail-open than block real handoffs on a flaky inference provider).
    const borderline = await (tools.request_agent_callback as unknown as CallbackTool).execute({
      contactPhone: "4848456393",
      contactName: null,
      reason: "trusted lender network",
      urgency: "this_week",
      preferredAgentMemberId: null,
    });
    expect(borderline["kind"]).toBe("callback_card");
  });

  it("returns callback card with assignedMemberName when an agent is assigned", async () => {
    const state: ListingChatTurnState = { qualificationDelta: {}, capturedLead: null };
    const tools = buildListingChatTools({
      repository: repository(),
      workspaceId,
      workspaceName: "Prestige Realty",
      listing: listing(activeListingId, { status: "Active" }),
      priorQualification: { funnelType: "buyer", name: "Clinton" },
      team: [
        {
          memberId: "member-tiana",
          displayName: "Tiana",
          role: "owner",
          specialties: null,
          avatarUrl: null,
        },
      ],
      assignedAgent: {
        memberId: "member-tiana",
        displayName: "Tiana",
        role: "owner",
        email: null,
        phone: null,
        specialties: null,
        avatarUrl: null,
      },
      braveSearchApiKey: undefined,
      occurredAt: "2026-05-28T01:03:30.000Z",
      state,
    });

    const result = await (tools.request_agent_callback as unknown as CallbackTool).execute({
      contactPhone: "4848456393",
      contactName: null,
      reason: "First-time cash buyer wants lender intro for $625k on 18611 Parkland Crossing, $200k down.",
      urgency: "this_week",
      preferredAgentMemberId: null,
    });

    expect(result).toEqual(expect.objectContaining({
      kind: "callback_card",
      assignedMemberName: "Tiana",
      urgency: "this_week",
    }));
    expect(state.capturedLead).not.toBeNull();
  });

  it("blocks lead capture until first name is known", async () => {
    let insertedLead = false;
    const state: ListingChatTurnState = { qualificationDelta: {}, capturedLead: null };
    const repo = {
      ...repository(),
      insertLead: async () => {
        insertedLead = true;
        return { id: "lead-id", assignedAgentId: null };
      },
    } satisfies PublicListingChatRepository;
    const tools = buildListingChatTools({
      repository: repo,
      workspaceId,
      workspaceName: "Prestige Realty",
      listing: listing(activeListingId, { status: "Active" }),
      priorQualification: { funnelType: "buyer" },
      team: [],
      assignedAgent: null,
      braveSearchApiKey: undefined,
      occurredAt: "2026-05-28T01:03:30.000Z",
      state,
    });

    const result = await (tools.capture_lead as unknown as CaptureLeadTool).execute({
      fullName: null,
      phone: "4848456393",
      email: null,
      funnelType: "buyer",
      intent: "question",
      intentTier: "medium",
      timeline: null,
      budget: null,
      targetArea: null,
      financingStatus: "cash",
      conversationSummary: "Single guy cash buyer looking at Cypress new construction, first home.",
    });

    expect(result["error"]).toMatch(/First name required/i);
    expect(insertedLead).toBe(false);
    expect(state.capturedLead).toBeNull();
  });
});
