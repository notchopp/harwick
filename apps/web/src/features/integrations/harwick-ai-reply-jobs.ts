import {
  HarwickAiAutomationDecisionSchema,
  type EnqueueWorkflowJobInput,
  type SocialReplyQueueItem,
} from "@realty-ops/core";

function hasApprovedMetaTool(
  approvedTools: readonly string[],
  expectedTool: "send_meta_dm" | "send_meta_reply",
) {
  return approvedTools.includes("send_meta_message") || approvedTools.includes(expectedTool);
}

export function buildHarwickAiReplyJobInput(params: {
  turnId: string;
  review: SocialReplyQueueItem;
  automationDecision: unknown;
}): EnqueueWorkflowJobInput | null {
  const automationDecision = HarwickAiAutomationDecisionSchema.parse(params.automationDecision);
  if (!automationDecision.canAutoExecute) {
    return null;
  }

  if (params.review.channel === "instagram_dm" || params.review.channel === "facebook_dm") {
    if (
      params.review.recipientUserId === null
      || !hasApprovedMetaTool(automationDecision.approvedTools, "send_meta_dm")
    ) {
      return null;
    }
  } else if (
    params.review.sourceCommentId === null
    || !hasApprovedMetaTool(automationDecision.approvedTools, "send_meta_reply")
  ) {
    return null;
  }

  return {
    workspaceId: params.review.workspaceId,
    leadId: params.review.leadId,
    leadEventId: params.review.leadEventId,
    jobType: "harwick_ai_reply",
    idempotencyKey: `harwick_ai_reply:${params.turnId}`,
    payload: {
      jobType: "harwick_ai_reply",
      workspaceId: params.review.workspaceId,
      ...(params.review.leadId === null ? {} : { leadId: params.review.leadId }),
      turnId: params.turnId,
      socialReplyReviewId: params.review.id,
      channel: params.review.channel,
      providerAccountId: params.review.providerAccountId,
      recipientUserId: params.review.recipientUserId,
      sourceCommentId: params.review.sourceCommentId,
      sourcePostId: params.review.sourcePostId,
    },
  };
}
