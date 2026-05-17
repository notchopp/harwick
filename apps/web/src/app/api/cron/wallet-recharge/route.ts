import { createStripeBillingClient } from "@realty-ops/integrations";
import { NextResponse, type NextRequest } from "next/server";

import { createWorkspaceWalletAutoRechargePaymentIntent } from "../../../../features/billing/wallet-top-up";
import { getServerEnvironment } from "../../../../lib/server-env";
import {
  clearWalletAutoRechargePending,
  getWorkspaceSubscription,
  listWalletsPendingAutoRecharge,
} from "../../../../lib/supabase/billing";
import { createServerSupabaseClient } from "../../../../lib/supabase/server-client";

export const runtime = "nodejs";

/**
 * Auto-recharge cron. Finds wallets whose debit RPC armed
 * `auto_recharge_pending_at`, fires the Stripe PaymentIntent, then clears the
 * flag. Webhook credit lands asynchronously and bumps the balance back above
 * the threshold so the next debit won't re-arm.
 *
 * Cadence: every 1 min (vercel.json). Idempotency is windowed inside
 * createWorkspaceWalletAutoRechargePaymentIntent (10-minute bucket) so
 * overlapping cron runs cannot double-charge.
 */

function authorizeWalletRechargeCron(request: NextRequest): boolean | "disabled" {
  const explicitSecret = process.env["AGENT_RECONCILE_CRON_SECRET"];
  const vercelCronSecret = process.env["CRON_SECRET"];
  const acceptedSecrets = [explicitSecret, vercelCronSecret].filter(
    (secret): secret is string => secret !== undefined && secret.length > 0,
  );
  if (acceptedSecrets.length === 0) {
    return "disabled";
  }
  const headerSecret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const querySecret = request.nextUrl.searchParams.get("secret") ?? "";
  return acceptedSecrets.includes(headerSecret) || acceptedSecrets.includes(querySecret);
}

type WalletRechargeReport = {
  scanned: number;
  fired: number;
  skippedMissingCustomer: number;
  skippedMissingPaymentMethod: number;
  failed: number;
};

export async function POST(request: NextRequest) {
  const authorized = authorizeWalletRechargeCron(request);
  if (authorized === "disabled") {
    return NextResponse.json({ error: "wallet_recharge_disabled" }, { status: 503 });
  }
  if (!authorized) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const environment = getServerEnvironment();
  if (environment.STRIPE_SECRET_KEY === undefined) {
    return NextResponse.json({ error: "stripe_not_configured" }, { status: 503 });
  }
  const stripeClient = createStripeBillingClient({ secretKey: environment.STRIPE_SECRET_KEY });
  const supabase = createServerSupabaseClient();

  const pending = await listWalletsPendingAutoRecharge(supabase, { limit: 50 });
  const report: WalletRechargeReport = {
    scanned: pending.length,
    fired: 0,
    skippedMissingCustomer: 0,
    skippedMissingPaymentMethod: 0,
    failed: 0,
  };

  for (const wallet of pending) {
    try {
      if (wallet.stripePaymentMethodId === null) {
        report.skippedMissingPaymentMethod += 1;
        continue;
      }

      const subscription = await getWorkspaceSubscription(supabase, wallet.workspaceId);
      if (subscription === null || subscription.providerCustomerId === null) {
        report.skippedMissingCustomer += 1;
        continue;
      }

      await createWorkspaceWalletAutoRechargePaymentIntent({
        stripeClient,
        workspaceId: wallet.workspaceId,
        subscription,
        wallet,
      });

      // Clear the pending flag once the PaymentIntent is created; the
      // webhook credit handler will bump last_recharge_at and balance
      // asynchronously. If the next debit re-arms before credit lands the
      // 10-minute idempotency window prevents a second Stripe charge.
      await clearWalletAutoRechargePending(supabase, wallet.workspaceId);
      report.fired += 1;
    } catch (error) {
      report.failed += 1;
      console.error(
        "[cron/wallet-recharge] auto-recharge failed for workspace",
        wallet.workspaceId,
        error,
      );
    }
  }

  return NextResponse.json({ status: "ok", report }, { status: 200 });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
