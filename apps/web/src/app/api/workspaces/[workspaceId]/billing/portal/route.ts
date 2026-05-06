import { BillingPortalResponseSchema, UuidSchema } from "@realty-ops/core";
import { createStripeBillingClient } from "@realty-ops/integrations";
import { NextResponse, type NextRequest } from "next/server";
import { createWorkspaceBillingPortalSession } from "../../../../../../features/billing/stripe-checkout";
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

  const environment = getServerEnvironment();
  if (environment.STRIPE_SECRET_KEY === undefined) {
    return NextResponse.json({ error: "stripe_not_configured" }, { status: 503 });
  }

  try {
    const subscription = await getWorkspaceSubscription(createServerSupabaseClient(), workspaceId.data);
    if (subscription?.providerCustomerId === null || subscription?.providerCustomerId === undefined) {
      return NextResponse.json({ error: "stripe_customer_missing" }, { status: 409 });
    }

    const portal = await createWorkspaceBillingPortalSession({
      environment,
      stripeClient: createStripeBillingClient({ secretKey: environment.STRIPE_SECRET_KEY }),
      providerCustomerId: subscription.providerCustomerId,
    });

    return NextResponse.json(BillingPortalResponseSchema.parse(portal), { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "portal_failed",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
