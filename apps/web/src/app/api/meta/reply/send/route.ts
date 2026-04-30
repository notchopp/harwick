import { NextResponse } from "next/server";
import { createLogger } from "@realty-ops/core";
import { createMetaMessagingClient } from "@realty-ops/integrations";
import { sendMetaReply } from "../../../../../features/integrations/meta-reply-send";
import { checkRateLimit, rateLimitKeyFromRequest } from "../../../../../lib/rate-limit";
import { getServerEnvironment } from "../../../../../lib/server-env";
import { createSupabaseMetaCredentialRepository } from "../../../../../lib/supabase/integration-accounts";
import { createSupabaseLeadEventRepository } from "../../../../../lib/supabase/lead-events";
import { createSupabaseProviderErrorLogger } from "../../../../../lib/supabase/provider-errors";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server-client";

export const runtime = "nodejs";
const logger = createLogger({
  service: "web-meta-reply",
  environment: process.env["APP_ENV"],
});

export async function POST(request: Request) {
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

  try {
    const supabase = createServerSupabaseClient();
    const response = await sendMetaReply({
      request: body,
      credentialSecret: environment.CREDENTIAL_ENCRYPTION_KEY,
      credentialRepository: createSupabaseMetaCredentialRepository(supabase),
      leadEventRepository: createSupabaseLeadEventRepository(supabase),
      metaClient: createMetaMessagingClient(),
    });

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
