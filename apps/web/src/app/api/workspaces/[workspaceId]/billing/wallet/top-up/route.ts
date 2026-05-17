import {
  BillingWalletTopUpRequestSchema,
  BillingWalletTopUpResponseSchema,
  UuidSchema,
} from "@realty-ops/core";
import { createStripeBillingClient } from "@realty-ops/integrations";
import { NextResponse, type NextRequest } from "next/server";
import { createWorkspaceWalletTopUpPaymentIntent } from "../../../../../../../features/billing/wallet-top-up";
import { authorizeWorkspaceRequest } from "../../../../../../../lib/api/workspace-auth";
import { getServerEnvironment } from "../../../../../../../lib/server-env";
import {
  getWorkspaceSubscription,
  getWorkspaceUsageWallet,
} from "../../../../../../../lib/supabase/billing";
import { createServerSupabaseClient } from "../../../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

const billingRoles = new Set(["owner", "admin"] as const);

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const params = await context.params;
  const workspaceId = UuidSchema.safeParse(params.workspaceId);
  if (!workspaceId.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({
    request,
    workspaceId: workspaceId.data,
    allowedRoles: billingRoles,
  });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsedBody = BillingWalletTopUpRequestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsedBody.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const environment = getServerEnvironment();
  if (environment.STRIPE_SECRET_KEY === undefined) {
    return NextResponse.json({ error: "stripe_not_configured" }, { status: 503 });
  }

  try {
    const supabase = createServerSupabaseClient();
    const [subscription, wallet] = await Promise.all([
      getWorkspaceSubscription(supabase, workspaceId.data),
      getWorkspaceUsageWallet(supabase, workspaceId.data),
    ]);
    const topUp = await createWorkspaceWalletTopUpPaymentIntent({
      stripeClient: createStripeBillingClient({ secretKey: environment.STRIPE_SECRET_KEY }),
      workspaceId: workspaceId.data,
      subscription,
      wallet,
      request: parsedBody.data,
    });

    return NextResponse.json(BillingWalletTopUpResponseSchema.parse(topUp), { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("required before wallet top-up") ? 409 : 500;
    return NextResponse.json(
      {
        error: status === 409 ? "wallet_payment_method_missing" : "wallet_top_up_failed",
        message,
      },
      { status },
    );
  }
}
