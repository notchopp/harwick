import type { HarwickAiRuntimeClient } from "@realty-ops/integrations";
import { describe, expect, it, vi } from "vitest";
import {
  handlePublicListingChat,
  PublicListingChatError,
  type PublicListingChatRepository,
} from "./public-listing-chat";

const workspaceId = "00000000-0000-0000-0000-000000000001";
const listingId = "00000000-0000-0000-0000-000000000003";

function createRepository(overrides: Partial<PublicListingChatRepository> = {}) {
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
  it("runs Harwick against persisted listing facts and returns qualification metadata", async () => {
    const { repository, mocks } = createRepository();
    const runtimeClient = createRuntime();

    await expect(handlePublicListingChat({
      workspaceSlug: "prestige-realty",
      request: {
        listingId,
        message: "Can I see this Saturday? Also how are the schools?",
        conversation: [
          {
            id: "m1",
            actor: "lead",
            body: "Is this still available?",
            occurredAt: "2026-05-07T14:00:00.000Z",
          },
        ],
        qualification: {
          leadType: "buyer",
          intent: "medium",
          timeline: "July",
        },
      },
      repository,
      runtimeClient,
    })).resolves.toMatchObject({
      nextAction: "request_showing_approval",
      missingFields: ["phone", "financing"],
      statePatch: {
        currentIntent: "showing_request",
        leadType: "buyer",
        intent: "high",
      },
    });

    expect(mocks.findListing).toHaveBeenCalledWith({ workspaceId, listingId });
    expect(runtimeClient.runTurn).toHaveBeenCalledWith(expect.objectContaining({
      workspaceName: "Prestige Realty",
      channel: "manual",
      inboundText: "Can I see this Saturday? Also how are the schools?",
      listingContext: expect.objectContaining({
        label: "KB Home at Sunterra, Katy, TX",
        price: "$295,000",
        area: "Sunterra",
        facts: expect.arrayContaining(["single family", "Sunterra", "1,680 sqft", "incentive: builder incentives available"]),
      }),
      state: expect.objectContaining({
        workspaceId,
        leadId: null,
        automationMode: "ai_on",
        qualification: expect.objectContaining({
          leadType: "buyer",
          intent: "medium",
          timeline: "July",
        }),
      }),
    }));
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
    })).rejects.toMatchObject(new PublicListingChatError("listing_not_found", 404));

    expect(runtimeClient.runTurn).not.toHaveBeenCalled();
  });
});
