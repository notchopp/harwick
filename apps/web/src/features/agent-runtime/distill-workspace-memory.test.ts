import type { WorkspaceMemoryDocumentCreate } from "@realty-ops/core";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceMemoryRepository } from "../../lib/supabase/workspace-memory";
import { distillWorkspaceMemory } from "./distill-workspace-memory";

const workspaceId = "00000000-0000-0000-0000-000000000001";

function createRepository(params: {
  existing?: boolean;
  inserted?: WorkspaceMemoryDocumentCreate[];
}): WorkspaceMemoryRepository {
  return {
    listRoutingOverrideSignals: vi.fn(() => Promise.resolve([{
      workspaceId,
      outcomeCount: 3,
      latestObservedAt: "2026-05-05T12:00:00.000Z",
      operatorMemberIds: ["00000000-0000-0000-0000-000000000002"],
      aiSuggestedMemberIds: ["00000000-0000-0000-0000-000000000003"],
    }])),
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
      skippedExisting: 1,
      errors: 0,
    });
    expect(inserted).toHaveLength(0);
  });
});
