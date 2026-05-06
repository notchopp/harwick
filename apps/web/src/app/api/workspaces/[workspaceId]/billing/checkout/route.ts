import {
  BillingCheckoutRequestSchema,
  BillingCheckoutResponseSchema,
  UuidSchema,
} from "@realty-ops/core";
import { createStripeBillingClient } from "@realty-ops/integrations";
import { NextResponse, type NextRequest } from "next/server";
import { createWorkspaceBillingCheckoutSession } from "../../../../../../features/billing/stripe-checkout";
import { authorizeWorkspaceRequest } from "../../../../../../lib/api/workspace-auth";
import { getServerEnvironment } from "../../../../../../lib/server-env";
import { getWorkspaceSubscription } from "../../../../../../lib/supabase/billing";
import { createServerSupabaseClient } from "../../../../../../lib/supabase/server-client";

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

  const parsedBody = BillingCheckoutRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const environment = getServerEnvironment();
  if (environment.STRIPE_SECRET_KEY === undefined) {
    return NextResponse.json({ error: "stripe_not_configured" }, { status: 503 });
  }

  try {
    const supabase = createServerSupabaseClient();
    const subscription = await getWorkspaceSubscription(supabase, workspaceId.data);
    const checkout = await createWorkspaceBillingCheckoutSession({
      environment,
      stripeClient: createStripeBillingClient({ secretKey: environment.STRIPE_SECRET_KEY }),
      workspaceId: workspaceId.data,
      request: parsedBody.data,
      providerCustomerId: subscription?.providerCustomerId ?? null,
    });

    return NextResponse.json(BillingCheckoutResponseSchema.parse(checkout), { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.startsWith("Stripe price is not configured") ? 503 : 500;
    return NextResponse.json(
      {
        error: status === 503 ? "stripe_price_not_configured" : "checkout_failed",
        message,
      },
      { status },
    );
  }
}
