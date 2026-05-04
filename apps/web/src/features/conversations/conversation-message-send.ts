import {
  ConversationMessageSendRequestSchema,
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
  recordManualOutboundMessage(params: {
    workspaceId: string;
    leadId: string;
    sourceChannel: LeadRow["source_channel"];
    reply: string;
    senderId?: string | null;
  }): Promise<{ status: 200; body: ConversationMessageSendResponse }>;
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
  senderId?: string | null;
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

  // Manual operator sends are always allowed regardless of conversation
  // automation mode — automation pause governs the AI runtime, not the
  // human operator. The human stepping in is the whole point of takeover.

  if (lead.source_channel === "manual" || lead.source_channel === "csv_import") {
    return params.repository.recordManualOutboundMessage({
      workspaceId: lead.workspace_id,
      leadId: lead.id,
      sourceChannel: lead.source_channel,
      reply: parsed.data.reply,
      senderId: params.senderId ?? null,
    });
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
    automationMode: "human_takeover",
  };

  const sendResult = await params.sendMetaReply(metaReplyRequest);
  return sendResult;
}
