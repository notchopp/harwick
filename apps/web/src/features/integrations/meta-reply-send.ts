import {
  MetaConnectedCredentialSchema,
  SendMetaReplyRequestSchema,
  SendMetaReplyResponseSchema,
  type SendMetaReplyResponse,
} from "@realty-ops/core";
import { decryptCredential } from "../../lib/credentials";
import type { ConnectedMetaCredentialRecord } from "../../lib/supabase/integration-accounts";
import type { LeadEventInsertRow, LeadEventPersistenceRepository } from "../../lib/supabase/lead-events";

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
