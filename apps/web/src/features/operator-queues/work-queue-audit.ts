import type {
  AuditLogEntry,
  CrmSyncActionRequest,
  FollowUpBossConflictActionRequest,
  FollowUpBossConflictItem,
  NurtureMessage,
  NurtureMessageActionRequest,
  OperationsFailureItem,
  ShowingApprovalActionRequest,
  ShowingApprovalActionResult,
  SocialReplyQueueActionRequest,
  SocialReplyQueueItem,
  VoiceHandoffQueueActionRequest,
  VoiceHandoffQueueItem,
  WorkflowJobActionRequest,
} from "@realty-ops/core";

export function buildSocialReplyQueueAuditEntry(params: {
  workspaceId: string;
  actorUserId: string | null;
  memberId: string;
  reviewId: string;
  request: SocialReplyQueueActionRequest;
  result: SocialReplyQueueItem;
  ipAddress?: string | null;
  userAgent?: string | null;
}): AuditLogEntry {
  return {
    workspaceId: params.workspaceId,
    userId: params.actorUserId,
    actorType: "user",
    action: "queue.social_reply_action",
    resourceType: "reply",
    resourceId: params.reviewId,
    metadata: {
      memberId: params.memberId,
      queueAction: params.request.action,
      resultingStatus: params.result.status,
      leadId: params.result.leadId,
      leadEventId: params.result.leadEventId,
      channel: params.result.channel,
      automationMode: params.result.automationMode,
      providerEventId: params.result.providerEventId,
      replyEdited: params.request.action === "approve" || params.request.action === "send"
        ? params.request.reply !== (params.result.suggestedReply ?? "")
        : false,
      dismissalReason: params.request.action === "dismiss" ? params.request.reason ?? null : null,
    },
    ipAddress: params.ipAddress ?? null,
    userAgent: params.userAgent ?? null,
  };
}

export function buildVoiceHandoffQueueAuditEntry(params: {
  workspaceId: string;
  actorUserId: string | null;
  memberId: string;
  handoffId: string;
  request: VoiceHandoffQueueActionRequest;
  result: VoiceHandoffQueueItem;
  ipAddress?: string | null;
  userAgent?: string | null;
}): AuditLogEntry {
  return {
    workspaceId: params.workspaceId,
    userId: params.actorUserId,
    actorType: "user",
    action: "queue.voice_handoff_action",
    resourceType: "voice_handoff",
    resourceId: params.handoffId,
    metadata: {
      memberId: params.memberId,
      queueAction: params.request.action,
      resultingStatus: params.result.reviewStatus,
      leadId: params.result.leadId,
      callId: params.result.callId,
      callbackTaskId: params.result.callbackTaskId,
      urgency: params.result.urgency,
      dismissalReason: params.request.action === "dismiss" ? params.request.reason ?? null : null,
    },
    ipAddress: params.ipAddress ?? null,
    userAgent: params.userAgent ?? null,
  };
}

export function buildHarwickWorkItemAuditEntry(params: {
  workspaceId: string;
  actorUserId: string | null;
  memberId: string;
  workItemId: string;
  action: "mark_seen" | "dismiss" | "complete" | "approve";
  resultStatus: string;
  leadId: string | null;
  feedbackLabel?: string | null;
  feedbackNote?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}): AuditLogEntry {
  return {
    workspaceId: params.workspaceId,
    userId: params.actorUserId,
    actorType: "user",
    action: "harwick_work_item.action",
    resourceType: "harwick_work_item",
    resourceId: params.workItemId,
    metadata: {
      memberId: params.memberId,
      queueAction: params.action,
      resultingStatus: params.resultStatus,
      leadId: params.leadId,
      feedbackLabel: params.feedbackLabel ?? null,
      feedbackNote: params.feedbackNote ?? null,
    },
    ipAddress: params.ipAddress ?? null,
    userAgent: params.userAgent ?? null,
  };
}

export function buildShowingTaskQueueAuditEntry(params: {
  workspaceId: string;
  actorUserId: string | null;
  memberId: string;
  taskId: string;
  request: ShowingApprovalActionRequest;
  result: ShowingApprovalActionResult;
  ipAddress?: string | null;
  userAgent?: string | null;
}): AuditLogEntry {
  return {
    workspaceId: params.workspaceId,
    userId: params.actorUserId,
    actorType: "user",
    action: "queue.showing_task_action",
    resourceType: "showing_task",
    resourceId: params.taskId,
    metadata: {
      memberId: params.memberId,
      queueAction: params.request.action,
      resultingStatus: params.result.status,
      leadId: params.result.status === "booked" ? params.result.leadId : null,
      provider: params.result.status === "booked" ? params.result.provider : null,
      calendarEventId: params.result.status === "booked" ? params.result.calendarEventId : null,
      reason: params.result.status === "dismissed" ? params.result.reason : null,
    },
    ipAddress: params.ipAddress ?? null,
    userAgent: params.userAgent ?? null,
  };
}

export function buildNurtureMessageQueueAuditEntry(params: {
  workspaceId: string;
  actorUserId: string | null;
  memberId: string;
  messageId: string;
  request: NurtureMessageActionRequest;
  result: NurtureMessage;
  ipAddress?: string | null;
  userAgent?: string | null;
}): AuditLogEntry {
  return {
    workspaceId: params.workspaceId,
    userId: params.actorUserId,
    actorType: "user",
    action: "queue.nurture_message_action",
    resourceType: "nurture_message",
    resourceId: params.messageId,
    metadata: {
      memberId: params.memberId,
      queueAction: params.request.action,
      resultingStatus: params.result.status,
      leadId: params.result.leadId,
      enrollmentId: params.result.enrollmentId,
      channel: params.result.channel,
      blockReason: params.result.blockReason,
      dismissalReason: params.request.action === "dismiss" ? params.request.reason ?? null : null,
    },
    ipAddress: params.ipAddress ?? null,
    userAgent: params.userAgent ?? null,
  };
}

export function buildOperationsFailureAuditEntry(params: {
  workspaceId: string;
  actorUserId: string | null;
  memberId: string;
  resourceId: string;
  request: WorkflowJobActionRequest | CrmSyncActionRequest;
  result: OperationsFailureItem;
  ipAddress?: string | null;
  userAgent?: string | null;
}): AuditLogEntry {
  return {
    workspaceId: params.workspaceId,
    userId: params.actorUserId,
    actorType: "user",
    action: "operations.failure_action",
    resourceType: params.result.itemType === "crm_sync" ? "crm_sync" : "workflow_job",
    resourceId: params.resourceId,
    metadata: {
      memberId: params.memberId,
      queueAction: params.request.action,
      resultingStatus: params.result.status,
      itemType: params.result.itemType,
      provider: params.result.provider,
      operation: params.result.operation,
      retryable: params.result.retryable,
    },
    ipAddress: params.ipAddress ?? null,
    userAgent: params.userAgent ?? null,
  };
}

export function buildFollowUpBossConflictAuditEntry(params: {
  workspaceId: string;
  actorUserId: string | null;
  memberId: string;
  backsyncEventId: string;
  request: FollowUpBossConflictActionRequest;
  result: FollowUpBossConflictItem;
  ipAddress?: string | null;
  userAgent?: string | null;
}): AuditLogEntry {
  return {
    workspaceId: params.workspaceId,
    userId: params.actorUserId,
    actorType: "user",
    action: "operations.fub_conflict_action",
    resourceType: "crm_backsync_event",
    resourceId: params.backsyncEventId,
    metadata: {
      memberId: params.memberId,
      queueAction: params.request.action,
      resultingStatus: params.result.status,
      leadId: params.result.leadId,
      followUpBossContactId: params.result.followUpBossContactId,
      eventType: params.result.eventType,
      ignoreReason: params.request.action === "ignore" ? params.request.reason ?? null : null,
    },
    ipAddress: params.ipAddress ?? null,
    userAgent: params.userAgent ?? null,
  };
}
