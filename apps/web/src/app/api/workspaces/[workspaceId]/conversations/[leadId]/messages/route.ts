import {
  ConversationMessageSendRequestSchema,
  UuidSchema,
  createLogger,
  type SendMetaReplyRequest,
} from "@realty-ops/core";
import { createMetaMessagingClient } from "@realty-ops/integrations";
import { NextResponse, type NextRequest } from "next/server";
import { sendConversationMessage } from "../../../../../../../features/conversations/conversation-message-send";
import { sendMetaReply } from "../../../../../../../features/integrations/meta-reply-send";
import { authorizeWorkspaceRequest } from "../../../../../../../lib/api/workspace-auth";
import { checkRateLimit, rateLimitKeyFromRequest } from "../../../../../../../lib/rate-limit";
import { getServerEnvironment } from "../../../../../../../lib/server-env";
import { createSupabaseConversationMessageRepository } from "../../../../../../../lib/supabase/conversation-message";
import { createSupabaseConversationMessageRepository as createConversationMessagesRepo } from "../../../../../../../lib/supabase/conversation-messages";
import { createSupabaseMetaCredentialRepository } from "../../../../../../../lib/supabase/integration-accounts";
import { createSupabaseLeadEventRepository } from "../../../../../../../lib/supabase/lead-events";
import { createServerSupabaseClient } from "../../../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

const logger = createLogger({
  service: "web-workspace-conversation-message-send",
  environment: process.env["APP_ENV"],
});

type RouteContext = {
  params: Promise<{
    workspaceId: string;
    leadId: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { workspaceId, leadId } = await context.params;
  if (!UuidSchema.safeParse(workspaceId).success || !UuidSchema.safeParse(leadId).success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const rateLimit = checkRateLimit({
    key: rateLimitKeyFromRequest({ request, namespace: "workspace-conversation-message-send" }),
    limit: 120,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const membership = await authorizeWorkspaceRequest({ request, workspaceId });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // Allow callers to omit conversationId/workspaceId in the body since the
  // route already proves them — synthesize a request shape the schema accepts.
  const synthRequest = body !== null && typeof body === "object" && !Array.isArray(body)
    ? { workspaceId, conversationId: leadId, ...(body as Record<string, unknown>) }
    : { workspaceId, conversationId: leadId };

  const parsed = ConversationMessageSendRequestSchema.safeParse(synthRequest);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (parsed.data.workspaceId !== workspaceId || parsed.data.conversationId !== leadId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const environment = getServerEnvironment();
  if (environment.CREDENTIAL_ENCRYPTION_KEY === undefined) {
    return NextResponse.json({ error: "missing_credential_encryption_key" }, { status: 500 });
  }

  try {
    const supabase = createServerSupabaseClient();
    const conversationMessageMirror = createConversationMessagesRepo(supabase);
    const result = await sendConversationMessage({
      request: parsed.data,
      repository: createSupabaseConversationMessageRepository(supabase),
      senderId: membership.memberId,
      sendMetaReply: (metaReplyRequest: SendMetaReplyRequest) =>
        sendMetaReply({
          request: metaReplyRequest,
          credentialSecret: environment.CREDENTIAL_ENCRYPTION_KEY!,
          credentialRepository: createSupabaseMetaCredentialRepository(supabase),
          leadEventRepository: createSupabaseLeadEventRepository(supabase),
          metaClient: createMetaMessagingClient(),
          conversationMessageRepository: conversationMessageMirror,
          senderType: "operator",
          senderId: membership.memberId,
        }),
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    logger.error("workspace conversation message send failed", { workspaceId, leadId, error });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
