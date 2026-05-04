import type { NormalizedLeadEvent } from "@realty-ops/core";
import type { HarwickAiTurnGeneratorService } from "./harwick-ai-turn-generator";
import type { WorkflowJobEnqueuer } from "../../lib/supabase/workflow-jobs";
import type { ConversationMessageRepository } from "../../lib/supabase/conversation-messages";
import { loadAiConversationHistory } from "./harwick-ai-conversation-history";

export type MetaToHarwickAiBridgeParams = {
  generatorService: HarwickAiTurnGeneratorService;
  enqueueWorkflowJob: WorkflowJobEnqueuer;
  conversationMessageRepository?: ConversationMessageRepository;
};

export type GenerateAndEnqueueHarwickAiTurnParams = {
  workspaceId: string;
  leadId: string | null;
  event: NormalizedLeadEvent;
};

export async function generateAndEnqueueHarwickAiTurn(
  params: GenerateAndEnqueueHarwickAiTurnParams,
  bridge: MetaToHarwickAiBridgeParams,
): Promise<void> {
  if (
    params.event.provider !== "meta"
    || !params.event.text
    || params.leadId === null
    || params.event.providerAccountId === null
  ) {
    return;
  }

  // Only process DM and comment channels (not other event types)
  const validChannels = [
    "instagram_dm",
    "instagram_comment",
    "facebook_dm",
    "facebook_comment",
  ] as const;
  
  if (!validChannels.includes(params.event.sourceChannel as typeof validChannels[number])) {
    return;
  }

  const channel = params.event.sourceChannel as typeof validChannels[number];

  const conversationHistory = bridge.conversationMessageRepository === undefined
    ? []
    : await loadAiConversationHistory({
        leadId: params.leadId,
        repository: bridge.conversationMessageRepository,
      });

  const turn = await bridge.generatorService.generateAndPersistTurn({
    workspaceId: params.workspaceId,
    leadId: params.leadId,
    socialReplyReviewId: null,
    providerThreadId: params.event.providerUserId,
    channel,
    inboundText: params.event.text,
    context: {
      conversationHistory,
      workspaceName: "Workspace",
      toneProfile: {},
      listingContext: null,
      calendarContext: [],
      postContext: null,
    },
  });

  // Enqueue harwick_ai_reply job to execute the turn
  await bridge.enqueueWorkflowJob({
    workspaceId: params.workspaceId,
    leadId: params.leadId,
    leadEventId: null,
    jobType: "harwick_ai_reply",
    idempotencyKey: `harwick_ai_reply:${params.event.providerEventId}`,
    payload: {
      jobType: "harwick_ai_reply",
      workspaceId: params.workspaceId,
      leadId: params.leadId,
      turnId: turn.turnId,
      socialReplyReviewId: null,
      channel,
      providerAccountId: params.event.providerAccountId,
      recipientUserId: params.event.providerUserId,
      sourceCommentId: params.event.sourceCommentId,
      sourcePostId: params.event.sourcePostId,
    },
  });
}

export function createMetaToHarwickAiBridge(
  generatorService: HarwickAiTurnGeneratorService,
  enqueueWorkflowJob: WorkflowJobEnqueuer,
  conversationMessageRepository?: ConversationMessageRepository,
): MetaToHarwickAiBridgeParams {
  return {
    generatorService,
    enqueueWorkflowJob,
    ...(conversationMessageRepository === undefined ? {} : { conversationMessageRepository }),
  };
}
