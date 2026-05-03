import { NextResponse, type NextRequest } from "next/server";
import { createLogger, SendMetaReplyRequestSchema, type ConversationAutomationMode } from "@realty-ops/core";
import { createMetaMessagingClient } from "@realty-ops/integrations";
import { sendMetaReply } from "../../../../../features/integrations/meta-reply-send";
import { checkRateLimit, rateLimitKeyFromRequest } from "../../../../../lib/rate-limit";
import { getServerEnvironment } from "../../../../../lib/server-env";
import { createSupabaseMetaCredentialRepository } from "../../../../../lib/supabase/integration-accounts";
import { createSupabaseLeadEventRepository } from "../../../../../lib/supabase/lead-events";
import { createSupabaseProviderErrorLogger } from "../../../../../lib/supabase/provider-errors";
import { getAuthSessionSummary } from "../../../../../lib/supabase/auth";
import { createCookieSupabaseServerClient } from "../../../../../lib/supabase/ssr-server";
import { createServerSupabaseClient, createUserSupabaseClient } from "../../../../../lib/supabase/server-client";
import { authorizeWorkspaceRequest, readBearerToken } from "../../../../../lib/api/workspace-auth";
import { createSupabaseAuditLogRepository } from "../../../../../lib/supabase/audit-logs";
import type { ConversationAutomationStateRow } from "../../../../../lib/supabase/database.types";

export const runtime = "nodejs";
const logger = createLogger({
  service: "web-meta-reply",
  environment: process.env["APP_ENV"],
});

async function findServerAutomationMode(params: {
  supabase: ReturnType<typeof createServerSupabaseClient>;
  request: ReturnType<typeof SendMetaReplyRequestSchema.parse>;
}): Promise<ConversationAutomationMode> {
  let query = params.supabase
    .from("conversation_automation_states")
    .select("*")
    .eq("workspace_id", params.request.workspaceId);

  if (params.request.leadId !== null) {
    query = query.eq("lead_id", params.request.leadId);
  } else {
    query = query
      .is("lead_id", null)
      .eq("provider_account_id", params.request.providerAccountId)
      .eq("channel", params.request.channel);

    query = params.request.recipientUserId === null
      ? query.is("recipient_user_id", null)
      : query.eq("recipient_user_id", params.request.recipientUserId);
  }

  const { data, error } = await query.maybeSingle<ConversationAutomationStateRow>();
  if (error !== null) {
    throw error;
  }

  return (data?.automation_mode as ConversationAutomationMode) ?? "ai_on";
}

async function resolveAuditActorUserId(request: NextRequest): Promise<string | null> {
  const accessToken = readBearerToken(request);
  if (accessToken !== null) {
    const session = await getAuthSessionSummary({
      supabase: createUserSupabaseClient(accessToken),
      accessToken,
    });
    return session?.user.id ?? null;
  }

  const cookieSupabase = await createCookieSupabaseServerClient();
  const { data: userData, error: userError } = await cookieSupabase.auth.getUser();
  if (userError !== null || userData.user === null) {
    return null;
  }

  return userData.user.id;
}

export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimit({
    key: rateLimitKeyFromRequest({ request, namespace: "meta-reply-send" }),
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

  const environment = getServerEnvironment();
  if (environment.CREDENTIAL_ENCRYPTION_KEY === undefined) {
    return NextResponse.json({ error: "missing_credential_encryption_key" }, { status: 500 });
  }

  const parsed = SendMetaReplyRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({ request, workspaceId: parsed.data.workspaceId });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const supabase = createServerSupabaseClient();
    const automationMode = await findServerAutomationMode({
      supabase,
      request: parsed.data,
    });
    const response = await sendMetaReply({
      request: parsed.data,
      credentialSecret: environment.CREDENTIAL_ENCRYPTION_KEY,
      credentialRepository: createSupabaseMetaCredentialRepository(supabase),
      leadEventRepository: createSupabaseLeadEventRepository(supabase),
      metaClient: createMetaMessagingClient(),
      automationMode,
    });

    if (response.status === 200) {
      const auditRepository = createSupabaseAuditLogRepository(supabase);
      const actorUserId = await resolveAuditActorUserId(request);
      try {
        await auditRepository.insertAuditLog({
          workspaceId: parsed.data.workspaceId,
          userId: actorUserId,
          actorType: "user",
          action: "reply.sent",
          resourceType: "reply",
          resourceId: parsed.data.leadId,
          metadata: {
            channel: parsed.data.channel,
            providerAccountId: parsed.data.providerAccountId,
            automationMode,
          },
        });
      } catch (auditError) {
        logger.error("audit log failed for reply.sent", { error: auditError });
      }
    }

    return NextResponse.json(response.body, { status: response.status });
  } catch (error) {
    const record = body !== null && typeof body === "object" && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};

    logger.error("meta reply send failed", {
      workspaceId: typeof record["workspaceId"] === "string" ? record["workspaceId"] : null,
      leadId: typeof record["leadId"] === "string" ? record["leadId"] : null,
      providerAccountId: typeof record["providerAccountId"] === "string" ? record["providerAccountId"] : null,
      channel: typeof record["channel"] === "string" ? record["channel"] : null,
      error,
    });
    try {
      await createSupabaseProviderErrorLogger(createServerSupabaseClient()).recordProviderError({
        workspaceId: typeof record["workspaceId"] === "string" ? record["workspaceId"] : null,
        provider: "meta",
        operation: "reply_send",
        errorCode: "internal_error",
        errorMessage: error instanceof Error ? error.message : "Meta reply send failed.",
        retryable: true,
        metadata: {
          leadId: typeof record["leadId"] === "string" ? record["leadId"] : null,
          providerAccountId: typeof record["providerAccountId"] === "string" ? record["providerAccountId"] : null,
          channel: typeof record["channel"] === "string" ? record["channel"] : null,
        },
      });
    } catch (logError) {
      logger.error("provider error log failed", { error: logError });
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
