import { describe, expect, it } from "vitest";
import type { WorkspaceMemoryRuntimeDocument } from "../../lib/supabase/workspace-memory";
import { formatConfidence, formatLastObserved, groupMemoriesByType } from "./memory-data";

function doc(overrides: Partial<WorkspaceMemoryRuntimeDocument> & { memoryType: string }): WorkspaceMemoryRuntimeDocument {
  return {
    id: `mem-${Math.random().toString(36).slice(2, 8)}`,
    title: "A title",
    body: "A body that harwick noticed.",
    confidence: 0.5,
    lastObservedAt: "2026-05-20T12:00:00.000Z",
    ...overrides,
  };
}

describe("groupMemoriesByType", () => {
  it("returns groups in canonical order and drops empty types", () => {
    const groups = groupMemoriesByType([
      doc({ memoryType: "market" }),
      doc({ memoryType: "pattern" }),
      doc({ memoryType: "pattern" }),
      doc({ memoryType: "policy_signal" }),
    ]);

    expect(groups.map((g) => g.key)).toEqual(["pattern", "market", "policy_signal"]);
    const pattern = groups.find((g) => g.key === "pattern");
    expect(pattern?.documents.length).toBe(2);
  });

  it("buckets unknown memory_type values into 'other' last", () => {
    const groups = groupMemoriesByType([
      doc({ memoryType: "experimental_new_type" }),
      doc({ memoryType: "pattern" }),
    ]);

    expect(groups.map((g) => g.key)).toEqual(["pattern", "other"]);
    expect(groups[1]?.documents[0]?.memoryType).toBe("experimental_new_type");
  });

  it("returns an empty array when there are no documents", () => {
    expect(groupMemoriesByType([])).toEqual([]);
  });
});

describe("formatConfidence", () => {
  it("renders 0..1 as 0..100%", () => {
    expect(formatConfidence(0)).toBe("0%");
    expect(formatConfidence(0.5)).toBe("50%");
    expect(formatConfidence(1)).toBe("100%");
    expect(formatConfidence(0.872)).toBe("87%");
  });

  it("clamps and handles NaN", () => {
    expect(formatConfidence(-0.5)).toBe("0%");
    expect(formatConfidence(1.5)).toBe("100%");
    expect(formatConfidence(Number.NaN)).toBe("0%");
  });
});

describe("formatLastObserved", () => {
  const now = new Date("2026-05-24T12:00:00.000Z");

  it("returns 'never' for null or invalid input", () => {
    expect(formatLastObserved(null, now)).toBe("never");
    expect(formatLastObserved("not-a-date", now)).toBe("never");
  });

  it("returns the right scale at each boundary", () => {
    expect(formatLastObserved("2026-05-24T11:59:30.000Z", now)).toBe("just now");
    expect(formatLastObserved("2026-05-24T11:30:00.000Z", now)).toBe("30m ago");
    expect(formatLastObserved("2026-05-24T08:00:00.000Z", now)).toBe("4h ago");
    expect(formatLastObserved("2026-05-20T12:00:00.000Z", now)).toBe("4d ago");
    expect(formatLastObserved("2026-03-24T12:00:00.000Z", now)).toBe("2mo ago");
    expect(formatLastObserved("2024-05-24T12:00:00.000Z", now)).toBe("2y ago");
  });
});
