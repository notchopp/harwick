import { describe, expect, it } from "vitest";
import { WorkspaceMemoryDocumentCreateSchema } from "./workspace-memory.js";

describe("WorkspaceMemoryDocumentCreateSchema", () => {
  it("validates a distilled workspace routing pattern", () => {
    expect(
      WorkspaceMemoryDocumentCreateSchema.parse({
        workspaceId: "00000000-0000-0000-0000-000000000001",
        memoryType: "routing",
        title: "Routing overrides favor Katy buyer specialist",
        body: "Team leads repeatedly override AI routing toward the Katy buyer specialist when leads mention new construction west of Houston.",
        source: "distillation_worker",
        confidence: 0.82,
        evidence: {
          outcomeCount: 3,
          signalType: "routing_overridden",
        },
        lastObservedAt: "2026-05-05T12:00:00.000Z",
      }),
    ).toMatchObject({
      memoryType: "routing",
      source: "distillation_worker",
      confidence: 0.82,
    });
  });
});
