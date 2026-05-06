import { describe, expect, it } from "vitest";
import type { FollowUpBossConflictItem, NurtureMessage, OperationsFailureItem, SocialReplyQueueItem, VoiceHandoffQueueItem } from "@realty-ops/core";
import {
  buildFollowUpBossConflictAuditEntry,
  buildHarwickWorkItemAuditEntry,
  buildNurtureMessageQueueAuditEntry,
  buildOperationsFailureAuditEntry,
  buildShowingTaskQueueAuditEntry,
  buildSocialReplyQueueAuditEntry,
  buildVoiceHandoffQueueAuditEntry,
} from "./work-queue-audit";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const memberId = "33333333-3333-4333-8333-333333333333";
const leadId = "22222222-2222-4222-8222-222222222222";

const socialReply: SocialReplyQueueItem = {
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
  suggestedReply: "Sending details.",
  status: "sent",
  automationMode: "human_takeover",
  automationReason: null,
  aiDecision: null,
  providerEventId: "mid.1",
  createdAt: "2026-04-29T12:00:00.000Z",
  updatedAt: "2026-04-29T12:00:00.000Z",
};

const voiceHandoff: VoiceHandoffQueueItem = {
  id: "66666666-6666-4666-8666-666666666666",
  workspaceId,
  leadId,
  callId: "call-1",
  phone: "+17135551212",
  callerName: "Ari Buyer",
  urgency: "hot",
  summary: "Wants a showing this weekend.",
  status: "captured",
  reviewStatus: "callback_created",
  callbackTaskId: "77777777-7777-4777-8777-777777777777",
  createdAt: "2026-04-29T12:00:00.000Z",
  updatedAt: "2026-04-29T12:00:00.000Z",
};

const nurtureMessage: NurtureMessage = {
  id: "99999999-9999-4999-8999-999999999999",
  workspaceId,
  leadId,
  enrollmentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  channel: "sms",
  status: "queued",
  stepIndex: 1,
  body: "Checking in.",
  blockReason: null,
  providerMessageId: null,
  scheduledFor: "2026-04-29T12:00:00.000Z",
  sentAt: null,
  lastErrorCode: null,
  lastErrorMessage: null,
  createdAt: "2026-04-29T12:00:00.000Z",
  updatedAt: "2026-04-29T12:00:00.000Z",
};

const operationsFailure: OperationsFailureItem = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  workspaceId,
  itemType: "workflow_job",
  title: "FUB sync failed",
  detail: "retryable provider failure",
  status: "retry_queued",
  retryable: true,
  occurredAt: "2026-04-29T12:00:00.000Z",
  provider: "follow_up_boss",
  operation: "sync_contact",
};

const fubConflict: FollowUpBossConflictItem = {
  id: "fub_conflict:dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  workspaceId,
  leadId,
  followUpBossContactId: "981",
  assignedAgentId: memberId,
  eventType: "peopleUpdated",
  status: "queued",
  detail: "person updated",
  occurredAt: "2026-04-29T12:00:00.000Z",
};

describe("work queue audit builders", () => {
  it("builds social reply queue audit entries without storing reply text", () => {
    const entry = buildSocialReplyQueueAuditEntry({
      workspaceId,
      actorUserId: null,
      memberId,
      reviewId: socialReply.id,
      request: { action: "send", reply: "Edited reply text" },
      result: socialReply,
      ipAddress: "203.0.113.1",
      userAgent: "test-agent",
    });

    expect(entry).toMatchObject({
      workspaceId,
      userId: null,
      actorType: "user",
      action: "queue.social_reply_action",
      resourceType: "reply",
      resourceId: socialReply.id,
      ipAddress: "203.0.113.1",
      userAgent: "test-agent",
    });
    expect(entry.metadata).toMatchObject({
      memberId,
      queueAction: "send",
      resultingStatus: "sent",
      leadId,
      automationMode: "human_takeover",
      replyEdited: true,
    });
    expect(JSON.stringify(entry.metadata)).not.toContain("Edited reply text");
  });

  it("builds voice handoff queue audit entries", () => {
    const entry = buildVoiceHandoffQueueAuditEntry({
      workspaceId,
      actorUserId: null,
      memberId,
      handoffId: voiceHandoff.id,
      request: { action: "create_callback_task" },
      result: voiceHandoff,
    });

    expect(entry).toMatchObject({
      action: "queue.voice_handoff_action",
      resourceType: "voice_handoff",
      resourceId: voiceHandoff.id,
    });
    expect(entry.metadata).toMatchObject({
      memberId,
      queueAction: "create_callback_task",
      resultingStatus: "callback_created",
      leadId,
      callbackTaskId: "77777777-7777-4777-8777-777777777777",
      urgency: "hot",
    });
  });

  it("builds Harwick work-item audit entries", () => {
    const entry = buildHarwickWorkItemAuditEntry({
      workspaceId,
      actorUserId: null,
      memberId,
      workItemId: "88888888-8888-4888-8888-888888888888",
      action: "dismiss",
      resultStatus: "dismissed",
      leadId,
      feedbackLabel: "not_relevant",
      feedbackNote: "Wrong queue owner",
    });

    expect(entry).toMatchObject({
      action: "harwick_work_item.action",
      resourceType: "harwick_work_item",
      resourceId: "88888888-8888-4888-8888-888888888888",
    });
    expect(entry.metadata).toMatchObject({
      memberId,
      queueAction: "dismiss",
      resultingStatus: "dismissed",
      leadId,
      feedbackLabel: "not_relevant",
      feedbackNote: "Wrong queue owner",
    });
  });

  it("builds showing task queue audit entries without appointment note text", () => {
    const entry = buildShowingTaskQueueAuditEntry({
      workspaceId,
      actorUserId: null,
      memberId,
      taskId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      request: {
        action: "approve_and_book",
        start: "2026-04-30T15:00:00.000Z",
        end: "2026-04-30T15:30:00.000Z",
        note: "Private showing note",
      },
      result: {
        status: "booked",
        taskId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        leadId,
        memberId,
        provider: "google",
        calendarId: "primary",
        calendarEventId: "event-1",
        start: "2026-04-30T15:00:00.000Z",
        end: "2026-04-30T15:30:00.000Z",
      },
    });

    expect(entry).toMatchObject({
      action: "queue.showing_task_action",
      resourceType: "showing_task",
    });
    expect(entry.metadata).toMatchObject({
      queueAction: "approve_and_book",
      resultingStatus: "booked",
      leadId,
      provider: "google",
      calendarEventId: "event-1",
    });
    expect(JSON.stringify(entry.metadata)).not.toContain("Private showing note");
  });

  it("builds nurture message queue audit entries without message body", () => {
    const entry = buildNurtureMessageQueueAuditEntry({
      workspaceId,
      actorUserId: null,
      memberId,
      messageId: nurtureMessage.id,
      request: { action: "approve_send" },
      result: nurtureMessage,
    });

    expect(entry).toMatchObject({
      action: "queue.nurture_message_action",
      resourceType: "nurture_message",
    });
    expect(entry.metadata).toMatchObject({
      queueAction: "approve_send",
      resultingStatus: "queued",
      leadId,
      channel: "sms",
    });
    expect(JSON.stringify(entry.metadata)).not.toContain("Checking in.");
  });

  it("builds operations failure audit entries", () => {
    const entry = buildOperationsFailureAuditEntry({
      workspaceId,
      actorUserId: null,
      memberId,
      resourceId: operationsFailure.id,
      request: { action: "retry_now" },
      result: operationsFailure,
    });

    expect(entry).toMatchObject({
      action: "operations.failure_action",
      resourceType: "workflow_job",
      resourceId: operationsFailure.id,
    });
    expect(entry.metadata).toMatchObject({
      queueAction: "retry_now",
      resultingStatus: "retry_queued",
      itemType: "workflow_job",
      provider: "follow_up_boss",
      operation: "sync_contact",
    });
  });

  it("builds Follow Up Boss conflict audit entries without freeform reason text leakage beyond metadata reason", () => {
    const entry = buildFollowUpBossConflictAuditEntry({
      workspaceId,
      actorUserId: null,
      memberId,
      backsyncEventId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      request: { action: "replay" },
      result: fubConflict,
    });

    expect(entry).toMatchObject({
      action: "operations.fub_conflict_action",
      resourceType: "crm_backsync_event",
      resourceId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    });
    expect(entry.metadata).toMatchObject({
      memberId,
      queueAction: "replay",
      resultingStatus: "queued",
      leadId,
      followUpBossContactId: "981",
      eventType: "peopleUpdated",
    });
  });
});
