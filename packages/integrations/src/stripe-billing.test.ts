import { describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import {
  createStripeBillingClient,
  normalizeStripeSubscriptionForBilling,
  parseStripeBillingWebhookEvent,
  verifyStripeWebhookSignature,
} from "./stripe-billing.js";

describe("createStripeBillingClient", () => {
  it("creates a Stripe checkout session with subscription metadata", async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(new Response(JSON.stringify({
      id: "cs_test_123",
      url: "https://checkout.stripe.com/c/pay/cs_test_123",
    }), { status: 200 })));
    const client = createStripeBillingClient({
      secretKey: "sk_test_secret",
      fetchImpl: fetchMock,
    });

    const result = await client.createCheckoutSession({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      planTier: "team",
      billingInterval: "month",
      priceId: "price_team_month",
      successUrl: "https://app.example.com/settings?billing=success",
      cancelUrl: "https://app.example.com/settings?billing=cancelled",
      customerId: "cus_123",
    });

    expect(result).toEqual({
      provider: "stripe",
      providerSessionId: "cs_test_123",
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_123",
    });
    const call = fetchMock.mock.calls[0];
    if (call === undefined) {
      throw new Error("Expected Stripe fetch call");
    }
    expect(call[0]).toBe("https://api.stripe.com/v1/checkout/sessions");
    const init = call[1];
    if (init === undefined) {
      throw new Error("Expected Stripe fetch init");
    }
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      authorization: "Bearer sk_test_secret",
      "content-type": "application/x-www-form-urlencoded",
    });
    const body = init.body;
    if (!(body instanceof URLSearchParams)) {
      throw new Error("Expected Stripe form body");
    }
    expect(body.get("mode")).toBe("subscription");
    expect(body.get("line_items[0][price]")).toBe("price_team_month");
    expect(body.get("customer")).toBe("cus_123");
    expect(body.get("metadata[workspace_id]")).toBe("00000000-0000-0000-0000-000000000001");
    expect(body.get("subscription_data[metadata][plan_tier]")).toBe("team");
  });

  it("throws with provider detail when Stripe rejects the request", async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(new Response("bad price", {
      status: 400,
      statusText: "Bad Request",
    })));
    const client = createStripeBillingClient({
      secretKey: "sk_test_secret",
      fetchImpl: fetchMock,
    });

    await expect(client.createCheckoutSession({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      planTier: "team",
      billingInterval: "month",
      priceId: "price_bad",
      successUrl: "https://app.example.com/settings?billing=success",
      cancelUrl: "https://app.example.com/settings?billing=cancelled",
    })).rejects.toThrow("Stripe checkout session failed: 400 Bad Request bad price");
  });

  it("creates a Stripe customer portal session", async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(new Response(JSON.stringify({
      id: "bps_123",
      url: "https://billing.stripe.com/p/session/bps_123",
    }), { status: 200 })));
    const client = createStripeBillingClient({
      secretKey: "sk_test_secret",
      fetchImpl: fetchMock,
    });

    const result = await client.createCustomerPortalSession({
      customerId: "cus_123",
      returnUrl: "https://app.example.com/settings?billing=portal_return",
    });

    expect(result).toEqual({
      provider: "stripe",
      providerSessionId: "bps_123",
      portalUrl: "https://billing.stripe.com/p/session/bps_123",
    });
    const call = fetchMock.mock.calls[0];
    if (call === undefined) {
      throw new Error("Expected Stripe portal fetch call");
    }
    expect(call[0]).toBe("https://api.stripe.com/v1/billing_portal/sessions");
    const init = call[1];
    if (init === undefined) {
      throw new Error("Expected Stripe portal fetch init");
    }
    const body = init.body;
    if (!(body instanceof URLSearchParams)) {
      throw new Error("Expected Stripe portal form body");
    }
    expect(body.get("customer")).toBe("cus_123");
    expect(body.get("return_url")).toBe("https://app.example.com/settings?billing=portal_return");
  });

  it("retrieves a subscription snapshot for webhook reconciliation", async () => {
    const fetchCalls: Array<[string, RequestInit]> = [];
    const client = createStripeBillingClient({
      secretKey: "sk_test_123",
      fetchImpl: (url, init) => {
        const requestUrl = typeof url === "string"
          ? url
          : url instanceof URL
            ? url.toString()
            : url.url;
        fetchCalls.push([requestUrl, init ?? {}]);
        return Promise.resolve(new Response(JSON.stringify({
          id: "sub_123",
          customer: "cus_123",
          status: "active",
          current_period_start: 1_767_225_600,
          current_period_end: 1_769_904_000,
          cancel_at_period_end: false,
          metadata: {
            workspace_id: "123e4567-e89b-12d3-a456-426614174000",
            plan_tier: "team",
            billing_interval: "month",
          },
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }));
      },
    });

    const subscription = await client.retrieveSubscription("sub_123");

    expect(subscription.id).toBe("sub_123");
    expect(fetchCalls[0]?.[0]).toBe("https://api.stripe.com/v1/subscriptions/sub_123");
    expect(fetchCalls[0]?.[1].headers).toMatchObject({
      authorization: "Bearer sk_test_123",
    });
  });

  it("creates an off-session Stripe payment intent for wallet top-up", async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(new Response(JSON.stringify({
      id: "pi_123",
      amount: 5000,
      amount_received: 5000,
      status: "succeeded",
      client_secret: null,
    }), { status: 200 })));
    const client = createStripeBillingClient({
      secretKey: "sk_test_secret",
      fetchImpl: fetchMock,
    });

    const result = await client.createPaymentIntent({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      amountCents: 5000,
      customerId: "cus_123",
      paymentMethodId: "pm_123",
      idempotencyKey: "wallet_top_up_123",
      kind: "wallet_top_up",
    });

    expect(result).toEqual({
      provider: "stripe",
      providerPaymentIntentId: "pi_123",
      status: "succeeded",
      amountCents: 5000,
      clientSecret: null,
    });
    const call = fetchMock.mock.calls[0];
    if (call === undefined) {
      throw new Error("Expected Stripe payment intent fetch call");
    }
    expect(call[0]).toBe("https://api.stripe.com/v1/payment_intents");
    const init = call[1];
    if (init === undefined) {
      throw new Error("Expected Stripe payment intent fetch init");
    }
    expect(init.headers).toMatchObject({
      authorization: "Bearer sk_test_secret",
      "content-type": "application/x-www-form-urlencoded",
      "idempotency-key": "wallet_top_up_123",
    });
    const body = init.body;
    if (!(body instanceof URLSearchParams)) {
      throw new Error("Expected Stripe form body");
    }
    expect(body.get("amount")).toBe("5000");
    expect(body.get("currency")).toBe("usd");
    expect(body.get("customer")).toBe("cus_123");
    expect(body.get("payment_method")).toBe("pm_123");
    expect(body.get("confirm")).toBe("true");
    expect(body.get("off_session")).toBe("true");
    expect(body.get("metadata[kind]")).toBe("wallet_top_up");
    expect(body.get("metadata[idempotency_key]")).toBe("wallet_top_up_123");
  });
});

describe("Stripe billing webhook helpers", () => {
  function sign(rawBody: string, secret = "whsec_test", timestamp = 1_767_225_600): string {
    const signature = createHmac("sha256", secret)
      .update(`${timestamp}.${rawBody}`, "utf8")
      .digest("hex");
    return `t=${timestamp},v1=${signature}`;
  }

  it("verifies Stripe signatures against the raw request body", () => {
    const rawBody = JSON.stringify({ id: "evt_123" });
    expect(verifyStripeWebhookSignature({
      rawBody,
      signatureHeader: sign(rawBody),
      webhookSecret: "whsec_test",
      nowSeconds: 1_767_225_660,
    })).toBe(true);
  });

  it("rejects malformed, expired, and mismatched Stripe signatures", () => {
    const rawBody = JSON.stringify({ id: "evt_123" });
    expect(verifyStripeWebhookSignature({
      rawBody,
      signatureHeader: null,
      webhookSecret: "whsec_test",
      nowSeconds: 1_767_225_600,
    })).toBe(false);
    expect(verifyStripeWebhookSignature({
      rawBody,
      signatureHeader: sign(rawBody, "whsec_other"),
      webhookSecret: "whsec_test",
      nowSeconds: 1_767_225_600,
    })).toBe(false);
    expect(verifyStripeWebhookSignature({
      rawBody,
      signatureHeader: sign(rawBody, "whsec_test", 1_767_225_000),
      webhookSecret: "whsec_test",
      nowSeconds: 1_767_225_600,
    })).toBe(false);
  });

  it("parses and normalizes subscription events into billing updates", () => {
    const rawBody = JSON.stringify({
      id: "evt_123",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_123",
          customer: "cus_123",
          status: "active",
          current_period_start: 1_767_225_600,
          current_period_end: 1_769_904_000,
          cancel_at_period_end: false,
          metadata: {
            workspace_id: "123e4567-e89b-12d3-a456-426614174000",
            plan_tier: "team",
            billing_interval: "month",
          },
        },
      },
    });

    const event = parseStripeBillingWebhookEvent(rawBody);
    expect(event.type).toBe("customer.subscription.updated");
    if (!("subscription" in event)) {
      throw new Error("Expected subscription event");
    }

    const update = normalizeStripeSubscriptionForBilling({ subscription: event.subscription });
    expect(update).toMatchObject({
      workspaceId: "123e4567-e89b-12d3-a456-426614174000",
      planTier: "team",
      billingInterval: "month",
      status: "active",
      providerSubscriptionId: "sub_123",
      providerCustomerId: "cus_123",
      currentPeriodStart: "2026-01-01T00:00:00.000Z",
      currentPeriodEnd: "2026-02-01T00:00:00.000Z",
    });
  });

  it("uses checkout-session metadata as fallback when retrieved subscription metadata is incomplete", () => {
    const update = normalizeStripeSubscriptionForBilling({
      metadataFallback: {
        workspace_id: "123e4567-e89b-12d3-a456-426614174000",
        plan_tier: "solo",
        billing_interval: "year",
      },
      subscription: {
        id: "sub_123",
        customer: "cus_123",
        status: "trialing",
        current_period_start: 1_767_225_600,
        current_period_end: 1_798_761_600,
        cancel_at_period_end: false,
        metadata: {},
      },
    });

    expect(update?.planTier).toBe("solo");
    expect(update?.billingInterval).toBe("year");
  });

  it("parses wallet payment intent succeeded events", () => {
    const event = parseStripeBillingWebhookEvent(JSON.stringify({
      id: "evt_pi",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_123",
          object: "payment_intent",
          amount: 5000,
          amount_received: 5000,
          status: "succeeded",
          customer: "cus_123",
          payment_method: "pm_123",
          metadata: {
            workspace_id: "123e4567-e89b-12d3-a456-426614174000",
            kind: "wallet_top_up",
            idempotency_key: "wallet_top_up_123",
          },
        },
      },
    }));

    expect(event.type).toBe("payment_intent.succeeded");
    if (!("paymentIntent" in event)) {
      throw new Error("Expected payment intent event");
    }
    expect(event.paymentIntent.payment_method).toBe("pm_123");
    expect(event.paymentIntent.metadata["kind"]).toBe("wallet_top_up");
  });
});
