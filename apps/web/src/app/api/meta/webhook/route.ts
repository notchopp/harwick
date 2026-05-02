import { NextResponse, type NextRequest } from "next/server";
import { verifyMetaWebhookSignature } from "@realty-ops/integrations";
import { checkRateLimit, rateLimitKeyFromRequest } from "../../../../lib/rate-limit";
import { getServerEnvironment } from "../../../../lib/server-env";
import { getMetaWebhook, postMetaWebhook } from "../webhook";

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

  if (!verifyMetaWebhookSignature({
    rawBody,
    appSecret: environment.META_APP_SECRET,
    signatureHeader: request.headers.get("x-hub-signature-256"),
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
