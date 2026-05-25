import { createLogger } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit, rateLimitKeyFromRequest } from "../../../../lib/rate-limit";
import { postRetellContext } from "../context-handler";

export const runtime = "nodejs";
const logger = createLogger({
  service: "web-retell-context",
  environment: process.env["APP_ENV"],
});

export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimit({
    key: rateLimitKeyFromRequest({ request, namespace: "retell-context" }),
    limit: 60,
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

  try {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "malformed_payload" }, { status: 400 });
    }

    const response = await postRetellContext({ body });

    return NextResponse.json(response.body, {
      status: response.status,
    });
  } catch (error) {
    logger.error("retell context request failed", {
      route: "/api/retell/context",
      method: request.method,
      error,
    });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
