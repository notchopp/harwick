import { describe, expect, it } from "vitest";
import { decideLeadWorkflow } from "./lead-workflow.js";

const baseLead = {
  leadId: "123e4567-e89b-12d3-a456-426614174001",
  workspaceId: "123e4567-e89b-12d3-a456-426614174000",
  sourceChannel: "call" as const,
  leadType: "unknown" as const,
  intent: "unknown" as const,
  timeline: null,
  budgetMin: null,
  budgetMax: null,
  targetArea: null,
  financingStatus: "unknown" as const,
  currentScore: 0,
  currentStatus: "new" as const,
  assignedAgentId: null,
  engagementCount: 1,
  latestText: null,
};

describe("decideLeadWorkflow", () => {
  it("marks urgent showing calls as hot and ready for FUB sync", () => {
    expect(decideLeadWorkflow({
      ...baseLead,
      leadType: "buyer",
      timeline: "this weekend",
      targetArea: "Cypress",
      financingStatus: "preapproved",
      latestText: "I want a showing this weekend and I am preapproved.",
    })).toMatchObject({
      status: "hot",
      intent: "high",
      shouldAssign: true,
      shouldCreateHandoffTask: true,
      shouldSyncToFub: true,
    });
  });

  it("keeps low-information comments out of FUB sync", () => {
    expect(decideLeadWorkflow({
      ...baseLead,
      sourceChannel: "instagram_comment",
      latestText: "price?",
    })).toMatchObject({
      status: "new",
      shouldAssign: false,
      shouldSyncToFub: false,
    });
  });

  it("promotes repeat-engagement leads when budget depth is captured", () => {
    const decision = decideLeadWorkflow({
      ...baseLead,
      sourceChannel: "instagram_dm",
      targetArea: "Houston Heights",
      timeline: "this month",
      budgetMin: 450_000,
      budgetMax: 575_000,
      engagementCount: 3,
      latestText: "We are back and still interested in homes in Houston Heights this month.",
    });

    expect(decision).toMatchObject({
      status: "qualified",
      intent: "medium",
      shouldAssign: true,
      shouldSyncToFub: true,
    });
    expect(decision.reasons).toEqual(expect.arrayContaining(["budget range captured", "repeat engagement"]));
  });
});
