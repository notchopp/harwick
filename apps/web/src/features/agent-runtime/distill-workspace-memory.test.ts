import type { WorkspaceMemoryDocumentCreate } from "@realty-ops/core";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceMemoryRepository } from "../../lib/supabase/workspace-memory";
import { distillWorkspaceMemory } from "./distill-workspace-memory";

const workspaceId = "00000000-0000-0000-0000-000000000001";

function createRepository(params: {
  existing?: boolean;
  inserted?: WorkspaceMemoryDocumentCreate[];
  savedEmbeddings?: Array<{ memoryId: string; embedding: number[] }>;
  routingSignals?: Awaited<ReturnType<WorkspaceMemoryRepository["listRoutingOverrideSignals"]>>;
  operatorFeedbackSignals?: Awaited<ReturnType<WorkspaceMemoryRepository["listOperatorFeedbackSignals"]>>;
  leadOutcomeSignals?: Awaited<ReturnType<WorkspaceMemoryRepository["listLeadOutcomeSignals"]>>;
  marketSignals?: Awaited<ReturnType<WorkspaceMemoryRepository["listMarketSignals"]>>;
  sourceChannelSignals?: Awaited<ReturnType<WorkspaceMemoryRepository["listSourceChannelSignals"]>>;
  objectionSignals?: Awaited<ReturnType<WorkspaceMemoryRepository["listObjectionSignals"]>>;
}): WorkspaceMemoryRepository {
  return {
    listRuntimeMemoryDocuments: vi.fn(() => Promise.resolve([])),
    listReviewableMemoryDocuments: vi.fn(() => Promise.resolve([])),
    updateMemoryReview: vi.fn(() => Promise.reject(new Error("not implemented in test repository"))),
    semanticMemorySearch: vi.fn(() => Promise.resolve([])),
    saveMemoryEmbedding: vi.fn((input: {
      workspaceId: string;
      memoryId: string;
      embedding: number[];
      embeddingText: string;
    }) => {
      params.savedEmbeddings?.push({ memoryId: input.memoryId, embedding: input.embedding });
      return Promise.resolve();
    }),
    listRoutingOverrideSignals: vi.fn(() => Promise.resolve(params.routingSignals ?? [{
      workspaceId,
      outcomeCount: 3,
      latestObservedAt: "2026-05-05T12:00:00.000Z",
      operatorMemberIds: ["00000000-0000-0000-0000-000000000002"],
      aiSuggestedMemberIds: ["00000000-0000-0000-0000-000000000003"],
    }])),
    listOperatorFeedbackSignals: vi.fn(() => Promise.resolve(params.operatorFeedbackSignals ?? [])),
    listLeadOutcomeSignals: vi.fn(() => Promise.resolve(params.leadOutcomeSignals ?? [])),
    listMarketSignals: vi.fn(() => Promise.resolve(params.marketSignals ?? [])),
    listSourceChannelSignals: vi.fn(() => Promise.resolve(params.sourceChannelSignals ?? [])),
    listObjectionSignals: vi.fn(() => Promise.resolve(params.objectionSignals ?? [])),
    findRecentMemoryByTitle: vi.fn(() => Promise.resolve(params.existing === true ? { id: "existing-memory" } : null)),
    insertMemoryDocument: vi.fn((input: WorkspaceMemoryDocumentCreate) => {
      params.inserted?.push(input);
      return Promise.resolve({ memoryId: "memory-id" });
    }),
  };
}

describe("distillWorkspaceMemory", () => {
  it("writes a workspace memory from repeated routing override outcomes", async () => {
    const inserted: WorkspaceMemoryDocumentCreate[] = [];
    const report = await distillWorkspaceMemory({
      repository: createRepository({ inserted }),
      now: () => new Date("2026-05-05T12:00:00.000Z"),
    });

    expect(report).toEqual({
      scanned: 1,
      created: 1,
      refined: 0,
      embedded: 0,
      skippedExisting: 0,
      errors: 0,
    });
    expect(inserted).toEqual([
      expect.objectContaining({
        workspaceId,
        memoryType: "routing",
        title: "Routing overrides are repeating",
        source: "distillation_worker",
      }),
    ]);
    expect(inserted[0]?.evidence["outcomeCount"]).toBe(3);
  });

  it("skips a duplicate recent memory title for the same workspace", async () => {
    const inserted: WorkspaceMemoryDocumentCreate[] = [];
    const report = await distillWorkspaceMemory({
      repository: createRepository({ existing: true, inserted }),
      now: () => new Date("2026-05-05T12:00:00.000Z"),
    });

    expect(report).toEqual({
      scanned: 1,
      created: 0,
      refined: 0,
      embedded: 0,
      skippedExisting: 1,
      errors: 0,
    });
    expect(inserted).toHaveLength(0);
  });

  it("embeds new workspace memories when an embedding client is provided", async () => {
    const savedEmbeddings: Array<{ memoryId: string; embedding: number[] }> = [];
    const repository = createRepository({ savedEmbeddings });
    const embeddings = {
      embed: vi.fn(() => Promise.resolve([0.1, 0.2, 0.3])),
    };

    const report = await distillWorkspaceMemory({
      repository,
      embeddings,
      now: () => new Date("2026-05-05T12:00:00.000Z"),
    });

    expect(report).toEqual({
      scanned: 1,
      created: 1,
      refined: 0,
      embedded: 1,
      skippedExisting: 0,
      errors: 0,
    });
    expect(embeddings.embed).toHaveBeenCalledWith(expect.stringContaining("Routing overrides are repeating"));
    expect(savedEmbeddings).toEqual([expect.objectContaining({
      memoryId: "memory-id",
      embedding: [0.1, 0.2, 0.3],
    })]);
  });

  it("writes workspace memory from repeated operator feedback outcomes", async () => {
    const inserted: WorkspaceMemoryDocumentCreate[] = [];
    const report = await distillWorkspaceMemory({
      repository: createRepository({
        inserted,
        operatorFeedbackSignals: [{
          workspaceId,
          signalType: "operator_tag_negative",
          feedbackLabel: "not_relevant",
          feedbackSource: "harwick_work_item",
          outcomeCount: 4,
          latestObservedAt: "2026-05-05T12:00:00.000Z",
          memberIds: ["00000000-0000-0000-0000-000000000002"],
        }],
      }),
      minOperatorFeedbackCount: 3,
      now: () => new Date("2026-05-05T12:00:00.000Z"),
    });

    expect(report).toEqual({
      scanned: 2,
      created: 2,
      refined: 0,
      embedded: 0,
      skippedExisting: 0,
      errors: 0,
    });
    expect(inserted).toEqual(expect.arrayContaining([
      expect.objectContaining({
        workspaceId,
        memoryType: "policy_signal",
        title: "Operators keep marking not relevant Harwick work as not relevant",
        source: "distillation_worker",
      }),
    ]));
    const feedbackMemory = inserted.find((memory) => memory.memoryType === "policy_signal");
    expect(feedbackMemory?.evidence["feedbackLabel"]).toBe("not_relevant");
    expect(feedbackMemory?.evidence["feedbackLabelDisplay"]).toBe("not relevant");
  });

  it("writes broader workspace memories from outcome, market, channel, and objection signals", async () => {
    const inserted: WorkspaceMemoryDocumentCreate[] = [];
    const report = await distillWorkspaceMemory({
      repository: createRepository({
        inserted,
        routingSignals: [],
        leadOutcomeSignals: [{
          workspaceId,
          signalType: "conversion_pattern",
          sourceChannel: "instagram_dm",
          leadType: "buyer",
          targetArea: "Katy",
          outcomeCount: 4,
          latestObservedAt: "2026-05-05T12:00:00.000Z",
          finalStatuses: ["closed_won"],
          averageScore: 86,
        }],
        marketSignals: [{
          workspaceId,
          targetArea: "Katy",
          leadType: "buyer",
          outcomeCount: 5,
          latestObservedAt: "2026-05-05T11:00:00.000Z",
          sourceChannels: ["instagram_dm", "instagram_comment"],
          timelines: ["this month", "summer"],
          budgetMin: 450000,
          budgetMax: 725000,
        }],
        sourceChannelSignals: [{
          workspaceId,
          sourceChannel: "instagram_comment",
          leadType: "buyer",
          outcomeCount: 7,
          qualifiedCount: 3,
          convertedCount: 2,
          churnedCount: 1,
          latestObservedAt: "2026-05-05T10:00:00.000Z",
        }],
        objectionSignals: [{
          workspaceId,
          objectionType: "decision_partner",
          outcomeCount: 3,
          latestObservedAt: "2026-05-05T09:00:00.000Z",
          sourceChannels: ["instagram_dm"],
          examples: ["Need to talk to my spouse first."],
        }],
      }),
      minLeadPatternCount: 3,
      minObjectionCount: 3,
      now: () => new Date("2026-05-05T12:00:00.000Z"),
    });

    expect(report).toEqual({
      scanned: 4,
      created: 4,
      refined: 0,
      embedded: 0,
      skippedExisting: 0,
      errors: 0,
    });
    expect(inserted).toEqual(expect.arrayContaining([
      expect.objectContaining({
        memoryType: "pattern",
        title: "Converted buyer leads repeat from instagram dm in Katy",
      }),
      expect.objectContaining({
        memoryType: "market",
        title: "Katy keeps appearing for buyer leads",
      }),
      expect.objectContaining({
        memoryType: "pattern",
        title: "instagram comment is showing a buyer lead pattern",
      }),
      expect.objectContaining({
        memoryType: "objection",
        title: "Decision partner objections are repeating",
      }),
    ]));
    const objection = inserted.find((memory) => memory.memoryType === "objection");
    expect(objection?.evidence["examples"]).toEqual(["Need to talk to my spouse first."]);
  });

  it("uses small-model synthesis for memory prose when provided", async () => {
    const inserted: WorkspaceMemoryDocumentCreate[] = [];
    const report = await distillWorkspaceMemory({
      repository: createRepository({
        inserted,
        routingSignals: [],
        objectionSignals: [{
          workspaceId,
          objectionType: "price",
          outcomeCount: 3,
          latestObservedAt: "2026-05-05T12:00:00.000Z",
          sourceChannels: ["instagram_dm"],
          examples: ["Is this negotiable?"],
        }],
      }),
      minObjectionCount: 3,
      synthesisClient: {
        synthesizeMemory: vi.fn(() => Promise.resolve({
          title: "Price sensitivity is recurring in DMs",
          body: "Leads are repeatedly asking price-sensitive questions in Instagram DMs. Harwick should qualify budget early and avoid overpromising negotiation room.",
          confidence: 0.81,
        })),
      },
      now: () => new Date("2026-05-05T12:00:00.000Z"),
    });

    expect(report).toEqual({
      scanned: 1,
      created: 1,
      refined: 1,
      embedded: 0,
      skippedExisting: 0,
      errors: 0,
    });
    expect(inserted[0]).toEqual(expect.objectContaining({
      memoryType: "objection",
      title: "Price sensitivity is recurring in DMs",
      body: "Leads are repeatedly asking price-sensitive questions in Instagram DMs. Harwick should qualify budget early and avoid overpromising negotiation room.",
      confidence: 0.81,
    }));
    expect(inserted[0]?.evidence["synthesisSource"]).toBe("small_model");
    expect(inserted[0]?.evidence["deterministicTitle"]).toBe("Price objections are repeating");
  });
});
