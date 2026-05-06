import type { HarwickWorkItemCreate } from "@realty-ops/core";
import { describe, expect, it } from "vitest";
import { intelligizeHarwickWorkItem } from "./harwick-work-item-intelligence";

const workspaceId = "00000000-0000-0000-0000-000000000001";
const leadId = "00000000-0000-0000-0000-000000000002";
const agentId = "00000000-0000-0000-0000-000000000003";

describe("intelligizeHarwickWorkItem", () => {
  it("upgrades unassigned priority leads into approval-safe action plans", async () => {
    const item: HarwickWorkItemCreate = {
      workspaceId,
      leadId,
      routingDecisionId: null,
      trajectoryId: null,
      stepId: null,
      type: "insight",
      status: "pending",
      targetMemberId: null,
      targetRole: "team_lead",
      priority: "high",
      title: "Priority lead needs assignment",
      summary: "Sarah is hot, scored 82, and has no assigned agent.",
      recommendedAction: "Assign the best-fit agent",
      reason: "Harwick found a qualified or hot lead without an owner.",
      payload: {
        signalType: "unassigned_priority_lead",
        signalKey: "unassigned_priority_lead:lead-1:hot",
        leadStatus: "hot",
        score: 82,
        targetArea: "Katy",
      },
      dueAt: null,
    };

    const enriched = await intelligizeHarwickWorkItem({
      context: {
        signalKey: "unassigned_priority_lead:lead-1:hot",
        source: "proactive_insight",
        item,
      },
    });

    expect(enriched.type).toBe("approval");
    expect(enriched.payload["actionPlan"]).toMatchObject({
      executionBrief: "Review the best owner, gather routing context if needed, and keep the final assignment behind approval.",
    });
    expect(enriched.payload["intelligence"]).toMatchObject({
      source: "deterministic",
      notification: {
        level: "prompt",
        mode: "feed_and_nudge",
      },
      audience: {
        targetRole: "team_lead",
      },
    });
  });

  it("keeps direct-member work pointed at the assigned owner while adding notification context", async () => {
    const item: HarwickWorkItemCreate = {
      workspaceId,
      leadId,
      routingDecisionId: null,
      trajectoryId: null,
      stepId: null,
      type: "insight",
      status: "pending",
      targetMemberId: agentId,
      targetRole: null,
      priority: "normal",
      title: "Lead has gone quiet",
      summary: "Jordan has had no recorded message for 6 days.",
      recommendedAction: "Send follow-up or start nurture",
      reason: "Harwick found an active lead without a next follow-up scheduled.",
      payload: {
        signalType: "dormant_active_lead",
        signalKey: "dormant_active_lead:lead-2",
        leadStatus: "qualified",
      },
      dueAt: null,
    };

    const enriched = await intelligizeHarwickWorkItem({
      context: {
        signalKey: "dormant_active_lead:lead-2",
        source: "proactive_insight",
        item,
      },
    });

    expect(enriched.targetMemberId).toBe(agentId);
    expect(enriched.payload["intelligence"]).toMatchObject({
      audience: {
        targetMemberId: agentId,
      },
      notification: {
        mode: "feed_and_nudge",
      },
    });
    expect(enriched.payload["actionPlan"]).toMatchObject({
      proposedToolCalls: [
        expect.objectContaining({
          tool: "dispatch_subagent",
        }),
      ],
    });
  });
});
