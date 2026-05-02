import { describe, expect, it } from "vitest";
import { classifyHarwickLeadActionability } from "./lead-actionability.js";

const baseLead = {
  sourceChannel: "instagram_comment" as const,
  status: "new" as const,
  intent: "unknown" as const,
  score: 0,
  assignedAgentId: null,
  nextFollowUpAt: null,
  followUpBossContactId: null,
};

describe("classifyHarwickLeadActionability", () => {
  it("hides low-signal social leads until they qualify", () => {
    expect(classifyHarwickLeadActionability(baseLead)).toMatchObject({
      shouldShow: false,
      state: "hidden",
    });
  });

  it("keeps qualified social leads visible", () => {
    expect(classifyHarwickLeadActionability({
      ...baseLead,
      sourceChannel: "instagram_dm",
      status: "qualified",
      intent: "medium",
      score: 58,
    })).toMatchObject({
      shouldShow: true,
      state: "qualified",
    });
  });

  it("keeps nurture leads visible only when follow-up work exists", () => {
    expect(classifyHarwickLeadActionability({
      ...baseLead,
      status: "nurture",
      intent: "low",
      score: 22,
      nextFollowUpAt: "2026-04-30T12:15:00.000Z",
    })).toMatchObject({
      shouldShow: true,
      state: "nurture",
    });
  });

  it("always keeps voice leads visible unless closed or spam", () => {
    expect(classifyHarwickLeadActionability({
      ...baseLead,
      sourceChannel: "call",
    })).toMatchObject({
      shouldShow: true,
      state: "callback",
    });
  });
});
