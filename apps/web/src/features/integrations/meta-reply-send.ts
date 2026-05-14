import {
  canAutomationSend,
  MetaConnectedCredentialSchema,
  SendMetaReplyRequestSchema,
  SendMetaReplyResponseSchema,
  type ConversationAutomationMode,
  type SendMetaReplyResponse,
} from "@realty-ops/core";
import { decryptCredential } from "../../lib/credentials";
import type { ConnectedMetaCredentialRecord } from "../../lib/supabase/integration-accounts";
import type { LeadEventInsertRow, LeadEventPersistenceRepository } from "../../lib/supabase/lead-events";
import type { ConversationMessageRepository } from "../../lib/supabase/conversation-messages";

export type MetaReplyCredentialRepository = {
  findConnectedCredential(params: {
    workspaceId: string;
    providerAccountId: string;
  }): Promise<ConnectedMetaCredentialRecord | null>;
};

export type MetaReplyClient = {
  sendDirectMessage(params: {
    pageId: string;
    recipientUserId: string;
    accessToken: string;
    reply: string;
  }): Promise<{ providerEventId: string }>;
  replyToComment(params: {
    commentId: string;
    accessToken: string;
    reply: string;
  }): Promise<{ providerEventId: string }>;
};

function buildLeadEventRow(params: {
  request: ReturnType<typeof SendMetaReplyRequestSchema.parse>;
  providerEventId: string;
  occurredAt: string;
}): LeadEventInsertRow {
  return {
    workspace_id: params.request.workspaceId,
    lead_id: params.request.leadId,
    provider: "meta",
    event_type: "reply_sent",
    source_channel: params.request.channel,
    provider_event_id: params.providerEventId,
    provider_account_id: params.request.providerAccountId,
    provider_user_id: params.request.recipientUserId,
    source_post_id: params.request.sourcePostId,
    source_comment_id: params.request.sourceCommentId,
    text: params.request.reply,
    occurred_at: params.occurredAt,
  };
}

export async function sendMetaReply(params: {
  request: unknown;
  credentialSecret: string;
  credentialRepository: MetaReplyCredentialRepository;
  leadEventRepository: Pick<LeadEventPersistenceRepository, "insertLeadEventRows">;
  metaClient: MetaReplyClient;
  automationMode?: ConversationAutomationMode;
  conversationMessageRepository?: ConversationMessageRepository;
  senderType?: "ai" | "operator";
  senderId?: string | null;
  agentTrajectoryId?: string | null;
  agentStepId?: string | null;
  now?: Date;
}): Promise<
  | { status: 200; body: SendMetaReplyResponse }
  | { status: 400 | 404; body: { error: "invalid_request" | "integration_not_found" } }
> {
  const parsed = SendMetaReplyRequestSchema.safeParse(params.request);
  if (!parsed.success) {
    return {
      status: 400,
      body: { error: "invalid_request" },
    };
  }
  const automationMode = params.automationMode ?? parsed.data.automationMode;
  // Operator manual sends bypass the automation gate — that gate is meant for
  // AI auto-execute decisions only. Operator stepping in is the whole point
  // of takeover and must work regardless of automation mode.
  const isOperatorSend = params.senderType === "operator";
  if (!isOperatorSend && !canAutomationSend(automationMode)) {
    return {
      status: 400,
      body: { error: "invalid_request" },
    };
  }

  const credentialRecord = await params.credentialRepository.findConnectedCredential({
    workspaceId: parsed.data.workspaceId,
    providerAccountId: parsed.data.providerAccountId,
  });
  if (credentialRecord === null) {
    return {
      status: 404,
      body: { error: "integration_not_found" },
    };
  }

  const credential = MetaConnectedCredentialSchema.parse(
    decryptCredential<unknown>(credentialRecord.encryptedCredentialRef, params.credentialSecret),
  );

  const providerEvent = parsed.data.channel === "instagram_dm" || parsed.data.channel === "facebook_dm"
    ? await params.metaClient.sendDirectMessage({
        pageId: credential.pageId,
        recipientUserId: parsed.data.recipientUserId ?? "",
        accessToken: credential.pageAccessToken,
        reply: parsed.data.reply,
      })
    : await params.metaClient.replyToComment({
        // Comment-originated sends stay on the original comment thread until a
        // distinct comment-to-DM handoff path exists.
        commentId: parsed.data.sourceCommentId ?? "",
        accessToken: credential.pageAccessToken,
        reply: parsed.data.reply,
      });

  const occurredAt = (params.now ?? new Date()).toISOString();
  await params.leadEventRepository.insertLeadEventRows([
    buildLeadEventRow({
      request: parsed.data,
      providerEventId: providerEvent.providerEventId,
      occurredAt,
    }),
  ]);

  // Mirror the outbound into conversation_messages so realtime watchers see it
  // and the next AI turn loads it as part of the thread history. Without this
  // the conversations page never gets a realtime ping for AI/operator replies.
  if (params.conversationMessageRepository !== undefined && parsed.data.leadId !== null) {
    try {
      await params.conversationMessageRepository.insertMessage({
        lead_id: parsed.data.leadId,
        workspace_id: parsed.data.workspaceId,
        sender_type: params.senderType ?? "ai",
        sender_id: params.senderId ?? null,
        body: parsed.data.reply,
        source_channel: parsed.data.channel,
        provider_message_id: providerEvent.providerEventId,
        status: "sent",
        created_at: occurredAt,
        error_code: null,
        error_message: null,
        agent_trajectory_id: params.agentTrajectoryId ?? null,
        agent_step_id: params.agentStepId ?? null,
      });
    } catch (mirrorError) {
      console.error("[sendMetaReply] failed to mirror to conversation_messages:", mirrorError);
    }
  }

  return {
    status: 200,
    body: SendMetaReplyResponseSchema.parse({
      status: "sent",
      providerEventId: providerEvent.providerEventId,
      occurredAt,
      channel: parsed.data.channel,
    }),
  };
}
