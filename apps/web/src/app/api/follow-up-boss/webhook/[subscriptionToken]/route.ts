import { NextResponse, type NextRequest } from "next/server";
import { captureCriticalException, hashIdentifier } from "../../../../../lib/observability/sentry";
import { checkRateLimit } from "../../../../../lib/rate-limit";
import { postFollowUpBossWebhook } from "../../webhook";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{
      subscriptionToken: string;
    }>;
  },
) {
  const { subscriptionToken } = await context.params;
  const rateLimit = checkRateLimit({
    key: `fub-webhook:${subscriptionToken}`,
    limit: 120,
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

  try {
    const response = await postFollowUpBossWebhook({
      subscriptionToken,
      rawBody: await request.text(),
      signature: request.headers.get("fub-signature"),
    });

    return NextResponse.json(response.body, {
      status: response.status,
    });
  } catch (error) {
    captureCriticalException(error, {
      surface: "follow-up-boss/webhook",
      // Hash subscription token — it's a secret-ish identifier we don't want
      // landing in Sentry plaintext but we still need cardinality for grouping.
      extra: { subscriptionTokenHash: hashIdentifier(subscriptionToken) },
    });
    throw error;
  }
}
