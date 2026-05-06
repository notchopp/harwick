import { describe, expect, it, vi } from "vitest";
import type { ServerEnvironment } from "@realty-ops/core";
import {
  createWorkspaceBillingCheckoutSession,
  createWorkspaceBillingPortalSession,
  resolveStripePriceId,
} from "./stripe-checkout";

const environment: ServerEnvironment = {
  APP_ENV: "development",
  NEXT_PUBLIC_APP_URL: "https://app.example.com",
  META_APP_ID: "meta-app",
  META_APP_SECRET: "meta-secret",
  META_WEBHOOK_VERIFY_TOKEN: "verify-token-long-enough",
  RETELL_API_KEY: "retell-api-key",
  OPENAI_REPLY_MODEL: "gpt-5.2",
  OPENAI_SMALL_MODEL: "gpt-4o-mini",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  STRIPE_SECRET_KEY: "sk_test_secret",
  STRIPE_TEAM_MONTHLY_PRICE_ID: "price_team_month",
  STRIPE_TEAM_YEARLY_PRICE_ID: "price_team_year",
};

describe("resolveStripePriceId", () => {
  it("maps plan tier and interval to configured Stripe price IDs", () => {
    expect(resolveStripePriceId(environment, {
      planTier: "team",
      billingInterval: "month",
    })).toBe("price_team_month");

    expect(resolveStripePriceId(environment, {
      planTier: "team",
      billingInterval: "year",
    })).toBe("price_team_year");
  });

  it("throws when a price is not configured", () => {
    expect(() => resolveStripePriceId(environment, {
      planTier: "solo",
      billingInterval: "month",
    })).toThrow("Stripe price is not configured for solo/month");
  });
});

describe("createWorkspaceBillingCheckoutSession", () => {
  it("creates a checkout session with workspace-safe return URLs", async () => {
    const createCheckoutSession = vi.fn(() => Promise.resolve({
      provider: "stripe" as const,
      providerSessionId: "cs_test_123",
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_123",
    }));

    const response = await createWorkspaceBillingCheckoutSession({
      environment,
      stripeClient: {
        createCheckoutSession,
        createCustomerPortalSession: vi.fn(),
        retrieveSubscription: vi.fn(),
      },
      workspaceId: "00000000-0000-0000-0000-000000000001",
      request: {
        planTier: "team",
        billingInterval: "month",
      },
      providerCustomerId: "cus_123",
    });

    expect(response.checkoutUrl).toBe("https://checkout.stripe.com/c/pay/cs_test_123");
    expect(createCheckoutSession).toHaveBeenCalledWith({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      planTier: "team",
      billingInterval: "month",
      priceId: "price_team_month",
      successUrl: "https://app.example.com/settings?billing=success&session_id={CHECKOUT_SESSION_ID}",
      cancelUrl: "https://app.example.com/settings?billing=cancelled",
      customerId: "cus_123",
    });
  });
});

describe("createWorkspaceBillingPortalSession", () => {
  it("creates a portal session with a workspace-safe return URL", async () => {
    const createCustomerPortalSession = vi.fn(() => Promise.resolve({
      provider: "stripe" as const,
      providerSessionId: "bps_123",
      portalUrl: "https://billing.stripe.com/p/session/bps_123",
    }));

    const response = await createWorkspaceBillingPortalSession({
      environment,
      stripeClient: {
        createCheckoutSession: vi.fn(),
        createCustomerPortalSession,
        retrieveSubscription: vi.fn(),
      },
      providerCustomerId: "cus_123",
    });

    expect(response.portalUrl).toBe("https://billing.stripe.com/p/session/bps_123");
    expect(createCustomerPortalSession).toHaveBeenCalledWith({
      customerId: "cus_123",
      returnUrl: "https://app.example.com/settings?billing=portal_return",
    });
  });
});
