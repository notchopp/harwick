import { describe, expect, it } from "vitest";
import type { ConversationInboxThread } from "@realty-ops/core";
import type { ConversationMessageRow } from "../../lib/supabase/conversation-messages";
import type { LeadRow } from "../../lib/supabase/leads";
import {
  applyRealtimeLeadUpdateToThreads,
  applyRealtimeMessageToThreads,
  messageMetaForRealtimeRow,
} from "./use-realtime-thread-sync";

const workspaceId = "123e4567-e89b-12d3-a456-426614174000";
const firstLeadId = "223e4567-e89b-12d3-a456-426614174000";
const secondLeadId = "323e4567-e89b-12d3-a456-426614174000";

function buildThread(overrides?: Partial<ConversationInboxThread>): ConversationInboxThread {
  const leadId = overrides?.leadId ?? firstLeadId;
  return {
    id: leadId,
    workspaceId,
    leadId,
    reviewId: null,
    name: "Sophia Nguyen",
    initials: "SN",
    lastTouchLabel: "4m",
    unread: false,
    preview: "Earlier message",
    source: "instagram",
    sourceLabel: "Instagram",
    channelLabel: "DM",
    sourceContext: "DM with @sophia",
    bucket: "dms",
    assignedTo: "Owner review",
    stageLabel: "New",
    stageTone: "new",
    score: 52,
    scoreLabel: "52 / 100",
    followUpBossContactId: null,
    intentType: "Unknown",
    area: "Unknown",
    timeline: "Unknown",
    budget: "Unknown",
    listingTitle: "Conversation context",
    listingDetails: "Instagram DM · last touch 4m",
    listingStatus: "Live conversation",
    automationMode: null,
    automationReason: null,
    aiSynthesis: null,
    messages: [
      {
        id: "message_existing",
        kind: "lead",
        body: "Earlier message",
        meta: "9:00 AM · Instagram DM",
        occurredAt: "2026-05-25T13:00:00.000Z",
        agentTrajectoryId: null,
        agentStepId: null,
      },
    ],
    ...overrides,
  };
}

function buildMessage(overrides?: Partial<ConversationMessageRow>): ConversationMessageRow {
  return {
    id: "message_new",
    lead_id: firstLeadId,
    workspace_id: workspaceId,
    sender_type: "customer",
    sender_id: null,
    body: "Can Harwick send me this listing?",
    created_at: "2026-05-25T13:05:00.000Z",
    updated_at: "2026-05-25T13:05:00.000Z",
    status: "sent",
    source_channel: "instagram_dm",
    provider_message_id: "provider_message_1",
    error_code: null,
    error_message: null,
    agent_trajectory_id: null,
    agent_step_id: null,
    ...overrides,
  };
}

describe("realtime conversation thread sync helpers", () => {
  it("appends workspace message inserts to the matching loaded thread", () => {
    const threads = [
      buildThread({ id: firstLeadId, leadId: firstLeadId }),
      buildThread({ id: secondLeadId, leadId: secondLeadId, name: "Omar Banks" }),
    ];

    const updated = applyRealtimeMessageToThreads({
      current: threads,
      message: buildMessage(),
      selectedThreadId: firstLeadId,
    });

    expect(updated[0]?.messages).toHaveLength(2);
    expect(updated[0]?.messages[1]).toMatchObject({
      id: "message_new",
      kind: "lead",
      body: "Can Harwick send me this listing?",
      meta: "Customer replied",
    });
    expect(updated[0]?.preview).toBe("Can Harwick send me this listing?");
    expect(updated[0]?.lastTouchLabel).toBe("now");
    expect(updated[0]?.unread).toBe(false);
    expect(updated[1]).toBe(threads[1]);
  });

  it("deduplicates repeated realtime message payloads", () => {
    const message = buildMessage();
    const withMessage = applyRealtimeMessageToThreads({
      current: [buildThread()],
      message,
      selectedThreadId: null,
    });

    const repeated = applyRealtimeMessageToThreads({
      current: withMessage,
      message,
      selectedThreadId: null,
    });

    expect(repeated[0]?.messages.filter((item) => item.id === message.id)).toHaveLength(1);
  });

  it("marks non-selected thread inserts as unread", () => {
    const updated = applyRealtimeMessageToThreads({
      current: [buildThread({ id: firstLeadId, leadId: firstLeadId })],
      message: buildMessage(),
      selectedThreadId: secondLeadId,
    });

    expect(updated[0]?.unread).toBe(true);
  });

  it("updates lead context for any loaded thread in the workspace", () => {
    const updatedLead: Partial<LeadRow> = {
      id: secondLeadId,
      full_name: "Omar Banks",
      intent: "high",
      score: 81,
      budget_min: 650000,
      budget_max: 825000,
      timeline: "0-30 days",
    };

    const updated = applyRealtimeLeadUpdateToThreads({
      current: [
        buildThread({ id: firstLeadId, leadId: firstLeadId }),
        buildThread({ id: secondLeadId, leadId: secondLeadId, name: "Unknown lead" }),
      ],
      lead: updatedLead,
    });

    expect(updated[0]?.name).toBe("Sophia Nguyen");
    expect(updated[1]).toMatchObject({
      name: "Omar Banks",
      sourceContext: "high | Score: 81",
      budget: "$650k-$825k",
      timeline: "0-30 days",
      score: 81,
      scoreLabel: "81 / 100",
    });
  });

  it("keeps existing context when a partial lead update lacks those fields", () => {
    const thread = buildThread({
      budget: "$500k-$600k",
      sourceContext: "DM with @sophia",
      timeline: "60-90 days",
    });

    const updated = applyRealtimeLeadUpdateToThreads({
      current: [thread],
      lead: {
        id: firstLeadId,
        full_name: null,
      },
    });

    expect(updated[0]).toMatchObject({
      name: "Sophia Nguyen",
      sourceContext: "DM with @sophia",
      budget: "$500k-$600k",
      timeline: "60-90 days",
    });
  });

  it("labels failed and sending message states in realtime metadata", () => {
    expect(messageMetaForRealtimeRow(buildMessage({ sender_type: "ai", status: "failed" }))).toBe("Harwick AI · failed");
    expect(messageMetaForRealtimeRow(buildMessage({ sender_type: "operator", status: "in_progress" }))).toBe("Operator replied · sending");
  });
});
