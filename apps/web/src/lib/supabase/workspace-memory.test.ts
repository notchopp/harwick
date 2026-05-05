import { describe, expect, it } from "vitest";
import { mapReviewableMemoryDocumentRow, type ReviewableMemoryDocumentRow } from "./workspace-memory";

describe("mapReviewableMemoryDocumentRow", () => {
  it("maps review metadata into the workspace memory domain model", () => {
    const row: ReviewableMemoryDocumentRow = {
      id: "00000000-0000-0000-0000-000000000010",
      workspace_id: "00000000-0000-0000-0000-000000000001",
      memory_type: "routing",
      title: "Katy new-construction leads perform better with Noah",
      body: "Team leads repeatedly route Katy new-construction buyers to Noah because prior close signals are stronger.",
      source: "distillation_worker",
      confidence: 0.87,
      evidence: {
        signalType: "routing_overridden",
        outcomeCount: 4,
      },
      last_observed_at: "2026-05-05T12:00:00.000Z",
      review_status: "approved",
      reviewed_by_member_id: "00000000-0000-0000-0000-000000000020",
      reviewed_at: "2026-05-05T12:30:00.000Z",
      review_note: "Team lead confirmed this assignment pattern.",
      created_at: "2026-05-05T12:00:00.000Z",
      updated_at: "2026-05-05T12:30:00.000Z",
    };

    expect(mapReviewableMemoryDocumentRow(row)).toMatchObject({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      memoryType: "routing",
      reviewStatus: "approved",
      reviewedByMemberId: "00000000-0000-0000-0000-000000000020",
      reviewNote: "Team lead confirmed this assignment pattern.",
      evidence: {
        signalType: "routing_overridden",
        outcomeCount: 4,
      },
    });
  });

  it("normalizes non-object evidence to an empty object", () => {
    const row: ReviewableMemoryDocumentRow = {
      id: "00000000-0000-0000-0000-000000000010",
      workspace_id: "00000000-0000-0000-0000-000000000001",
      memory_type: "market",
      title: "Katy buyers ask about schools",
      body: "Repeated questions mention schools before commute.",
      source: "system",
      confidence: 0.65,
      evidence: ["unexpected"],
      last_observed_at: "2026-05-05T12:00:00.000Z",
      review_status: "pending",
      reviewed_by_member_id: null,
      reviewed_at: null,
      review_note: null,
      created_at: "2026-05-05T12:00:00.000Z",
      updated_at: "2026-05-05T12:00:00.000Z",
    };

    expect(mapReviewableMemoryDocumentRow(row).evidence).toEqual({});
  });
});

