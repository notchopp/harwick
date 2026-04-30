import { describe, expect, it } from "vitest";
import { decideHarwickAiNextAction } from "./harwick-ai.js";

const baseInput = {
  viewerRole: "agent",
  automationMode: "ai_on",
  inboundText: "Can I see this home this weekend?",
  suggestedReply: "Yes, I can help with that. What timeline are you working with?",
  lead: {
    id: "123e4567-e89b-12d3-a456-426614174000",
    sourceChannel: "instagram_dm",
    leadType: "buyer",
    intent: "high",
    timeline: "60 days",
    budget: "$450k-$520k",
    targetArea: "Katy",
    propertyType: "new construction",
    financingStatus: "preapproved",
    score: 86,
    assignedAgentName: "Sarah K.",
    sourceOwnerName: "Ademola",
    listingLabel: "1234 Ocean View Dr",
  },
} as const;

describe("Harwick AI decision engine", () => {
  it("keeps showing requests in approval even when automation is on", () => {
    const decision = decideHarwickAiNextAction(baseInput);

    expect(decision.canAutoSend).toBe(false);
    expect(decision.recommendedAction).toBe("request_showing_approval");
    expect(decision.safetyFlags).toContain("showing_approval_required");
  });

  it("changes the lens for team lead and owner roles", () => {
    const decision = decideHarwickAiNextAction({
      ...baseInput,
      viewerRole: "owner",
      inboundText: "Can you send details?",
    });

    expect(decision.roleLens).toContain("ownership");
    expect(decision.routingSuggestion).toContain("Sarah K.");
  });

  it("does not allow sending while human takeover is active", () => {
    const decision = decideHarwickAiNextAction({
      ...baseInput,
      automationMode: "human_takeover",
      inboundText: "Can you send details?",
    });

    expect(decision.canAutoSend).toBe(false);
    expect(decision.recommendedAction).toBe("pause_for_owner");
    expect(decision.safetyFlags).toContain("human_takeover");
  });
});
