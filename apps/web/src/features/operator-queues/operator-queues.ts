import {
  canAutomationSend,
  classifyHarwickLeadActionability,
  decideHarwickAiNextAction,
  SocialReplyQueueActionRequestSchema,
  SocialReplyAutomationControlRequestSchema,
  SocialReplyQueueResponseSchema,
  SocialConversationThreadResponseSchema,
  VoiceHandoffQueueActionRequestSchema,
  VoiceHandoffQueueResponseSchema,
  type SendMetaReplyRequest,
  type HarwickLeadActionabilityInput,
  type SocialConversationThreadItem,
  type SocialConversationThreadResponse,
  type SocialReplyAutomationControlRequest,
  type SocialReplyQueueActionRequest,
  type SocialReplyQueueItem,
  type SocialReplyQueueResponse,
  type VoiceHandoffQueueActionRequest,
  type VoiceHandoffQueueItem,
  type VoiceHandoffQueueResponse,
} from "@realty-ops/core";

export type SocialReplyQueueRepository = {
  materializePendingSocialReplies(params: {
    workspaceId: string;
    limit: number;
  }): Promise<number>;
  listSocialReplyReviews(params: {
    workspaceId: string;
    limit: number;
  }): Promise<SocialReplyQueueItem[]>;
  listLeadActionabilityInputs(params: {
    workspaceId: string;
    leadIds: string[];
  }): Promise<Array<{ leadId: string; input: HarwickLeadActionabilityInput }>>;
  findSocialReplyReview(params: {
    workspaceId: string;
    reviewId: string;
  }): Promise<SocialReplyQueueItem | null>;
  updateSocialReplyReview(params: {
    workspaceId: string;
    reviewId: string;
    values: {
      status: SocialReplyQueueItem["status"];
      automationMode?: SocialReplyQueueItem["automationMode"];
      automationReason?: string | null;
      automationChangedByMemberId?: string | null;
      automationChangedAt?: string | null;
      aiDecision?: SocialReplyQueueItem["aiDecision"];
      suggestedReply?: string | null;
      reviewedByMemberId?: string | null;
      reviewedAt?: string | null;
      providerEventId?: string | null;
      dismissalReason?: string | null;
      lastErrorCode?: string | null;
      lastErrorMessage?: string | null;
    };
  }): Promise<SocialReplyQueueItem | null>;
  setConversationAutomationForReview(params: {
    workspaceId: string;
    review: SocialReplyQueueItem;
    values: {
      automationMode: SocialReplyQueueItem["automationMode"];
      automationReason: string;
      automationChangedByMemberId: string;
      automationChangedAt: string;
      aiDecision: SocialReplyQueueItem["aiDecision"];
    };
  }): Promise<SocialReplyQueueItem | null>;
  listSocialConversationThread(params: {
    workspaceId: string;
    review: SocialReplyQueueItem;
    limit: number;
  }): Promise<SocialConversationThreadItem[]>;
};

export type VoiceHandoffQueueRepository = {
  listVoiceHandoffs(params: {
    workspaceId: string;
    limit: number;
  }): Promise<VoiceHandoffQueueItem[]>;
  findVoiceHandoff(params: {
    workspaceId: string;
    handoffId: string;
  }): Promise<VoiceHandoffQueueItem | null>;
  createCallbackTask(params: {
    workspaceId: string;
    leadId: string;
    title: string;
    description: string;
    priority: "normal" | "high" | "urgent";
  }): Promise<{ taskId: string }>;
  updateVoiceHandoffReview(params: {
    workspaceId: string;
    handoffId: string;
    values: {
      reviewStatus: VoiceHandoffQueueItem["reviewStatus"];
      reviewedByMemberId: string;
      reviewedAt: string;
      callbackTaskId?: string | null;
      dismissalReason?: string | null;
    };
  }): Promise<VoiceHandoffQueueItem | null>;
};

export type MetaReplySender = (request: SendMetaReplyRequest) => Promise<{
  status: 200 | 400 | 404;
  body: {
    providerEventId?: string;
    error?: string;
  };
}>;

export async function loadSocialReplyQueue(params: {
  workspaceId: string;
  repository: SocialReplyQueueRepository;
  limit?: number;
}): Promise<SocialReplyQueueResponse> {
  const limit = Math.min(params.limit ?? 50, 100);
  await params.repository.materializePendingSocialReplies({
    workspaceId: params.workspaceId,
    limit,
  });
  const items = await params.repository.listSocialReplyReviews({
    workspaceId: params.workspaceId,
    limit,
  });
  const leadIds = [...new Set(items.flatMap((item) => item.leadId === null ? [] : [item.leadId]))];
  const actionableLeadIds = new Set((await params.repository.listLeadActionabilityInputs({
    workspaceId: params.workspaceId,
    leadIds,
  }))
    .flatMap((entry) => {
      return classifyHarwickLeadActionability(entry.input).shouldShow ? [entry.leadId] : [];
    }));

  return SocialReplyQueueResponseSchema.parse({
    workspaceId: params.workspaceId,
    items: items.filter((item) => {
      if (item.status !== "pending" && item.status !== "approved" && item.status !== "failed") {
        return false;
      }

      return item.leadId !== null && actionableLeadIds.has(item.leadId);
    }),
  });
}

export async function actOnSocialReplyReview(params: {
  workspaceId: string;
  reviewId: string;
  memberId: string;
  request: unknown;
  repository: SocialReplyQueueRepository;
  sendReply?: MetaReplySender;
  now?: () => Date;
}): Promise<SocialReplyQueueItem | null> {
  const action: SocialReplyQueueActionRequest = SocialReplyQueueActionRequestSchema.parse(params.request);
  const review = await params.repository.findSocialReplyReview({
    workspaceId: params.workspaceId,
    reviewId: params.reviewId,
  });
  if (review === null) {
    return null;
  }

  const reviewedAt = (params.now?.() ?? new Date()).toISOString();
  if (action.action === "approve") {
    return params.repository.updateSocialReplyReview({
      workspaceId: params.workspaceId,
      reviewId: params.reviewId,
      values: {
        status: "approved",
        suggestedReply: action.reply,
        reviewedByMemberId: params.memberId,
        reviewedAt,
      },
    });
  }

  if (action.action === "dismiss") {
    return params.repository.updateSocialReplyReview({
      workspaceId: params.workspaceId,
      reviewId: params.reviewId,
      values: {
        status: "dismissed",
        reviewedByMemberId: params.memberId,
        reviewedAt,
        dismissalReason: action.reason ?? null,
      },
    });
  }

  if (!canAutomationSend(review.automationMode)) {
    return params.repository.updateSocialReplyReview({
      workspaceId: params.workspaceId,
      reviewId: params.reviewId,
      values: {
        status: "failed",
        suggestedReply: action.reply,
        reviewedByMemberId: params.memberId,
        reviewedAt,
        lastErrorCode: "automation_paused",
        lastErrorMessage: "Harwick AI is not allowed to send while this conversation is paused or in human takeover.",
      },
    });
  }

  if (params.sendReply === undefined) {
    return params.repository.updateSocialReplyReview({
      workspaceId: params.workspaceId,
      reviewId: params.reviewId,
      values: {
        status: "failed",
        suggestedReply: action.reply,
        reviewedByMemberId: params.memberId,
        reviewedAt,
        lastErrorCode: "sender_not_configured",
        lastErrorMessage: "Meta reply sender is not configured.",
      },
    });
  }

  const response = await params.sendReply({
    workspaceId: review.workspaceId,
    leadId: review.leadId,
    providerAccountId: review.providerAccountId,
    channel: review.channel,
    recipientUserId: review.recipientUserId,
    sourceCommentId: review.sourceCommentId,
    sourcePostId: review.sourcePostId,
    reply: action.reply,
    automationMode: review.automationMode,
  });

  return params.repository.updateSocialReplyReview({
    workspaceId: params.workspaceId,
    reviewId: params.reviewId,
    values: response.status === 200
      ? {
          status: "sent",
          suggestedReply: action.reply,
          reviewedByMemberId: params.memberId,
          reviewedAt,
          providerEventId: response.body.providerEventId ?? null,
          lastErrorCode: null,
          lastErrorMessage: null,
        }
      : {
          status: "failed",
          suggestedReply: action.reply,
          reviewedByMemberId: params.memberId,
          reviewedAt,
          lastErrorCode: response.body.error ?? "meta_reply_failed",
          lastErrorMessage: response.body.error ?? "Meta reply send failed.",
        },
  });
}

export async function updateSocialReplyAutomation(params: {
  workspaceId: string;
  reviewId: string;
  memberId: string;
  request: unknown;
  repository: SocialReplyQueueRepository;
  now?: () => Date;
}): Promise<SocialReplyQueueItem | null> {
  const action: SocialReplyAutomationControlRequest = SocialReplyAutomationControlRequestSchema.parse(params.request);
  const review = await params.repository.findSocialReplyReview({
    workspaceId: params.workspaceId,
    reviewId: params.reviewId,
  });
  if (review === null) {
    return null;
  }

  const changedAt = (params.now?.() ?? new Date()).toISOString();
  const reason = action.reason ?? (action.mode === "ai_on"
    ? "operator resumed Harwick AI for this conversation"
    : action.mode === "human_takeover"
      ? "operator took over this conversation"
      : "Harwick paused this conversation because a rule needs review");

  const aiDecision = decideHarwickAiNextAction({
    viewerRole: "lead_manager",
    automationMode: action.mode,
    inboundText: review.inboundText,
    suggestedReply: review.suggestedReply,
    lead: {
      id: review.leadId,
      sourceChannel: review.channel,
      leadType: "unknown",
      intent: "unknown",
      timeline: null,
      budget: null,
      targetArea: null,
      propertyType: null,
      financingStatus: "unknown",
      score: 0,
      assignedAgentName: null,
      sourceOwnerName: null,
      listingLabel: null,
    },
  });

  return params.repository.setConversationAutomationForReview({
    workspaceId: params.workspaceId,
    review,
    values: {
      automationMode: action.mode,
      automationReason: reason,
      automationChangedByMemberId: params.memberId,
      automationChangedAt: changedAt,
      aiDecision,
    },
  });
}

export async function loadSocialConversationThread(params: {
  workspaceId: string;
  reviewId: string;
  repository: SocialReplyQueueRepository;
  limit?: number;
}): Promise<SocialConversationThreadResponse | null> {
  const review = await params.repository.findSocialReplyReview({
    workspaceId: params.workspaceId,
    reviewId: params.reviewId,
  });
  if (review === null) {
    return null;
  }

  return SocialConversationThreadResponseSchema.parse({
    workspaceId: params.workspaceId,
    reviewId: params.reviewId,
    leadId: review.leadId,
    items: await params.repository.listSocialConversationThread({
      workspaceId: params.workspaceId,
      review,
      limit: Math.min(params.limit ?? 50, 100),
    }),
  });
}

export async function loadVoiceHandoffQueue(params: {
  workspaceId: string;
  repository: VoiceHandoffQueueRepository;
  limit?: number;
}): Promise<VoiceHandoffQueueResponse> {
  const items = await params.repository.listVoiceHandoffs({
    workspaceId: params.workspaceId,
    limit: Math.min(params.limit ?? 50, 100),
  });

  return VoiceHandoffQueueResponseSchema.parse({
    workspaceId: params.workspaceId,
    items: items.filter((item) => item.reviewStatus === "pending" || item.reviewStatus === "callback_created"),
  });
}

export async function actOnVoiceHandoff(params: {
  workspaceId: string;
  handoffId: string;
  memberId: string;
  request: unknown;
  repository: VoiceHandoffQueueRepository;
  now?: () => Date;
}): Promise<VoiceHandoffQueueItem | null> {
  const action: VoiceHandoffQueueActionRequest = VoiceHandoffQueueActionRequestSchema.parse(params.request);
  const handoff = await params.repository.findVoiceHandoff({
    workspaceId: params.workspaceId,
    handoffId: params.handoffId,
  });
  if (handoff === null) {
    return null;
  }

  const reviewedAt = (params.now?.() ?? new Date()).toISOString();
  if (action.action === "dismiss") {
    return params.repository.updateVoiceHandoffReview({
      workspaceId: params.workspaceId,
      handoffId: params.handoffId,
      values: {
        reviewStatus: "dismissed",
        reviewedByMemberId: params.memberId,
        reviewedAt,
        dismissalReason: action.reason ?? null,
      },
    });
  }

  if (action.action === "mark_reviewed") {
    return params.repository.updateVoiceHandoffReview({
      workspaceId: params.workspaceId,
      handoffId: params.handoffId,
      values: {
        reviewStatus: "reviewed",
        reviewedByMemberId: params.memberId,
        reviewedAt,
      },
    });
  }

  if (handoff.leadId === null) {
    return null;
  }

  const task = await params.repository.createCallbackTask({
    workspaceId: params.workspaceId,
    leadId: handoff.leadId,
    title: action.title ?? "Call back voice lead",
    description: action.description ?? handoff.summary,
    priority: action.priority ?? (handoff.urgency === "hot" ? "urgent" : "high"),
  });

  return params.repository.updateVoiceHandoffReview({
    workspaceId: params.workspaceId,
    handoffId: params.handoffId,
    values: {
      reviewStatus: "callback_created",
      reviewedByMemberId: params.memberId,
      reviewedAt,
      callbackTaskId: task.taskId,
    },
  });
}
