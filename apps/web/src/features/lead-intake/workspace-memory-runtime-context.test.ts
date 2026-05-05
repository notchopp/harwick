import { describe, expect, it } from "vitest";
import { buildWorkspaceMemoryRuntimeContext } from "./workspace-memory-runtime-context";

describe("buildWorkspaceMemoryRuntimeContext", () => {
  it("renders workspace memories as concise runtime context", () => {
    const context = buildWorkspaceMemoryRuntimeContext([
      {
        id: "memory-1",
        memoryType: "routing",
        title: "Noah closes high-budget Katy buyers",
        body: "When Harwick suggests another agent, operators often reassign Katy buyers over $800k to Noah.",
        confidence: 0.82,
        lastObservedAt: "2026-05-05T12:00:00.000Z",
        similarity: 0.74,
      },
    ]);

    expect(context).toContain("Memory 1: Noah closes high-budget Katy buyers");
    expect(context).toContain("confidence: 82%");
    expect(context).toContain("relevance: 74%");
    expect(context).toContain("operators often reassign");
  });

  it("returns null when no memories are available", () => {
    expect(buildWorkspaceMemoryRuntimeContext([])).toBeNull();
  });
});
