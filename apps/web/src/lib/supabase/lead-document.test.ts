import { describe, expect, it } from "vitest";

import { buildNextLeadDocument } from "./lead-document";

describe("buildNextLeadDocument", () => {
  it("starts a living lead document with a timestamped public-chat update", () => {
    const next = buildNextLeadDocument({
      existing: null,
      update: "Public listing visitor asked about schools and wants to move before fall.",
      occurredAt: "2026-05-27T12:00:00.000Z",
    });

    expect(next).toBe("[2026-05-27T12:00:00.000Z] Public listing visitor asked about schools and wants to move before fall.");
  });

  it("appends instead of replacing existing lead context", () => {
    const next = buildNextLeadDocument({
      existing: "[2026-05-26T12:00:00.000Z] Buyer asked about monthly payment.",
      update: "Buyer then asked for a Saturday showing.",
      occurredAt: "2026-05-27T12:00:00.000Z",
    });

    expect(next).toContain("Buyer asked about monthly payment.");
    expect(next).toContain("---");
    expect(next).toContain("[2026-05-27T12:00:00.000Z] Buyer then asked for a Saturday showing.");
  });

  it("keeps existing document unchanged for empty updates", () => {
    const next = buildNextLeadDocument({
      existing: "Existing context",
      update: "   ",
      occurredAt: "2026-05-27T12:00:00.000Z",
    });

    expect(next).toBe("Existing context");
  });
});
