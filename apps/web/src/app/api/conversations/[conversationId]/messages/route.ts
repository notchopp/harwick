import { ConversationMessageSendRequestSchema, createLogger } from "@realty-ops/core";
import { createMetaMessagingClient } from "@realty-ops/integrations";
import { NextResponse, type NextRequest } from "next/server";
import { sendConversationMessage } from "../../../../../features/conversations/conversation-message-send";
import { sendMetaReply } from "../../../../../features/integrations/meta-reply-send";
import { authorizeWorkspaceRequest } from "../../../../../lib/api/workspace-auth";
import { checkRateLimit, rateLimitKeyFromRequest } from "../../../../../lib/rate-limit";
import { getServerEnvironment } from "../../../../../lib/server-env";
import { createSupabaseConversationMessageRepository } from "../../../../../lib/supabase/conversation-message";
import { createSupabaseMetaCredentialRepository } from "../../../../../lib/supabase/integration-accounts";
import { createSupabaseLeadEventRepository } from "../../../../../lib/supabase/lead-events";
import { createSupabaseProviderErrorLogger } from "../../../../../lib/supabase/provider-errors";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

const logger = createLogger({
  service: "web-conversation-message-send",
  environment: process.env["APP_ENV"],
});

type RouteContext = {
  params: Promise<{
    conversationId: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const rateLimit = checkRateLimit({
    key: rateLimitKeyFromRequest({ request, namespace: "conversation-message-send" }),
    limit: 120,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = ConversationMessageSendRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { conversationId } = await context.params;
  if (conversationId !== parsed.data.conversationId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({
    request,
    workspaceId: parsed.data.workspaceId,
  });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const environment = getServerEnvironment();
  if (environment.CREDENTIAL_ENCRYPTION_KEY === undefined) {
    return NextResponse.json({ error: "missing_credential_encryption_key" }, { status: 500 });
  }

  try {
    const supabase = createServerSupabaseClient();
    const result = await sendConversationMessage({
      request: parsed.data,
      repository: createSupabaseConversationMessageRepository(supabase),
      sendMetaReply: (metaReplyRequest) =>
        sendMetaReply({
          request: metaReplyRequest,
          credentialSecret: environment.CREDENTIAL_ENCRYPTION_KEY!,
          credentialRepository: createSupabaseMetaCredentialRepository(supabase),
          leadEventRepository: createSupabaseLeadEventRepository(supabase),
          metaClient: createMetaMessagingClient(),
        }),
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    const record = body !== null && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};

    logger.error("conversation message send failed", {
      workspaceId: typeof record["workspaceId"] === "string" ? record["workspaceId"] : null,
      conversationId: typeof record["conversationId"] === "string" ? record["conversationId"] : null,
      error,
    });

    try {
      await createSupabaseProviderErrorLogger(createServerSupabaseClient()).recordProviderError({
        workspaceId: typeof record["workspaceId"] === "string" ? record["workspaceId"] : null,
        provider: "meta",
        operation: "conversation_message_send",
        errorCode: "internal_error",
        errorMessage: error instanceof Error ? error.message : "Conversation message send failed.",
        retryable: true,
        metadata: {
          conversationId: typeof record["conversationId"] === "string" ? record["conversationId"] : null,
        },
      });
    } catch (logError) {
      logger.error("provider error log failed", { error: logError });
    }

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
