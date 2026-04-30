import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit, rateLimitKeyFromRequest } from "../../../../lib/rate-limit";
import { postRetellWebhook } from "../webhook";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimit({
    key: rateLimitKeyFromRequest({ request, namespace: "retell-webhook" }),
    limit: 300,
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
  const response = await postRetellWebhook({
    rawBody,
    signature: request.headers.get("x-retell-signature"),
  });

  return NextResponse.json(response.body, {
    status: response.status,
  });
}
