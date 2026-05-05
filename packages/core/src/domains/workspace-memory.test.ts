import { describe, expect, it } from "vitest";
import {
  WorkspaceMemoryDocumentSchema,
  WorkspaceMemoryDocumentCreateSchema,
  WorkspaceMemoryReviewQuerySchema,
  WorkspaceMemoryReviewUpdateRequestSchema,
} from "./workspace-memory.js";

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

describe("WorkspaceMemoryDocumentSchema", () => {
  it("defaults new memory documents to pending review", () => {
    expect(
      WorkspaceMemoryDocumentSchema.parse({
        id: "00000000-0000-0000-0000-000000000010",
        workspaceId: "00000000-0000-0000-0000-000000000001",
        memoryType: "market",
        title: "Katy buyers ask about commute tradeoffs",
        body: "Several Katy buyers compare commute time against school district preferences before booking a showing.",
        source: "distillation_worker",
        confidence: 0.74,
        lastObservedAt: "2026-05-05T12:00:00.000Z",
        createdAt: "2026-05-05T12:00:00.000Z",
        updatedAt: "2026-05-05T12:00:00.000Z",
      }),
    ).toMatchObject({
      reviewStatus: "pending",
      reviewedByMemberId: null,
      reviewedAt: null,
      reviewNote: null,
    });
  });
});

describe("WorkspaceMemoryReviewUpdateRequestSchema", () => {
  it("validates an approved memory review update", () => {
    expect(
      WorkspaceMemoryReviewUpdateRequestSchema.parse({
        memoryId: "00000000-0000-0000-0000-000000000010",
        reviewStatus: "approved",
        reviewNote: "Matches what the team lead has seen in handoffs.",
      }),
    ).toEqual({
      memoryId: "00000000-0000-0000-0000-000000000010",
      reviewStatus: "approved",
      reviewNote: "Matches what the team lead has seen in handoffs.",
    });
  });

  it("rejects empty review notes", () => {
    expect(() =>
      WorkspaceMemoryReviewUpdateRequestSchema.parse({
        memoryId: "00000000-0000-0000-0000-000000000010",
        reviewStatus: "dismissed",
        reviewNote: "   ",
      }),
    ).toThrow();
  });
});

describe("WorkspaceMemoryReviewQuerySchema", () => {
  it("coerces the limit and validates optional review status", () => {
    expect(WorkspaceMemoryReviewQuerySchema.parse({ reviewStatus: "pending", limit: "25" })).toEqual({
      reviewStatus: "pending",
      limit: 25,
    });
  });
});
