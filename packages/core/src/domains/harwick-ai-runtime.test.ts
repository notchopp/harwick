import { describe, expect, it } from "vitest";
import { HarwickAiRuntimeInputSchema, HarwickAiTurnSchema } from "./harwick-ai-runtime.js";

describe("Harwick AI runtime contracts", () => {
  it("models isolated conversation state and typed tool calls", () => {
    const input = HarwickAiRuntimeInputSchema.parse({
      workspaceName: "Prestige Realty",
      channel: "instagram_dm",
      inboundText: "Can I see this Saturday?",
      state: {
        workspaceId: null,
        leadId: null,
        providerThreadId: "ig-thread-1",
        channel: "instagram_dm",
        automationMode: "ai_on",
        currentIntent: "showing_request",
        qualification: {
          leadType: "buyer",
          intent: "high",
          timeline: "this week",
          budget: "$450k-$520k",
          targetArea: "Coral Gables",
          propertyType: "single family",
          financingStatus: "unknown",
          score: 72,
        },
        knownFacts: ["asked about 1234 Ocean View Dr"],
      },
      workspaceMemory: "Routing pattern: Noah often closes high-budget Katy buyers.",
    });

    expect(input.state?.providerThreadId).toBe("ig-thread-1");
    expect(input.state?.qualification.targetArea).toBe("Coral Gables");
    expect(input.workspaceMemory).toContain("Noah");
  });

  it("requires structured decisions instead of loose reply text", () => {
    const turn = HarwickAiTurnSchema.parse({
      intent: "showing_request",
      nextAction: "request_showing_approval",
      missingFields: ["phone", "financing"],
      confidence: 0.91,
      safetyFlags: ["needs_human_review"],
      reply: "I can help request a showing. What is the best phone number for confirmation?",
      statePatch: {
        currentIntent: "showing_request",
        leadType: "buyer",
        intent: "high",
        timeline: null,
        budget: null,
        targetArea: "Coral Gables",
        propertyType: null,
        financingStatus: null,
        knownFacts: ["requested showing"],
      },
      handoffBrief: "showing request needs approval",
      toolCalls: [
        {
          tool: "request_showing_approval",
          reason: "agent must approve before confirming the private showing",
          requiresApproval: true,
          payload: { listing: "1234 Ocean View Dr" },
        },
      ],
    });

    expect(turn.toolCalls[0]?.tool).toBe("request_showing_approval");
    expect(turn.statePatch.currentIntent).toBe("showing_request");
  });
});
