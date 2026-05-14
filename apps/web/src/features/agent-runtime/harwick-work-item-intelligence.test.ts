import type { HarwickWorkItemCreate } from "@realty-ops/core";
import { describe, expect, it } from "vitest";
import { intelligizeHarwickWorkItem } from "./harwick-work-item-intelligence";

const workspaceId = "00000000-0000-0000-0000-000000000001";
const leadId = "00000000-0000-0000-0000-000000000002";
const agentId = "00000000-0000-0000-0000-000000000003";

function readRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

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

  it("builds lifecycle-safe action plans for social, identity, and voice cognition signals", async () => {
    const socialItem: HarwickWorkItemCreate = {
      workspaceId,
      leadId,
      routingDecisionId: null,
      trajectoryId: null,
      stepId: null,
      type: "insight",
      status: "pending",
      targetMemberId: null,
      targetRole: "operator",
      priority: "high",
      title: "Comment conversation moved to DM",
      summary: "A public comment moved into DM and now needs the private continuation plan.",
      recommendedAction: "Review DM continuation",
      reason: "Harwick should continue the lifecycle after the public-to-private handoff.",
      payload: {
        signalType: "social_lifecycle_trigger",
        signalKey: "social_lifecycle_trigger:post_handoff:lead-1:event-1",
        trigger: "post_handoff",
        sourceChannel: "instagram_dm",
      },
      dueAt: null,
    };
    const identityItem: HarwickWorkItemCreate = {
      ...socialItem,
      title: "Lead is active across multiple channels",
      recommendedAction: "Review channel linkage",
      reason: "Harwick should preserve one opportunity narrative across channels.",
      payload: {
        signalType: "cross_channel_identity_signal",
        signalKey: "cross_channel_identity_signal:lead-1:instagram_comment,voice",
        channels: ["instagram_comment", "voice"],
      },
    };
    const voiceItem: HarwickWorkItemCreate = {
      ...socialItem,
      title: "Voice handoff needs post-call brief",
      recommendedAction: "Review post-call brief",
      reason: "Caller wants to tour this week and needs a post-call plan.",
      payload: {
        signalType: "voice_post_call_cognition",
        signalKey: "voice_post_call_cognition:handoff-1",
        urgency: "high",
      },
    };

    const [social, identity, voice] = await Promise.all([
      intelligizeHarwickWorkItem({
        context: {
          signalKey: "social_lifecycle_trigger:post_handoff:lead-1:event-1",
          source: "proactive_insight",
          item: socialItem,
        },
      }),
      intelligizeHarwickWorkItem({
        context: {
          signalKey: "cross_channel_identity_signal:lead-1:instagram_comment,voice",
          source: "proactive_insight",
          item: identityItem,
        },
      }),
      intelligizeHarwickWorkItem({
        context: {
          signalKey: "voice_post_call_cognition:handoff-1",
          source: "proactive_insight",
          item: voiceItem,
        },
      }),
    ]);

    expect(social.type).toBe("approval");
    expect(social.payload["actionPlan"]).toMatchObject({
      executionBrief: "Keep the comment-to-DM handoff coherent, then prepare the next private follow-through behind approval.",
      proposedToolCalls: [
        expect.objectContaining({
          tool: "dispatch_subagent",
        }),
      ],
    });
    expect(identity.payload["actionPlan"]).toMatchObject({
      internalSafeOnly: true,
      proposedToolCalls: [
        expect.objectContaining({
          tool: "dispatch_subagent",
        }),
      ],
    });
    const identityActionPlan = readRecord(identity.payload["actionPlan"]);
    const identityFirstCall = Array.isArray(identityActionPlan?.["proposedToolCalls"])
      ? readRecord(identityActionPlan["proposedToolCalls"][0])
      : null;
    expect(readRecord(identityFirstCall?.["payload"])?.["subagentType"]).toBe("research");
    expect(voice.payload["actionPlan"]).toMatchObject({
      proposedToolCalls: [
        expect.objectContaining({
          tool: "dispatch_subagent",
        }),
        expect.objectContaining({
          tool: "route_lead",
        }),
      ],
    });
    const voiceActionPlan = readRecord(voice.payload["actionPlan"]);
    const voiceFirstCall = Array.isArray(voiceActionPlan?.["proposedToolCalls"])
      ? readRecord(voiceActionPlan["proposedToolCalls"][0])
      : null;
    expect(readRecord(voiceFirstCall?.["payload"])?.["subagentType"]).toBe("writer");
  });

  it("adds approval-safe plans for stalled showings and post-close follow-up", async () => {
    const stalledShowing: HarwickWorkItemCreate = {
      workspaceId,
      leadId,
      routingDecisionId: null,
      trajectoryId: null,
      stepId: null,
      type: "insight",
      status: "pending",
      targetMemberId: agentId,
      targetRole: null,
      priority: "high",
      title: "Showing approval is stalled",
      summary: "A showing approval has been sitting without a next move.",
      recommendedAction: "Review showing follow-up",
      reason: "Harwick found a pending showing approval without a timely next step.",
      payload: {
        signalType: "stalled_showing_approval",
        signalKey: "stalled_showing_approval:task-1",
      },
      dueAt: null,
    };
    const closedLead: HarwickWorkItemCreate = {
      ...stalledShowing,
      title: "Closed lead needs follow-up plan",
      recommendedAction: "Review post-close follow-up",
      reason: "Harwick should draft the thank-you and future check-in plan.",
      payload: {
        signalType: "lead_closed_follow_up",
        signalKey: "lead_closed_follow_up:lead-1:closed",
      },
    };

    const [showing, followUp] = await Promise.all([
      intelligizeHarwickWorkItem({
        context: {
          signalKey: "stalled_showing_approval:task-1",
          source: "proactive_insight",
          item: stalledShowing,
        },
      }),
      intelligizeHarwickWorkItem({
        context: {
          signalKey: "lead_closed_follow_up:lead-1:closed",
          source: "proactive_insight",
          item: closedLead,
        },
      }),
    ]);

    const showingActionPlan = readRecord(showing.payload["actionPlan"]);
    const showingFirstCall = Array.isArray(showingActionPlan?.["proposedToolCalls"])
      ? readRecord(showingActionPlan["proposedToolCalls"][0])
      : null;
    expect(readRecord(showingFirstCall?.["payload"])?.["subagentType"]).toBe("calendar");
    const followUpActionPlan = readRecord(followUp.payload["actionPlan"]);
    const followUpFirstCall = Array.isArray(followUpActionPlan?.["proposedToolCalls"])
      ? readRecord(followUpActionPlan["proposedToolCalls"][0])
      : null;
    expect(readRecord(followUpFirstCall?.["payload"])?.["subagentType"]).toBe("writer");
  });
});
