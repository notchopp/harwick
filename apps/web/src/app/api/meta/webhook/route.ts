import { NextResponse, type NextRequest } from "next/server";
import { verifyMetaWebhookSignature } from "@realty-ops/integrations";
import { checkRateLimit, rateLimitKeyFromRequest } from "../../../../lib/rate-limit";
import { getServerEnvironment } from "../../../../lib/server-env";
import { getMetaWebhook, postMetaWebhook } from "../webhook";

/**
 * Meta webhook entry point. Two layers of safety:
 *
 *   1. Signature: every POST verifies the X-Hub-Signature-256 HMAC against the
 *      app secret. Mismatched payloads return 403 before any side effect.
 *   2. Idempotency: lead_events has a UNIQUE INDEX on
 *      (workspace_id, provider, provider_event_id). The provider_event_id maps
 *      to the Meta message `mid` (DMs) or comment `id` (comment events) — the
 *      same natural key Meta uses to identify a delivery. Replays — whether
 *      from Meta's retry policy (up to 36h) or a reviewer probe — are absorbed
 *      both at the application layer (pre-check) and the DB layer (constraint).
 *      See `insertLeadEventRows` in lib/supabase/lead-events.ts.
 */
export const runtime = "nodejs";

function getQueryRecord(request: NextRequest): Record<string, string | undefined> {
  return {
    "hub.mode": request.nextUrl.searchParams.get("hub.mode") ?? undefined,
    "hub.verify_token": request.nextUrl.searchParams.get("hub.verify_token") ?? undefined,
    "hub.challenge": request.nextUrl.searchParams.get("hub.challenge") ?? undefined,
  };
}

export function GET(request: NextRequest) {
  const response = getMetaWebhook({
    query: getQueryRecord(request),
  });

  return new NextResponse(response.body, {
    status: response.status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
    },
  });
}

export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimit({
    key: rateLimitKeyFromRequest({ request, namespace: "meta-webhook" }),
    limit: 300,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        accepted: false,
        normalizedEventCount: 0,
        persistedEventCount: 0,
        duplicateEventCount: 0,
        leadUpsertCount: 0,
        unmatchedProviderAccountIds: [],
        reason: "rate_limited",
      },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const environment = getServerEnvironment();
  let rawBody: string;

  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json(
      {
        accepted: false,
        normalizedEventCount: 0,
        persistedEventCount: 0,
        duplicateEventCount: 0,
        leadUpsertCount: 0,
        unmatchedProviderAccountIds: [],
        reason: "malformed_payload",
      },
      { status: 400 },
    );
  }

  const signatureHeader = request.headers.get("x-hub-signature-256");

  try {
    if (!verifyMetaWebhookSignature({
      rawBody,
      appSecret: environment.META_APP_SECRET,
      signatureHeader,
    })) {
      return NextResponse.json(
        {
          accepted: false,
          normalizedEventCount: 0,
          persistedEventCount: 0,
          duplicateEventCount: 0,
          leadUpsertCount: 0,
          unmatchedProviderAccountIds: [],
          reason: "invalid_signature",
        },
        { status: 403 },
      );
    }
  } catch {
    return NextResponse.json(
      {
        accepted: false,
        normalizedEventCount: 0,
        persistedEventCount: 0,
        duplicateEventCount: 0,
        leadUpsertCount: 0,
        unmatchedProviderAccountIds: [],
        reason: "signature_check_failed",
      },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json(
      {
        accepted: false,
        normalizedEventCount: 0,
        persistedEventCount: 0,
        duplicateEventCount: 0,
        leadUpsertCount: 0,
        unmatchedProviderAccountIds: [],
        reason: "malformed_payload",
      },
      { status: 400 },
    );
  }

  const response = await postMetaWebhook({ body });

  return NextResponse.json(response.body, {
    status: response.status,
  });
}
