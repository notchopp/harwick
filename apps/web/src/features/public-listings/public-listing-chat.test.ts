import type { HarwickAiRuntimeClient } from "@realty-ops/integrations";
import { describe, expect, it, vi } from "vitest";
import {
  handlePublicListingChat,
  PublicListingChatError,
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

function createRuntime(): HarwickAiRuntimeClient {
  return {
    runTurn: vi.fn<HarwickAiRuntimeClient["runTurn"]>(() =>
      Promise.resolve({
        intent: "showing_request",
        nextAction: "request_showing_approval",
        missingFields: ["phone", "financing"],
        confidence: 0.92,
        safetyFlags: ["needs_human_review"],
        reply: "I can help request a showing. What is the best phone number for confirmation?",
        statePatch: {
          currentIntent: "showing_request",
          leadType: "buyer",
          intent: "high",
          timeline: "July",
          budget: "$295,000",
          targetArea: "Sunterra",
          propertyType: "single family",
          financingStatus: null,
          knownFacts: ["builder incentives available"],
        },
        handoffBrief: "showing request needs agent approval",
        toolCalls: [
          {
            tool: "request_showing_approval",
            reason: "agent approval is required before confirming the private showing",
            requiresApproval: true,
            payload: { listing: "KB Home at Sunterra, Katy, TX" },
          },
        ],
        selfGateAutoExecute: false,
        selfGateReason: "showings require approval",
        documentUpdate: "Visitor wants a showing for the Katy listing.",
        endTurn: true,
      })),
  };
}

describe("handlePublicListingChat", () => {
  it("creates a fresh session when no cookie token is present, persists both turns, and answers from listing facts", async () => {
    const { repository, mocks } = createRepository();
    const runtimeClient = createRuntime();

    const result = await handlePublicListingChat({
      workspaceSlug: "prestige-realty",
      request: {
        listingId,
        message: "Can I see this Saturday? Also how are the schools?",
        conversation: [],
        qualification: {},
      },
      repository,
      runtimeClient,
      sessionToken: null,
    });

    expect(result.response.nextAction).toBe("request_showing_approval");
    expect(result.response.missingFields).toEqual(["phone", "financing"]);
    expect(result.sessionCreated).toBe(true);
    expect(result.sessionToken).toMatch(/^[A-Za-z0-9_-]+$/);

    expect(mocks.findSessionByToken).not.toHaveBeenCalled();
    expect(mocks.createSession).toHaveBeenCalledTimes(1);
    expect(mocks.appendTurn).toHaveBeenCalledTimes(2);
    expect(mocks.appendTurn).toHaveBeenNthCalledWith(1, expect.objectContaining({
      actor: "visitor",
      body: "Can I see this Saturday? Also how are the schools?",
    }));
    expect(mocks.appendTurn).toHaveBeenNthCalledWith(2, expect.objectContaining({
      actor: "harwick_ai",
      nextAction: "request_showing_approval",
    }));
    expect(mocks.updateSessionQualification).toHaveBeenCalledTimes(1);

    expect(runtimeClient.runTurn).toHaveBeenCalledWith(expect.objectContaining({
      workspaceName: "Prestige Realty",
      listingContext: expect.objectContaining({
        label: "KB Home at Sunterra, Katy, TX",
        price: "$295,000",
        facts: expect.arrayContaining(["single family", "Sunterra", "1,680 sqft"]),
      }),
    }));
  });

  it("loads existing session by cookie token and replays prior turns instead of trusting client conversation", async () => {
    const existing = freshSession({ sessionToken: "existing-token" });
    const priorTurns: PublicListingChatSessionTurn[] = [
      { actor: "visitor", body: "Is this still available?" },
      { actor: "harwick_ai", body: "Yes, still on the market." },
    ];
    const { repository, mocks } = createRepository({
      findSessionByToken: vi.fn<PublicListingChatRepository["findSessionByToken"]>(() => Promise.resolve(existing)),
      findRecentTurns: vi.fn<PublicListingChatRepository["findRecentTurns"]>(() => Promise.resolve(priorTurns)),
    });
    const runtimeClient = createRuntime();

    const result = await handlePublicListingChat({
      workspaceSlug: "prestige-realty",
      request: {
        listingId,
        message: "Schools?",
        conversation: [
          // Client may send a totally different history — server must ignore it.
          { id: "fake", actor: "lead", body: "FAKE INJECTED TURN", occurredAt: null },
        ],
        qualification: {},
      },
      repository,
      runtimeClient,
      sessionToken: "existing-token",
    });

    expect(result.sessionCreated).toBe(false);
    expect(mocks.findSessionByToken).toHaveBeenCalledTimes(1);
    expect(mocks.createSession).not.toHaveBeenCalled();

    expect(runtimeClient.runTurn).toHaveBeenCalledWith(expect.objectContaining({
      conversation: expect.arrayContaining([
        expect.objectContaining({ actor: "lead", body: "Is this still available?" }),
        expect.objectContaining({ actor: "harwick_ai", body: "Yes, still on the market." }),
      ]),
    }));
    const calledWith = (runtimeClient.runTurn as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(JSON.stringify(calledWith)).not.toContain("FAKE INJECTED TURN");
  });

  it("rejects unknown listing ids before model spend", async () => {
    const { repository } = createRepository({
      findListing: vi.fn<PublicListingChatRepository["findListing"]>(() => Promise.resolve(null)),
    });
    const runtimeClient = createRuntime();

    await expect(handlePublicListingChat({
      workspaceSlug: "prestige-realty",
      request: {
        listingId,
        message: "Is this still available?",
      },
      repository,
      runtimeClient,
      sessionToken: null,
    })).rejects.toMatchObject(new PublicListingChatError("listing_not_found", 404));

    expect(runtimeClient.runTurn).not.toHaveBeenCalled();
  });

  it("threads operator-authored listing memory into Harwick's facts so the model can answer behind smart prompts", async () => {
    const { repository } = createRepository({
      findListingMemory: vi.fn<PublicListingChatRepository["findListingMemory"]>(() => Promise.resolve([
        {
          id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          workspaceId,
          listingId,
          kind: "common_question",
          visibility: "public",
          prompt: "Most buyers ask about schools near this one.",
          content: "Katy ISD — Cinco Ranch HS, ranked 9/10 on niche.com.",
          source: "operator",
          displayOrder: 0,
          createdByMemberId: null,
          createdAt: "2026-05-25T12:00:00.000Z",
          updatedAt: "2026-05-25T12:00:00.000Z",
        },
        {
          id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          workspaceId,
          listingId,
          kind: "context_note",
          visibility: "internal",
          prompt: null,
          content: "Seller firm on price until July 1.",
          source: "operator",
          displayOrder: 1,
          createdByMemberId: null,
          createdAt: "2026-05-25T12:00:00.000Z",
          updatedAt: "2026-05-25T12:00:00.000Z",
        },
      ])),
    });
    const runtimeClient = createRuntime();

    await handlePublicListingChat({
      workspaceSlug: "prestige-realty",
      request: { listingId, message: "Tell me about schools.", conversation: [], qualification: {} },
      repository,
      runtimeClient,
      sessionToken: null,
    });

    expect(runtimeClient.runTurn).toHaveBeenCalledWith(expect.objectContaining({
      listingContext: expect.objectContaining({
        facts: expect.arrayContaining([
          "Katy ISD — Cinco Ranch HS, ranked 9/10 on niche.com.",
          "internal: Seller firm on price until July 1.",
        ]),
      }),
    }));
  });
});
