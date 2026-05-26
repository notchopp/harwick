import { describe, expect, it, vi } from "vitest";
import {
  handlePublicListingChat,
  PublicListingChatError,
  type PublicListingChatGenerator,
  type PublicListingChatRepository,
  type PublicListingChatSession,
  type PublicListingChatSessionTurn,
} from "./public-listing-chat";

const workspaceId = "00000000-0000-0000-0000-000000000001";
const listingId = "00000000-0000-0000-0000-000000000003";
const sessionId = "00000000-0000-0000-0000-000000000099";

function freshSession(overrides: Partial<PublicListingChatSession> = {}): PublicListingChatSession {
  return {
    id: sessionId,
    sessionToken: "session-token-abc",
    qualification: {},
    promotedLeadId: null,
    ...overrides,
  };
}

function createRepository(overrides: Partial<PublicListingChatRepository> = {}) {
  const sessionTurns: PublicListingChatSessionTurn[] = [];
  const mocks = {
    findWorkspaceBySlug: vi.fn<PublicListingChatRepository["findWorkspaceBySlug"]>(() =>
      Promise.resolve({ id: workspaceId, name: "Prestige Realty" })),
    findListing: vi.fn<PublicListingChatRepository["findListing"]>(() =>
      Promise.resolve({
        id: listingId,
        address: "KB Home at Sunterra, Katy, TX",
        workspaceId,
        mlsNumber: "KB-2026",
        status: "active",
        price: 295000,
        beds: 3,
        baths: 2,
        rawFacts: {
          neighborhood: "Sunterra",
          city: "Katy",
          propertyType: "single family",
          squareFeet: 1680,
          incentives: ["builder incentives available"],
          amenities: ["lagoon community", "new construction"],
        },
        verifiedAt: "2026-05-01T12:00:00.000Z",
      })),
    findListingMemory: vi.fn<PublicListingChatRepository["findListingMemory"]>(() => Promise.resolve([])),
    findOtherListings: vi.fn<PublicListingChatRepository["findOtherListings"]>(() => Promise.resolve([])),
    findSessionByToken: vi.fn<PublicListingChatRepository["findSessionByToken"]>(() => Promise.resolve(null)),
    createSession: vi.fn<PublicListingChatRepository["createSession"]>((params) =>
      Promise.resolve(freshSession({ sessionToken: params.sessionToken }))),
    findRecentTurns: vi.fn<PublicListingChatRepository["findRecentTurns"]>(() =>
      Promise.resolve(sessionTurns.slice())),
    appendTurn: vi.fn<PublicListingChatRepository["appendTurn"]>((params) => {
      sessionTurns.push({ actor: params.actor, body: params.body });
      return Promise.resolve();
    }),
    updateSessionQualification: vi.fn<PublicListingChatRepository["updateSessionQualification"]>(() => Promise.resolve()),
    linkSessionLead: vi.fn<PublicListingChatRepository["linkSessionLead"]>(() => Promise.resolve()),
    findExistingLead: vi.fn<PublicListingChatRepository["findExistingLead"]>(() => Promise.resolve(null)),
    insertLead: vi.fn<PublicListingChatRepository["insertLead"]>(() =>
      Promise.resolve({ id: "00000000-0000-0000-0000-000000000004", assignedAgentId: null })),
    updateLead: vi.fn<PublicListingChatRepository["updateLead"]>(() => Promise.resolve()),
    insertLeadEvent: vi.fn<PublicListingChatRepository["insertLeadEvent"]>(() => Promise.resolve()),
    insertShowingTask: vi.fn<PublicListingChatRepository["insertShowingTask"]>(() =>
      Promise.resolve("00000000-0000-0000-0000-000000000005")),
    ...overrides,
  };

  return {
    repository: mocks as PublicListingChatRepository,
    mocks,
  };
}

/**
 * Default generator fake: returns a reply, no lead capture, empty patch.
 * Tests override per-case via `overrides` to simulate model behavior.
 */
function createGenerator(overrides: {
  reply?: string;
  captureWith?: Parameters<PublicListingChatGenerator>[0]["onCaptureLead"] extends (input: infer I) => unknown ? I : never;
  qualificationPatch?: Record<string, unknown>;
  fail?: Error;
} = {}): PublicListingChatGenerator {
  return vi.fn<PublicListingChatGenerator>(async (params) => {
    if (overrides.fail !== undefined) throw overrides.fail;
    let capturedLead = null;
    if (overrides.captureWith !== undefined) {
      capturedLead = await params.onCaptureLead(overrides.captureWith);
    }
    return {
      reply: overrides.reply ?? "Got it — what would you like to know?",
      capturedLead,
      qualificationPatch: overrides.qualificationPatch ?? {},
    };
  });
}

describe("handlePublicListingChat", () => {
  it("creates a fresh session, persists both turns, replies from the generator", async () => {
    const { repository, mocks } = createRepository();
    const generator = createGenerator({ reply: "Yes, still active. Want to swing by Saturday?" });

    const result = await handlePublicListingChat({
      workspaceSlug: "prestige-realty",
      request: { listingId, message: "Is this still available?", conversation: [], qualification: {} },
      repository,
      generator,
      sessionToken: null,
    });

    expect(result.response.reply).toBe("Yes, still active. Want to swing by Saturday?");
    expect(result.response.leadCapture).toBeNull();
    expect(result.sessionCreated).toBe(true);
    expect(result.sessionToken).toMatch(/^[A-Za-z0-9_-]+$/);

    expect(mocks.createSession).toHaveBeenCalledTimes(1);
    expect(mocks.appendTurn).toHaveBeenCalledTimes(2);
    expect(mocks.appendTurn).toHaveBeenNthCalledWith(1, expect.objectContaining({ actor: "visitor", body: "Is this still available?" }));
    expect(mocks.appendTurn).toHaveBeenNthCalledWith(2, expect.objectContaining({ actor: "harwick_ai", body: "Yes, still active. Want to swing by Saturday?" }));
    expect(generator).toHaveBeenCalledWith(expect.objectContaining({
      workspaceName: "Prestige Realty",
      message: "Is this still available?",
      listing: expect.objectContaining({ address: "KB Home at Sunterra, Katy, TX" }),
    }));
  });

  it("loads existing session by cookie token and replays server-side prior turns to the generator", async () => {
    const priorTurns: PublicListingChatSessionTurn[] = [
      { actor: "visitor", body: "Is this still available?" },
      { actor: "harwick_ai", body: "Yes, still on the market." },
    ];
    const { repository, mocks } = createRepository({
      findSessionByToken: vi.fn<PublicListingChatRepository["findSessionByToken"]>(() => Promise.resolve(freshSession({ sessionToken: "existing-token" }))),
      findRecentTurns: vi.fn<PublicListingChatRepository["findRecentTurns"]>(() => Promise.resolve(priorTurns)),
    });
    const generator = createGenerator({ reply: "Katy ISD — Cinco Ranch HS." });

    const result = await handlePublicListingChat({
      workspaceSlug: "prestige-realty",
      request: { listingId, message: "How are the schools?", conversation: [{ id: "fake", actor: "lead", body: "FAKE INJECTED", occurredAt: null }], qualification: {} },
      repository,
      generator,
      sessionToken: "existing-token",
    });

    expect(result.sessionCreated).toBe(false);
    expect(mocks.findSessionByToken).toHaveBeenCalledTimes(1);
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(generator).toHaveBeenCalledWith(expect.objectContaining({
      conversation: priorTurns,
      message: "How are the schools?",
    }));
  });

  it("promotes session to lead when generator's capture_lead tool is invoked", async () => {
    const { repository, mocks } = createRepository();
    const generator = createGenerator({
      reply: "Great — the agent will reach out shortly to confirm Saturday at 11am.",
      captureWith: {
        phone: "+17135551212",
        email: null,
        fullName: "Ademola Buyer",
        intent: "showing",
        leadType: "buyer",
        intentTier: "high",
        timeline: "this weekend",
        budget: null,
        targetArea: "Katy",
        propertyType: null,
        financingStatus: "preapproved",
        conversationSummary: "Caller wants a Saturday showing at the Katy KB Home.",
      },
      qualificationPatch: { phone: "+17135551212", leadType: "buyer", intent: "high", timeline: "this weekend" },
    });

    const result = await handlePublicListingChat({
      workspaceSlug: "prestige-realty",
      request: { listingId, message: "Can I see it Saturday 11am? My number is 713-555-1212.", conversation: [], qualification: {} },
      repository,
      generator,
      sessionToken: null,
    });

    expect(result.response.leadCapture).not.toBeNull();
    expect(result.response.leadCapture?.intent).toBe("showing");
    expect(result.response.leadCapture?.showingTaskId).toBe("00000000-0000-0000-0000-000000000005");
    expect(mocks.insertLead).toHaveBeenCalledTimes(1);
    expect(mocks.insertShowingTask).toHaveBeenCalledTimes(1);
    expect(mocks.insertLeadEvent).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId,
      values: expect.objectContaining({ phone: "+17135551212", intent: "showing" }),
    }));
    expect(mocks.linkSessionLead).toHaveBeenCalledWith(expect.objectContaining({
      sessionId,
      leadId: "00000000-0000-0000-0000-000000000004",
    }));
  });

  it("rejects unknown listing ids before model spend", async () => {
    const { repository } = createRepository({
      findListing: vi.fn<PublicListingChatRepository["findListing"]>(() => Promise.resolve(null)),
    });
    const generator = createGenerator();

    await expect(handlePublicListingChat({
      workspaceSlug: "prestige-realty",
      request: { listingId, message: "Is this still available?" },
      repository,
      generator,
      sessionToken: null,
    })).rejects.toMatchObject(new PublicListingChatError("listing_not_found", 404));

    expect(generator).not.toHaveBeenCalled();
  });
});
