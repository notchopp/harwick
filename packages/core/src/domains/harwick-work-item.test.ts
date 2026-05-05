import { describe, expect, it } from "vitest";
import {
  HarwickRoutingDecisionCreateSchema,
  HarwickWorkItemCreateSchema,
} from "./harwick-work-item.js";

const workspaceId = "00000000-0000-0000-0000-000000000001";
const leadId = "00000000-0000-0000-0000-000000000002";
const memberId = "00000000-0000-0000-0000-000000000003";

describe("Harwick work item contracts", () => {
  it("validates a member-targeted routing approval work item", () => {
    const item = HarwickWorkItemCreateSchema.parse({
      workspaceId,
      leadId,
      routingDecisionId: null,
      trajectoryId: null,
      stepId: null,
      type: "approval",
      status: "pending",
      targetMemberId: memberId,
      targetRole: "team_lead",
      priority: "high",
      title: "Approve Katy buyer routing",
      summary: "Harwick recommends Noah for this high-budget Katy buyer.",
      recommendedAction: "approve or reassign",
      reason: "Katy area match, high buyer budget, and low active lead load.",
      payload: {
        suggestedMemberId: memberId,
        area: "Katy",
      },
      dueAt: null,
    });

    expect(item.status).toBe("pending");
    expect(item.targetRole).toBe("team_lead");
    expect(item.payload).toMatchObject({ area: "Katy" });
  });

  it("validates the routing explanation and future override signal", () => {
    const decision = HarwickRoutingDecisionCreateSchema.parse({
      workspaceId,
      leadId,
      trajectoryId: null,
      stepId: null,
      suggestedMemberId: memberId,
      finalMemberId: null,
      status: "suggested",
      confidence: 0.86,
      reason: "Noah covers Katy, has strongest high-budget buyer history, and has capacity.",
      evidence: {
        area: "Katy",
        activeLeadCount: 2,
        closeHistory: "best_high_budget_buyer_match",
      },
      createdByActorType: "ai",
      decidedByMemberId: null,
      overrideReason: null,
    });

    expect(decision.confidence).toBe(0.86);
    expect(decision.evidence).toMatchObject({ activeLeadCount: 2 });
  });
});
