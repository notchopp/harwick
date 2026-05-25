import { NextResponse, type NextRequest } from "next/server";
import { captureCriticalException } from "../../../../lib/observability/sentry";
import { checkRateLimit, rateLimitKeyFromRequest } from "../../../../lib/rate-limit";
import { postRetellWebhook } from "../webhook";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimit({
    key: rateLimitKeyFromRequest({ request, namespace: "retell-webhook" }),
    limit: 60,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { accepted: false, reason: "rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const rawBody = await request.text();
  try {
    const response = await postRetellWebhook({
      rawBody,
      signature: request.headers.get("x-retell-signature"),
    });

    return NextResponse.json(response.body, {
      status: response.status,
    });
  } catch (error) {
    captureCriticalException(error, {
      surface: "retell/webhook",
      extra: { rawBodyLength: rawBody.length },
    });
    throw error;
  }
}
