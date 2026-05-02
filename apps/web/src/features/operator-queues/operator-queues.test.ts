import { describe, expect, it, vi } from "vitest";
import type {
  SocialReplyQueueItem,
  VoiceHandoffQueueItem,
} from "@realty-ops/core";
import {
  actOnSocialReplyReview,
  actOnVoiceHandoff,
  loadSocialConversationThread,
  loadSocialReplyQueue,
  updateSocialReplyAutomation,
  type SocialReplyQueueRepository,
  type VoiceHandoffQueueRepository,
} from "./operator-queues";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const leadId = "22222222-2222-4222-8222-222222222222";
const memberId = "33333333-3333-4333-8333-333333333333";

function socialItem(overrides: Partial<SocialReplyQueueItem> = {}): SocialReplyQueueItem {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    workspaceId,
    leadId,
    leadEventId: "55555555-5555-4555-8555-555555555555",
    providerAccountId: "ig-1",
    recipientUserId: "user-1",
    channel: "instagram_dm",
    sourcePostId: null,
    sourceCommentId: null,
    inboundText: "Price?",
    suggestedReply: null,
    status: "pending",
    automationMode: "ai_on",
    automationReason: null,
    aiDecision: null,
    providerEventId: null,
    createdAt: "2026-04-29T12:00:00.000Z",
    updatedAt: "2026-04-29T12:00:00.000Z",
    ...overrides,
  };
}

function voiceItem(overrides: Partial<VoiceHandoffQueueItem> = {}): VoiceHandoffQueueItem {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    workspaceId,
    leadId,
    callId: "call-1",
    phone: "+17135551212",
    callerName: "Ari Buyer",
    urgency: "hot",
    summary: "Wants a showing this weekend.",
    status: "captured",
    reviewStatus: "pending",
    callbackTaskId: null,
    createdAt: "2026-04-29T12:00:00.000Z",
    updatedAt: "2026-04-29T12:00:00.000Z",
    ...overrides,
  };
}

describe("operator queues", () => {
  it("materializes pending social replies before listing the queue", async () => {
    const materializePendingSocialReplies = vi.fn<SocialReplyQueueRepository["materializePendingSocialReplies"]>()
      .mockResolvedValue(2);
    const repository: SocialReplyQueueRepository = {
      materializePendingSocialReplies,
      listSocialReplyReviews: vi.fn().mockResolvedValue([socialItem()]),
      listLeadActionabilityInputs: vi.fn().mockResolvedValue([{
        leadId,
        input: {
          sourceChannel: "instagram_dm",
          status: "qualified",
          intent: "medium",
          score: 62,
          assignedAgentId: memberId,
          nextFollowUpAt: null,
          followUpBossContactId: null,
        },
      }]),
      findSocialReplyReview: vi.fn(),
      updateSocialReplyReview: vi.fn(),
      setConversationAutomationForReview: vi.fn(),
      listSocialConversationThread: vi.fn(),
    };

    const queue = await loadSocialReplyQueue({ workspaceId, repository });

    expect(queue.items).toHaveLength(1);
    expect(materializePendingSocialReplies).toHaveBeenCalledWith({
      workspaceId,
      limit: 50,
    });
  });

  it("filters low-signal social replies out of the queue", async () => {
    const repository: SocialReplyQueueRepository = {
      materializePendingSocialReplies: vi.fn(),
      listSocialReplyReviews: vi.fn().mockResolvedValue([
        socialItem(),
        socialItem({
          id: "99999999-9999-4999-8999-999999999999",
          leadId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        }),
      ]),
      listLeadActionabilityInputs: vi.fn().mockResolvedValue([
        {
          leadId,
          input: {
            sourceChannel: "instagram_dm",
            status: "qualified",
            intent: "medium",
            score: 62,
            assignedAgentId: memberId,
            nextFollowUpAt: null,
            followUpBossContactId: null,
          },
        },
        {
          leadId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          input: {
            sourceChannel: "instagram_comment",
            status: "new",
            intent: "unknown",
            score: 0,
            assignedAgentId: null,
            nextFollowUpAt: null,
            followUpBossContactId: null,
          },
        },
      ]),
      findSocialReplyReview: vi.fn(),
      updateSocialReplyReview: vi.fn(),
      setConversationAutomationForReview: vi.fn(),
      listSocialConversationThread: vi.fn(),
    };

    const queue = await loadSocialReplyQueue({ workspaceId, repository });

    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]?.leadId).toBe(leadId);
  });

  it("approves a social reply without sending it", async () => {
    const updateSocialReplyReview = vi.fn<SocialReplyQueueRepository["updateSocialReplyReview"]>()
      .mockResolvedValue(socialItem({ status: "approved", suggestedReply: "Sending details." }));
    const repository: SocialReplyQueueRepository = {
      materializePendingSocialReplies: vi.fn(),
      listSocialReplyReviews: vi.fn(),
      listLeadActionabilityInputs: vi.fn(),
      findSocialReplyReview: vi.fn().mockResolvedValue(socialItem()),
      updateSocialReplyReview,
      setConversationAutomationForReview: vi.fn(),
      listSocialConversationThread: vi.fn(),
    };

    await actOnSocialReplyReview({
      workspaceId,
      reviewId: socialItem().id,
      memberId,
      request: { action: "approve", reply: "Sending details." },
      repository,
      now: () => new Date("2026-04-29T13:00:00.000Z"),
    });

    expect(updateSocialReplyReview).toHaveBeenCalledWith(expect.objectContaining({
      values: expect.objectContaining({
        status: "approved",
        suggestedReply: "Sending details.",
        reviewedByMemberId: memberId,
      }) as Record<string, unknown>,
    }));
  });

  it("sends a social reply through the sender and stores provider id", async () => {
    const updateSocialReplyReview = vi.fn<SocialReplyQueueRepository["updateSocialReplyReview"]>()
      .mockResolvedValue(socialItem({ status: "sent", providerEventId: "mid.1" }));
    const repository: SocialReplyQueueRepository = {
      materializePendingSocialReplies: vi.fn(),
      listSocialReplyReviews: vi.fn(),
      listLeadActionabilityInputs: vi.fn(),
      findSocialReplyReview: vi.fn().mockResolvedValue(socialItem()),
      updateSocialReplyReview,
      setConversationAutomationForReview: vi.fn(),
      listSocialConversationThread: vi.fn(),
    };

    await actOnSocialReplyReview({
      workspaceId,
      reviewId: socialItem().id,
      memberId,
      request: { action: "send", reply: "Sending details." },
      repository,
      sendReply: vi.fn().mockResolvedValue({
        status: 200,
        body: { providerEventId: "mid.1" },
      }),
    });

    expect(updateSocialReplyReview).toHaveBeenCalledWith(expect.objectContaining({
      values: expect.objectContaining({
        status: "sent",
        providerEventId: "mid.1",
      }) as Record<string, unknown>,
    }));
  });

  it("blocks social sends when automation is paused", async () => {
    const updateSocialReplyReview = vi.fn<SocialReplyQueueRepository["updateSocialReplyReview"]>()
      .mockResolvedValue(socialItem({ status: "failed", automationMode: "human_takeover" }));
    const repository: SocialReplyQueueRepository = {
      materializePendingSocialReplies: vi.fn(),
      listSocialReplyReviews: vi.fn(),
      listLeadActionabilityInputs: vi.fn(),
      findSocialReplyReview: vi.fn().mockResolvedValue(socialItem({ automationMode: "human_takeover" })),
      updateSocialReplyReview,
      setConversationAutomationForReview: vi.fn(),
      listSocialConversationThread: vi.fn(),
    };
    const sendReply = vi.fn();

    await actOnSocialReplyReview({
      workspaceId,
      reviewId: socialItem().id,
      memberId,
      request: { action: "send", reply: "Sending details." },
      repository,
      sendReply,
    });

    expect(sendReply).not.toHaveBeenCalled();
    expect(updateSocialReplyReview).toHaveBeenCalledWith(expect.objectContaining({
      values: expect.objectContaining({
        status: "failed",
        lastErrorCode: "automation_paused",
      }) as Record<string, unknown>,
    }));
  });

  it("updates social automation mode and stores an ai decision", async () => {
    const setConversationAutomationForReview = vi.fn<SocialReplyQueueRepository["setConversationAutomationForReview"]>()
      .mockResolvedValue(socialItem({ automationMode: "human_takeover" }));
    const repository: SocialReplyQueueRepository = {
      materializePendingSocialReplies: vi.fn(),
      listSocialReplyReviews: vi.fn(),
      listLeadActionabilityInputs: vi.fn(),
      findSocialReplyReview: vi.fn().mockResolvedValue(socialItem({ suggestedReply: "What area are you looking in?" })),
      updateSocialReplyReview: vi.fn(),
      setConversationAutomationForReview,
      listSocialConversationThread: vi.fn(),
    };

    await updateSocialReplyAutomation({
      workspaceId,
      reviewId: socialItem().id,
      memberId,
      request: { mode: "human_takeover", reason: "agent is replying live" },
      repository,
      now: () => new Date("2026-04-30T12:00:00.000Z"),
    });

    expect(setConversationAutomationForReview).toHaveBeenCalledWith(expect.objectContaining({
      review: expect.objectContaining({
        id: "44444444-4444-4444-8444-444444444444",
        leadId,
      }) as Record<string, unknown>,
      values: expect.objectContaining({
        automationMode: "human_takeover",
        automationReason: "agent is replying live",
        automationChangedByMemberId: memberId,
        aiDecision: expect.objectContaining({
          automationMode: "human_takeover",
          recommendedAction: "pause_for_owner",
        }) as Record<string, unknown>,
      }) as Record<string, unknown>,
    }));
  });

  it("creates callback tasks from voice handoffs", async () => {
    const updateVoiceHandoffReview = vi.fn<VoiceHandoffQueueRepository["updateVoiceHandoffReview"]>()
      .mockResolvedValue(voiceItem({ reviewStatus: "callback_created" }));
    const createCallbackTask = vi.fn<VoiceHandoffQueueRepository["createCallbackTask"]>()
      .mockResolvedValue({ taskId: "77777777-7777-4777-8777-777777777777" });
    const repository: VoiceHandoffQueueRepository = {
      listVoiceHandoffs: vi.fn(),
      findVoiceHandoff: vi.fn().mockResolvedValue(voiceItem()),
      createCallbackTask,
      updateVoiceHandoffReview,
    };

    await actOnVoiceHandoff({
      workspaceId,
      handoffId: voiceItem().id,
      memberId,
      request: { action: "create_callback_task" },
      repository,
    });

    expect(createCallbackTask).toHaveBeenCalledWith(expect.objectContaining({
      priority: "urgent",
      description: "Wants a showing this weekend.",
    }));
    expect(updateVoiceHandoffReview).toHaveBeenCalledWith(expect.objectContaining({
      values: expect.objectContaining({
        reviewStatus: "callback_created",
        callbackTaskId: "77777777-7777-4777-8777-777777777777",
      }) as Record<string, unknown>,
    }));
  });

  it("loads the social conversation thread for a review", async () => {
    const listSocialConversationThread = vi.fn<SocialReplyQueueRepository["listSocialConversationThread"]>()
      .mockResolvedValue([{
        id: "88888888-8888-4888-8888-888888888888",
        workspaceId,
        leadId,
        provider: "meta",
        eventType: "message_received",
        channel: "instagram_dm",
        text: "Can I see this?",
        occurredAt: "2026-04-29T12:05:00.000Z",
      }]);
    const repository: SocialReplyQueueRepository = {
      materializePendingSocialReplies: vi.fn(),
      listSocialReplyReviews: vi.fn(),
      listLeadActionabilityInputs: vi.fn(),
      findSocialReplyReview: vi.fn().mockResolvedValue(socialItem()),
      updateSocialReplyReview: vi.fn(),
      setConversationAutomationForReview: vi.fn(),
      listSocialConversationThread,
    };

    const response = await loadSocialConversationThread({
      workspaceId,
      reviewId: socialItem().id,
      repository,
    });

    expect(response?.items).toHaveLength(1);
    expect(listSocialConversationThread).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId,
      review: expect.objectContaining({ id: socialItem().id }) as Record<string, unknown>,
      limit: 50,
    }));
  });
});
