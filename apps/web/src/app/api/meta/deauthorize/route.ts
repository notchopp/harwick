import { NextResponse, type NextRequest } from "next/server";
import { createLogger } from "@realty-ops/core";
import { checkRateLimit, rateLimitKeyFromRequest } from "../../../../lib/rate-limit";
import { getServerEnvironment } from "../../../../lib/server-env";
import { parseAndVerifyMetaSignedRequest } from "../../../../lib/meta-signed-request";
import { createServerSupabaseClient } from "../../../../lib/supabase/server-client";

export const runtime = "nodejs";

const logger = createLogger({
  service: "meta-deauthorize",
  environment: process.env["APP_ENV"],
});

export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimit({
    key: rateLimitKeyFromRequest({ request, namespace: "meta-deauthorize" }),
    limit: 60,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const environment = getServerEnvironment();

  let signedRequest: string | null = null;
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const value = form.get("signed_request");
      signedRequest = typeof value === "string" ? value : null;
    } else {
      const raw = await request.text();
      const params = new URLSearchParams(raw);
      signedRequest = params.get("signed_request");
    }
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const verified = parseAndVerifyMetaSignedRequest({
    signedRequest,
    appSecret: environment.META_APP_SECRET,
  });

  if (!verified.ok) {
    logger.warn("deauthorize signed_request rejected", { reason: verified.reason });
    return NextResponse.json({ error: "invalid_signature" }, { status: 403 });
  }

  const userId = verified.payload.user_id;

  try {
    const supabase = createServerSupabaseClient();
    const occurredAt = new Date().toISOString();

    const { data: matchedAccounts, error: selectError } = await supabase
      .from("integration_accounts")
      .select("id, workspace_id, provider_account_id")
      .eq("provider", "meta")
      .or(`provider_account_id.eq.${userId},provider_account_ids.cs.{${userId}}`);

    if (selectError !== null) {
      throw selectError;
    }

    const matchedIds = (matchedAccounts ?? []).map((row) => row.id);

    if (matchedIds.length > 0) {
      const { error: updateError } = await supabase
        .from("integration_accounts")
        .update({
          status: "disconnected",
          encrypted_credential_ref: null,
          updated_at: occurredAt,
        })
        .in("id", matchedIds);

      if (updateError !== null) {
        throw updateError;
      }
    }

    logger.info("meta deauthorize processed", {
      metaUserId: userId,
      disconnectedAccountIds: matchedIds,
    });

    return NextResponse.json(
      { status: "ok", disconnectedAccounts: matchedIds.length },
      { status: 200 },
    );
  } catch (error) {
    logger.error("meta deauthorize failed", { metaUserId: userId, error });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
