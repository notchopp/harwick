import { describe, expect, it } from "vitest";
import {
  buildWorkspaceMemoryReviewRequest,
  formatWorkspaceMemoryConfidence,
  formatWorkspaceMemoryDate,
  workspaceMemoryStatusLabel,
} from "./workspace-memory-settings";

describe("workspace memory settings helpers", () => {
  it("builds an approved memory review request with a trimmed note", () => {
    const result = buildWorkspaceMemoryReviewRequest({
      memoryId: "00000000-0000-0000-0000-000000000010",
      reviewStatus: "approved",
      reviewNote: "  Matches team lead overrides.  ",
    });

    expect(result).toEqual({
      ok: true,
      request: {
        memoryId: "00000000-0000-0000-0000-000000000010",
        reviewStatus: "approved",
        reviewNote: "Matches team lead overrides.",
      },
    });
  });

  it("converts a blank review note to null before validation", () => {
    const result = buildWorkspaceMemoryReviewRequest({
      memoryId: "00000000-0000-0000-0000-000000000010",
      reviewStatus: "dismissed",
      reviewNote: "   ",
    });

    expect(result).toEqual({
      ok: true,
      request: {
        memoryId: "00000000-0000-0000-0000-000000000010",
        reviewStatus: "dismissed",
        reviewNote: null,
      },
    });
  });

  it("rejects invalid memory ids before hitting the API", () => {
    const result = buildWorkspaceMemoryReviewRequest({
      memoryId: "not-a-memory",
      reviewStatus: "approved",
      reviewNote: "",
    });

    expect(result).toEqual({
      ok: false,
      error: "Memory review could not be saved.",
    });
  });

  it("formats compact memory review labels", () => {
    expect(formatWorkspaceMemoryDate(null)).toBe("not observed");
    expect(formatWorkspaceMemoryDate("2026-05-05T12:00:00.000Z")).toContain("May 5");
    expect(formatWorkspaceMemoryConfidence(0.824)).toBe("82% confidence");
    expect(workspaceMemoryStatusLabel("pending")).toBe("pending");
  });
});
