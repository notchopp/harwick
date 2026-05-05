import type { WorkspaceMemoryDocumentCreate } from "@realty-ops/core";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceMemoryRepository } from "../../lib/supabase/workspace-memory";
import { distillWorkspaceMemory } from "./distill-workspace-memory";

const workspaceId = "00000000-0000-0000-0000-000000000001";

function createRepository(params: {
  existing?: boolean;
  inserted?: WorkspaceMemoryDocumentCreate[];
  savedEmbeddings?: Array<{ memoryId: string; embedding: number[] }>;
  operatorFeedbackSignals?: Awaited<ReturnType<WorkspaceMemoryRepository["listOperatorFeedbackSignals"]>>;
}): WorkspaceMemoryRepository {
  return {
    listRuntimeMemoryDocuments: vi.fn(() => Promise.resolve([])),
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
    listRoutingOverrideSignals: vi.fn(() => Promise.resolve([{
      workspaceId,
      outcomeCount: 3,
      latestObservedAt: "2026-05-05T12:00:00.000Z",
      operatorMemberIds: ["00000000-0000-0000-0000-000000000002"],
      aiSuggestedMemberIds: ["00000000-0000-0000-0000-000000000003"],
    }])),
    listOperatorFeedbackSignals: vi.fn(() => Promise.resolve(params.operatorFeedbackSignals ?? [])),
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
});
