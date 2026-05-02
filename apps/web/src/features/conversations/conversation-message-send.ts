import {
  canAutomationSend,
  ConversationMessageSendRequestSchema,
  type ConversationAutomationMode,
  type ConversationMessageSendResponse,
  type SendMetaReplyRequest,
} from "@realty-ops/core";
import type { LeadRow } from "../../lib/supabase/leads";
import type { ConversationAutomationStateRow } from "../../lib/supabase/database.types";

export type ConversationMessageRepository = {
  findLeadByConversationId(conversationId: string): Promise<LeadRow | null>;
  findAutomationState(params: {
    workspaceId: string;
    leadId: string;
  }): Promise<ConversationAutomationStateRow | null>;
};

export type ConversationMessageSender = (
  request: SendMetaReplyRequest,
) => Promise<
  | { status: 200; body: ConversationMessageSendResponse }
  | { status: 400 | 404; body: { error: string } }
>;

export async function sendConversationMessage(params: {
  request: unknown;
  repository: ConversationMessageRepository;
  sendMetaReply: ConversationMessageSender;
}): Promise<
  | { status: 200; body: ConversationMessageSendResponse }
  | { status: 400 | 403 | 404; body: { error: string } }
> {
  const parsed = ConversationMessageSendRequestSchema.safeParse(params.request);
  if (!parsed.success) {
    return {
      status: 400,
      body: { error: "invalid_request" },
    };
  }

  const lead = await params.repository.findLeadByConversationId(parsed.data.conversationId);
  if (lead === null) {
    return {
      status: 404,
      body: { error: "conversation_not_found" },
    };
  }

  if (lead.workspace_id !== parsed.data.workspaceId) {
    return {
      status: 403,
      body: { error: "forbidden" },
    };
  }

  const automationState = await params.repository.findAutomationState({
    workspaceId: lead.workspace_id,
    leadId: lead.id,
  });
  const automationMode: ConversationAutomationMode = automationState?.automation_mode ?? "ai_on";

  if (!canAutomationSend(automationMode)) {
    return {
      status: 403,
      body: { error: "automation_paused" },
    };
  }

  if (
    lead.source_channel !== "instagram_dm"
    && lead.source_channel !== "instagram_comment"
    && lead.source_channel !== "facebook_dm"
    && lead.source_channel !== "facebook_comment"
  ) {
    return {
      status: 400,
      body: { error: "unsupported_channel" },
    };
  }

  if (lead.source_provider_id === null) {
    return {
      status: 400,
      body: { error: "missing_provider_account" },
    };
  }

  const metaReplyRequest: SendMetaReplyRequest = {
    workspaceId: lead.workspace_id,
    leadId: lead.id,
    providerAccountId: lead.source_provider_id,
    channel: lead.source_channel,
    recipientUserId: lead.instagram_user_id,
    sourceCommentId: lead.source_comment_id,
    sourcePostId: lead.source_post_id,
    reply: parsed.data.reply,
    automationMode,
  };

  const sendResult = await params.sendMetaReply(metaReplyRequest);
  return sendResult;
}
