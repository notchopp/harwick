import { describe, expect, it } from "vitest";
import { buildPublicSystemHealth } from "./system-health.js";

describe("buildPublicSystemHealth", () => {
  it("exposes product-safe system names", () => {
    const health = buildPublicSystemHealth({
      checkedAt: "2026-05-01T12:00:00.000Z",
      hasSocialIntake: true,
      hasHarwickAi: true,
      hasVoiceSystem: true,
      hasListingSystem: true,
      hasCrmSync: false,
      hasBackgroundJobs: true,
    });

    expect(health.status).toBe("needs_setup");
    expect(health.items.map((item) => item.label)).toEqual([
      "Lead intake",
      "Harwick AI",
      "Voice system",
      "Listing system",
      "CRM sync",
      "Background jobs",
    ]);
    expect(JSON.stringify(health)).not.toContain("OpenAI");
    expect(JSON.stringify(health)).not.toContain("Retell");
    expect(JSON.stringify(health)).not.toContain("Follow Up Boss");
  });
});
