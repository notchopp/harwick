import { z } from "zod";

const GRAPH_API_BASE_URL = "https://graph.facebook.com/v20.0";

const MetaSendMessageResponseSchema = z.object({
  message_id: z.string().trim().min(1),
}).passthrough();

const MetaCommentReplyResponseSchema = z.object({
  id: z.string().trim().min(1),
}).passthrough();

export type MetaMessagingClientOptions = {
  fetchImpl?: typeof fetch;
};

export function createMetaMessagingClient(options: MetaMessagingClientOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;

  async function request(url: URL, body: Record<string, unknown>): Promise<unknown> {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Meta messaging request failed (${response.status}): ${text}`);
    }

    return response.json();
  }

  return {
    async sendDirectMessage(params: {
      pageId: string;
      recipientUserId: string;
      accessToken: string;
      reply: string;
    }): Promise<{ providerEventId: string }> {
      const url = new URL(`${GRAPH_API_BASE_URL}/${params.pageId}/messages`);
      url.searchParams.set("access_token", params.accessToken);

      const response = MetaSendMessageResponseSchema.parse(await request(url, {
        messaging_type: "RESPONSE",
        recipient: {
          id: params.recipientUserId,
        },
        message: {
          text: params.reply,
        },
      }));

      return {
        providerEventId: response.message_id,
      };
    },

    async replyToComment(params: {
      commentId: string;
      accessToken: string;
      reply: string;
    }): Promise<{ providerEventId: string }> {
      const url = new URL(`${GRAPH_API_BASE_URL}/${params.commentId}/replies`);
      url.searchParams.set("access_token", params.accessToken);

      const response = MetaCommentReplyResponseSchema.parse(await request(url, {
        message: params.reply,
      }));

      return {
        providerEventId: response.id,
      };
    },

    // Reply to an Instagram comment. Endpoint shape mirrors the Facebook
    // version (POST /{comment-id}/replies) but the access token must be the
    // one tied to the Instagram Business Account (either the Page access
    // token under the legacy Facebook-Login path, or the IG user access
    // token under the new Instagram Login path).
    async replyToInstagramComment(params: {
      instagramCommentId: string;
      accessToken: string;
      reply: string;
    }): Promise<{ providerEventId: string }> {
      const url = new URL(`${GRAPH_API_BASE_URL}/${params.instagramCommentId}/replies`);
      url.searchParams.set("access_token", params.accessToken);

      const response = MetaCommentReplyResponseSchema.parse(await request(url, {
        message: params.reply,
      }));

      return {
        providerEventId: response.id,
      };
    },
  };
}
