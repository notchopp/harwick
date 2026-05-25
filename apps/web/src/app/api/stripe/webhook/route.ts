import {
  createStripeBillingClient,
  parseStripeBillingWebhookEvent,
  verifyStripeWebhookSignature,
} from "@realty-ops/integrations";
import { NextResponse, type NextRequest } from "next/server";
import { handleStripeBillingWebhookEvent } from "../../../../features/billing/stripe-webhook";
import {
  claimBillingWebhookEvent,
  completeBillingWebhookEvent,
  creditWorkspaceUsageWallet,
  upsertWorkspaceSubscriptionFromProvider,
} from "../../../../lib/supabase/billing";
import { captureCriticalException } from "../../../../lib/observability/sentry";
import { checkRateLimit, rateLimitKeyFromRequest } from "../../../../lib/rate-limit";
import { getServerEnvironment } from "../../../../lib/server-env";
import { createServerSupabaseClient } from "../../../../lib/supabase/server-client";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimit({
    key: rateLimitKeyFromRequest({ request, namespace: "stripe-webhook" }),
    limit: 200,
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

  const environment = getServerEnvironment();
  if (environment.STRIPE_SECRET_KEY === undefined || environment.STRIPE_WEBHOOK_SECRET === undefined) {
    return NextResponse.json({ accepted: false, reason: "stripe_not_configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const signatureHeader = request.headers.get("stripe-signature");
  const signatureValid = verifyStripeWebhookSignature({
    rawBody,
    signatureHeader,
    webhookSecret: environment.STRIPE_WEBHOOK_SECRET,
  });

  if (!signatureValid) {
    return NextResponse.json({ accepted: false, reason: "invalid_signature" }, { status: 401 });
  }

  let event;
  try {
    event = parseStripeBillingWebhookEvent(rawBody);
  } catch {
    return NextResponse.json({ accepted: false, reason: "malformed_payload" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  try {
    const result = await handleStripeBillingWebhookEvent({
      event,
      stripeClient: createStripeBillingClient({ secretKey: environment.STRIPE_SECRET_KEY }),
      store: {
        async claimEvent(params) {
          const claim = await claimBillingWebhookEvent(supabase, params);
          if (!claim.claimed) {
            return claim;
          }

          return { claimed: true, eventId: claim.event.id };
        },
        async completeEvent(params) {
          await completeBillingWebhookEvent(supabase, params);
        },
        async upsertSubscription(update) {
          await upsertWorkspaceSubscriptionFromProvider(supabase, update);
        },
        async creditWallet(params) {
          await creditWorkspaceUsageWallet(supabase, {
            workspaceId: params.workspaceId,
            amountCents: params.amountCents,
            stripePaymentMethodId: params.stripePaymentMethodId,
          });
        },
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    captureCriticalException(error, {
      surface: "stripe/webhook",
      extra: { eventId: event.id, eventType: event.type },
    });
    return NextResponse.json({ accepted: false, reason: "reconciliation_failed" }, { status: 500 });
  }
}
