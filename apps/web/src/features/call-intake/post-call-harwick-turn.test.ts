import type { HarwickAiTurn } from "@realty-ops/core";
import type { HarwickAiRuntimeClient } from "@realty-ops/integrations";
import { describe, expect, it, vi } from "vitest";

import {
  runPostCallHarwickTurn,
  type PostCallHarwickRepository,
} from "./post-call-harwick-turn";

const workspaceId = "00000000-0000-0000-0000-000000000001";
const leadId = "00000000-0000-0000-0000-000000000002";
const listingId = "00000000-0000-0000-0000-000000000003";
const callId = "call_abc123";

function createRepository(overrides: Partial<PostCallHarwickRepository> = {}) {
  const mocks = {
    findWorkspace: vi.fn<PostCallHarwickRepository["findWorkspace"]>(() =>
      Promise.resolve({ id: workspaceId, name: "Prestige Realty" })),
    findLead: vi.fn<PostCallHarwickRepository["findLead"]>(() =>
      Promise.resolve({
        id: leadId,
        fullName: "Ademola Buyer",
        phone: "+17135551212",
        email: null,
        qualificationSummary: null,
        assignedAgentId: null,
      })),
    findListing: vi.fn<PostCallHarwickRepository["findListing"]>(() =>
      Promise.resolve({
        id: listingId,
        address: "KB Home at Sunterra, Katy, TX",
        mlsNumber: "KB-2026",
        status: "active",
        price: 295000,
        beds: 3,
        baths: 2,
        rawFacts: { neighborhood: "Sunterra", city: "Katy" },
        verifiedAt: "2026-05-01T12:00:00.000Z",
      })),
    findListingMemory: vi.fn<PostCallHarwickRepository["findListingMemory"]>(() => Promise.resolve([])),
    updateLeadDocument: vi.fn<PostCallHarwickRepository["updateLeadDocument"]>(() => Promise.resolve()),
    insertLeadEvent: vi.fn<PostCallHarwickRepository["insertLeadEvent"]>(() => Promise.resolve()),
    insertCallbackTask: vi.fn<PostCallHarwickRepository["insertCallbackTask"]>(() =>
      Promise.resolve("00000000-0000-0000-0000-000000000010")),
    insertShowingApproval: vi.fn<PostCallHarwickRepository["insertShowingApproval"]>(() =>
      Promise.resolve("00000000-0000-0000-0000-000000000011")),
    logListingMemory: vi.fn<PostCallHarwickRepository["logListingMemory"]>(() =>
      Promise.resolve("00000000-0000-0000-0000-000000000012")),
    ...overrides,
  };
  return { repository: mocks as PostCallHarwickRepository, mocks };
}

function createRuntime(overrides: Partial<HarwickAiTurn> = {}): HarwickAiRuntimeClient {
  const base: HarwickAiTurn = {
    intent: "showing_request" as const,
        nextAction: "request_showing_approval",
        missingFields: [],
        confidence: 0.84,
        safetyFlags: [],
        reply: "Lead wants a Saturday showing for the Katy KB Home; queue agent approval and a same-day callback.",
        statePatch: {
          currentIntent: "showing_request",
          leadType: "buyer",
          intent: "high",
          timeline: "this weekend",
          budget: null,
          targetArea: null,
          propertyType: null,
          financingStatus: null,
          knownFacts: [],
        },
        handoffBrief: "Saturday 11am ideal; confirm with agent and call back.",
        toolCalls: [
          {
            tool: "queue_callback_task",
            reason: "Confirm showing time and answer financing question after agent check.",
            requiresApproval: true,
            payload: { reason: "Confirm Saturday showing window", urgency: "today" },
          },
          {
            tool: "request_showing_approval",
            reason: "Caller asked for a Saturday 11am showing.",
            requiresApproval: true,
            payload: { reason: "Saturday 11am ask", requestedStartAt: "2026-05-30T11:00:00.000Z", requestedEndAt: "2026-05-30T11:30:00.000Z" },
          },
          {
            tool: "log_listing_memory",
            reason: "Visitor asked about schools — store as common_question for this listing.",
            requiresApproval: false,
            payload: { kind: "common_question", visibility: "public", prompt: "How are the schools nearby?", content: "Katy ISD; the local high school is Cinco Ranch HS." },
          },
        ],
        selfGateAutoExecute: false,
        selfGateReason: "post-call synthesis",
        documentUpdate: "Buyer, $290k range, weekend showing intent. Wants Saturday 11am.",
        endTurn: true,
  };
  return {
    runTurn: vi.fn<HarwickAiRuntimeClient["runTurn"]>(() => Promise.resolve({ ...base, ...overrides })),
  };
}

describe("runPostCallHarwickTurn", () => {
  it("synthesizes call → lead event + qualification patch + callback + showing + memory log", async () => {
    const { repository, mocks } = createRepository();
    const runtimeClient = createRuntime();

    const result = await runPostCallHarwickTurn({
      callId,
      leadId,
      workspaceId,
      listingId,
      transcript: "Caller asked about showing this Saturday and wanted to know about schools.",
      callDurationMs: 138_000,
      repository,
      runtimeClient,
    });

    expect(result).not.toBeNull();
    expect(result?.leadDocumentUpdated).toBe(true);
    expect(result?.callbackTaskId).toBe("00000000-0000-0000-0000-000000000010");
    expect(result?.showingTaskId).toBe("00000000-0000-0000-0000-000000000011");
    expect(result?.loggedMemoryIds).toEqual(["00000000-0000-0000-0000-000000000012"]);
    expect(result?.toolCallCount).toBe(3);

    expect(mocks.insertLeadEvent).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId, leadId, callId,
      summary: expect.stringContaining("Saturday"),
    }));
    expect(mocks.updateLeadDocument).toHaveBeenCalledWith(expect.objectContaining({
      leadId,
      qualification: expect.objectContaining({ leadType: "buyer", intent: "high", timeline: "this weekend" }),
    }));
    expect(mocks.insertCallbackTask).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId, leadId, listingId,
      reason: "Confirm Saturday showing window",
      urgency: "today",
    }));
    expect(mocks.insertShowingApproval).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId, leadId, listingId,
      requestedStartAt: "2026-05-30T11:00:00.000Z",
    }));
    expect(mocks.logListingMemory).toHaveBeenCalledWith(expect.objectContaining({
      kind: "common_question",
      visibility: "public",
      prompt: "How are the schools nearby?",
      content: expect.stringContaining("Cinco Ranch"),
    }));
  });

  it("bails before model spend when workspace or lead can't be loaded", async () => {
    const { repository } = createRepository({
      findLead: vi.fn<PostCallHarwickRepository["findLead"]>(() => Promise.resolve(null)),
    });
    const runtimeClient = createRuntime();

    const result = await runPostCallHarwickTurn({
      callId, leadId, workspaceId, listingId,
      transcript: "ignored",
      callDurationMs: null,
      repository,
      runtimeClient,
    });

    expect(result).toBeNull();
    expect(runtimeClient.runTurn).not.toHaveBeenCalled();
  });

  it("skips the showing approval tool call when no listing context exists", async () => {
    const { repository, mocks } = createRepository();
    const runtimeClient = createRuntime();

    const result = await runPostCallHarwickTurn({
      callId, leadId, workspaceId,
      listingId: null,
      transcript: "Caller asked general questions about the team.",
      callDurationMs: 60_000,
      repository,
      runtimeClient,
    });

    expect(result?.showingTaskId).toBeNull();
    expect(mocks.insertShowingApproval).not.toHaveBeenCalled();
    // Callback still fires (doesn't require listing context).
    expect(mocks.insertCallbackTask).toHaveBeenCalled();
  });

  it("returns null and does not persist when the runtime throws", async () => {
    const { repository, mocks } = createRepository();
    const runtimeClient: HarwickAiRuntimeClient = {
      runTurn: vi.fn(() => Promise.reject(new Error("model timeout"))),
    };

    const result = await runPostCallHarwickTurn({
      callId, leadId, workspaceId, listingId,
      transcript: "Caller asked about a showing.",
      callDurationMs: 90_000,
      repository,
      runtimeClient,
    });

    expect(result).toBeNull();
    expect(mocks.insertLeadEvent).not.toHaveBeenCalled();
    expect(mocks.insertCallbackTask).not.toHaveBeenCalled();
  });
});
