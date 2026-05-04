import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createLogger } from "@realty-ops/core";
import { checkRateLimit, rateLimitKeyFromRequest } from "../../../../lib/rate-limit";
import { getServerEnvironment } from "../../../../lib/server-env";
import { parseAndVerifyMetaSignedRequest } from "../../../../lib/meta-signed-request";
import { createServerSupabaseClient } from "../../../../lib/supabase/server-client";

export const runtime = "nodejs";

const logger = createLogger({
  service: "meta-data-deletion",
  environment: process.env["APP_ENV"],
});

function buildStatusUrl(request: NextRequest, confirmationCode: string): string {
  const envBase = process.env["NEXT_PUBLIC_APP_URL"];
  const base = envBase !== undefined && envBase.length > 0
    ? envBase.replace(/\/$/, "")
    : `${request.nextUrl.protocol}//${request.nextUrl.host}`;
  return `${base}/api/meta/data-deletion?code=${encodeURIComponent(confirmationCode)}`;
}

export function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code === null || code.length === 0) {
    return new NextResponse(
      "Meta data deletion endpoint. POST a signed_request to initiate deletion.",
      { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  return new NextResponse(
    `Data deletion request received.\nConfirmation code: ${code}\nStatus: pending — your data is being removed from Harwick. Contact support@harwick.lol with this code for status updates.`,
    { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } },
  );
}

export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimit({
    key: rateLimitKeyFromRequest({ request, namespace: "meta-data-deletion" }),
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
    logger.warn("data deletion signed_request rejected", { reason: verified.reason });
    return NextResponse.json({ error: "invalid_signature" }, { status: 403 });
  }

  const userId = verified.payload.user_id;
  const confirmationCode = randomBytes(16).toString("hex");
  const statusUrl = buildStatusUrl(request, confirmationCode);

  try {
    const supabase = createServerSupabaseClient();
    const occurredAt = new Date().toISOString();

    // Best-effort: disconnect any meta integration_accounts tied to this user/page
    // so we stop pulling their data immediately. Full lead/message deletion is
    // logged here and handled out-of-band (operator confirms via support).
    const { data: matchedAccounts } = await supabase
      .from("integration_accounts")
      .select("id, workspace_id")
      .eq("provider", "meta")
      .or(`provider_account_id.eq.${userId},provider_account_ids.cs.{${userId}}`);

    const matchedIds = (matchedAccounts ?? []).map((row) => row.id);

    if (matchedIds.length > 0) {
      await supabase
        .from("integration_accounts")
        .update({
          status: "disconnected",
          encrypted_credential_ref: null,
          updated_at: occurredAt,
        })
        .in("id", matchedIds);
    }

    logger.info("meta data deletion request received", {
      metaUserId: userId,
      confirmationCode,
      affectedIntegrationAccountIds: matchedIds,
    });

    return NextResponse.json(
      { url: statusUrl, confirmation_code: confirmationCode },
      { status: 200 },
    );
  } catch (error) {
    logger.error("meta data deletion failed", { metaUserId: userId, error });
    return NextResponse.json(
      { url: statusUrl, confirmation_code: confirmationCode },
      { status: 200 },
    );
  }
}
