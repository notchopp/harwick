import type { BillingCheckoutRequest, BillingInterval, BillingPaidPlanTier, ServerEnvironment } from "@realty-ops/core";
import type { StripeBillingClient } from "@realty-ops/integrations";

type StripePriceKey =
  | "STRIPE_SOLO_MONTHLY_PRICE_ID"
  | "STRIPE_SOLO_YEARLY_PRICE_ID"
  | "STRIPE_TEAM_MONTHLY_PRICE_ID"
  | "STRIPE_TEAM_YEARLY_PRICE_ID"
  | "STRIPE_BROKERAGE_MONTHLY_PRICE_ID"
  | "STRIPE_BROKERAGE_YEARLY_PRICE_ID";

export type WorkspaceBillingCheckoutParams = {
  environment: ServerEnvironment;
  stripeClient: StripeBillingClient;
  workspaceId: string;
  request: BillingCheckoutRequest;
  providerCustomerId?: string | null;
};

function stripePriceKey(planTier: BillingPaidPlanTier, billingInterval: BillingInterval): StripePriceKey {
  const interval = billingInterval === "year" ? "YEARLY" : "MONTHLY";
  if (planTier === "solo") return `STRIPE_SOLO_${interval}_PRICE_ID`;
  if (planTier === "team") return `STRIPE_TEAM_${interval}_PRICE_ID`;
  return `STRIPE_BROKERAGE_${interval}_PRICE_ID`;
}

export function resolveStripePriceId(
  environment: ServerEnvironment,
  request: BillingCheckoutRequest,
): string {
  const key = stripePriceKey(request.planTier, request.billingInterval);
  const priceId = environment[key];
  if (priceId === undefined) {
    throw new Error(`Stripe price is not configured for ${request.planTier}/${request.billingInterval}`);
  }

  return priceId;
}

function buildBillingReturnUrls(appUrl: string, returnPath?: string): { successUrl: string; cancelUrl: string } {
  const baseUrl = appUrl.replace(/\/+$/, "");
  if (returnPath !== undefined) {
    return {
      successUrl: `${baseUrl}${returnPath}?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${baseUrl}/onboarding?billing=cancelled`,
    };
  }

  return {
    successUrl: `${baseUrl}/settings?billing=success&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${baseUrl}/settings?billing=cancelled`,
  };
}

export async function createWorkspaceBillingCheckoutSession(
  params: WorkspaceBillingCheckoutParams,
) {
  const priceId = resolveStripePriceId(params.environment, params.request);
  const urls = buildBillingReturnUrls(params.environment.NEXT_PUBLIC_APP_URL, params.request.returnPath);

  return params.stripeClient.createCheckoutSession({
    workspaceId: params.workspaceId,
    planTier: params.request.planTier,
    billingInterval: params.request.billingInterval,
    priceId,
    successUrl: urls.successUrl,
    cancelUrl: urls.cancelUrl,
    customerId: params.providerCustomerId ?? null,
  });
}

export async function createWorkspaceBillingPortalSession(params: {
  environment: ServerEnvironment;
  stripeClient: StripeBillingClient;
  providerCustomerId: string;
}) {
  const returnUrl = `${params.environment.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/settings?billing=portal_return`;
  return params.stripeClient.createCustomerPortalSession({
    customerId: params.providerCustomerId,
    returnUrl,
  });
}
