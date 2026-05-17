import { createHmac, timingSafeEqual } from "node:crypto";
import {
  BillingIntervalSchema,
  BillingPaidPlanTierSchema,
  BillingSubscriptionReconciliationSchema,
  SubscriptionStatusSchema,
  type BillingInterval,
  type BillingPaidPlanTier,
  type BillingSubscriptionReconciliation,
} from "@realty-ops/core";
import { z } from "zod";

const STRIPE_API_BASE_URL = "https://api.stripe.com/v1";

const StripeCheckoutSessionSchema = z.object({
  id: z.string().trim().min(1),
  url: z.string().trim().url(),
});

const StripeBillingCheckoutResponseSchema = z.object({
  provider: z.literal("stripe"),
  providerSessionId: z.string().trim().min(1).max(200),
  checkoutUrl: z.string().trim().url(),
});

const StripeBillingPortalSessionSchema = z.object({
  id: z.string().trim().min(1),
  url: z.string().trim().url(),
});

const StripeBillingPortalResponseSchema = z.object({
  provider: z.literal("stripe"),
  providerSessionId: z.string().trim().min(1).max(200),
  portalUrl: z.string().trim().url(),
});

const StripeMetadataSchema = z.record(z.string(), z.string()).default({});

const StripeExpandableIdSchema = z.union([
  z.string().trim().min(1),
  z.object({ id: z.string().trim().min(1) }).passthrough(),
]).transform((value) => (typeof value === "string" ? value : value.id));

const StripeSubscriptionSnapshotSchema = z.object({
  id: z.string().trim().min(1),
  customer: StripeExpandableIdSchema,
  status: SubscriptionStatusSchema,
  current_period_start: z.number().int().positive(),
  current_period_end: z.number().int().positive(),
  cancel_at_period_end: z.boolean().default(false),
  canceled_at: z.number().int().positive().nullable().optional(),
  trial_start: z.number().int().positive().nullable().optional(),
  trial_end: z.number().int().positive().nullable().optional(),
  metadata: StripeMetadataSchema,
  items: z.object({
    data: z.array(z.object({
      price: z.object({
        recurring: z.object({
          interval: z.enum(["month", "year"]).nullable().optional(),
        }).nullable().optional(),
      }).passthrough(),
    }).passthrough()).default([]),
  }).passthrough().optional(),
}).passthrough();

const StripeCheckoutSessionSnapshotSchema = z.object({
  id: z.string().trim().min(1),
  object: z.literal("checkout.session"),
  customer: StripeExpandableIdSchema.nullable().optional(),
  subscription: StripeExpandableIdSchema.nullable().optional(),
  client_reference_id: z.string().trim().min(1).nullable().optional(),
  metadata: StripeMetadataSchema,
}).passthrough();

const StripeBillingEventSchema = z.object({
  id: z.string().trim().min(1).max(200),
  type: z.string().trim().min(1).max(120),
  data: z.object({
    object: z.unknown(),
  }),
}).passthrough();

export type StripeCheckoutSessionRequest = {
  workspaceId: string;
  planTier: BillingPaidPlanTier;
  billingInterval: BillingInterval;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  customerId?: string | null;
};

export type StripeBillingClientOptions = {
  secretKey: string;
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
};

export type StripeBillingClient = {
  createCheckoutSession(params: StripeCheckoutSessionRequest): Promise<{
    provider: "stripe";
    providerSessionId: string;
    checkoutUrl: string;
  }>;
  createCustomerPortalSession(params: {
    customerId: string;
    returnUrl: string;
  }): Promise<{
    provider: "stripe";
    providerSessionId: string;
    portalUrl: string;
  }>;
  retrieveSubscription(subscriptionId: string): Promise<StripeSubscriptionSnapshot>;
};

export type StripeSubscriptionSnapshot = z.infer<typeof StripeSubscriptionSnapshotSchema>;
export type StripeCheckoutSessionSnapshot = z.infer<typeof StripeCheckoutSessionSnapshotSchema>;

export type StripeBillingWebhookEvent =
  | {
      id: string;
      type: "customer.subscription.created" | "customer.subscription.updated" | "customer.subscription.deleted";
      objectId: string;
      subscription: StripeSubscriptionSnapshot;
    }
  | {
      id: string;
      type: "checkout.session.completed";
      objectId: string;
      checkoutSession: StripeCheckoutSessionSnapshot;
    }
  | {
      id: string;
      type: string;
      objectId: string | null;
      ignored: true;
    };

function buildCheckoutSessionBody(params: StripeCheckoutSessionRequest): URLSearchParams {
  const body = new URLSearchParams();
  body.set("mode", "subscription");
  body.set("client_reference_id", params.workspaceId);
  body.set("success_url", params.successUrl);
  body.set("cancel_url", params.cancelUrl);
  body.set("line_items[0][price]", params.priceId);
  body.set("line_items[0][quantity]", "1");
  body.set("allow_promotion_codes", "true");
  body.set("metadata[workspace_id]", params.workspaceId);
  body.set("metadata[plan_tier]", params.planTier);
  body.set("metadata[billing_interval]", params.billingInterval);
  body.set("subscription_data[metadata][workspace_id]", params.workspaceId);
  body.set("subscription_data[metadata][plan_tier]", params.planTier);
  body.set("subscription_data[metadata][billing_interval]", params.billingInterval);

  if (params.customerId !== undefined && params.customerId !== null) {
    body.set("customer", params.customerId);
  }

  return body;
}

function stripeTimestampToIso(value: number | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return new Date(value * 1000).toISOString();
}

function resolveBillingInterval(
  subscription: StripeSubscriptionSnapshot,
  metadata: Record<string, string>,
): BillingInterval | null {
  const metadataInterval = BillingIntervalSchema.safeParse(metadata["billing_interval"]);
  if (metadataInterval.success) {
    return metadataInterval.data;
  }

  const priceInterval = subscription.items?.data[0]?.price.recurring?.interval;
  const parsedPriceInterval = BillingIntervalSchema.safeParse(priceInterval);
  return parsedPriceInterval.success ? parsedPriceInterval.data : null;
}

export function verifyStripeWebhookSignature(params: {
  rawBody: string;
  signatureHeader: string | null;
  webhookSecret: string;
  toleranceSeconds?: number;
  nowSeconds?: number;
}): boolean {
  if (params.signatureHeader === null || params.signatureHeader.trim().length === 0) {
    return false;
  }

  const parts = params.signatureHeader.split(",").map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3))
    .filter((signature) => signature.length > 0);

  if (timestamp === undefined || signatures.length === 0) {
    return false;
  }

  const timestampSeconds = Number(timestamp);
  if (!Number.isInteger(timestampSeconds) || timestampSeconds <= 0) {
    return false;
  }

  const toleranceSeconds = params.toleranceSeconds ?? 300;
  if (toleranceSeconds > 0) {
    const nowSeconds = params.nowSeconds ?? Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - timestampSeconds) > toleranceSeconds) {
      return false;
    }
  }

  const expected = createHmac("sha256", params.webhookSecret)
    .update(`${timestamp}.${params.rawBody}`, "utf8")
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  return signatures.some((signature) => {
    const actualBuffer = Buffer.from(signature, "hex");
    if (actualBuffer.length === 0 || actualBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(actualBuffer, expectedBuffer);
  });
}

export function parseStripeBillingWebhookEvent(rawBody: string): StripeBillingWebhookEvent {
  const parsed = StripeBillingEventSchema.parse(JSON.parse(rawBody) as unknown);

  if (
    parsed.type === "customer.subscription.created"
    || parsed.type === "customer.subscription.updated"
    || parsed.type === "customer.subscription.deleted"
  ) {
    const subscription = StripeSubscriptionSnapshotSchema.parse(parsed.data.object);
    return {
      id: parsed.id,
      type: parsed.type,
      objectId: subscription.id,
      subscription,
    };
  }

  if (parsed.type === "checkout.session.completed") {
    const checkoutSession = StripeCheckoutSessionSnapshotSchema.parse(parsed.data.object);
    return {
      id: parsed.id,
      type: parsed.type,
      objectId: checkoutSession.id,
      checkoutSession,
    };
  }

  const objectId = z.object({ id: z.string().trim().min(1) }).passthrough().safeParse(parsed.data.object);
  return {
    id: parsed.id,
    type: parsed.type,
    objectId: objectId.success ? objectId.data.id : null,
    ignored: true,
  };
}

export function normalizeStripeSubscriptionForBilling(params: {
  subscription: StripeSubscriptionSnapshot;
  metadataFallback?: Record<string, string>;
}): BillingSubscriptionReconciliation | null {
  const metadata = {
    ...(params.metadataFallback ?? {}),
    ...params.subscription.metadata,
  };
  const workspaceId = metadata["workspace_id"];
  const planTier = BillingPaidPlanTierSchema.safeParse(metadata["plan_tier"]);
  const billingInterval = resolveBillingInterval(params.subscription, metadata);

  if (workspaceId === undefined || !planTier.success || billingInterval === null) {
    return null;
  }

  const canceledAt = stripeTimestampToIso(params.subscription.canceled_at);
  const trialStart = stripeTimestampToIso(params.subscription.trial_start);
  const trialEnd = stripeTimestampToIso(params.subscription.trial_end);

  return BillingSubscriptionReconciliationSchema.parse({
    workspaceId,
    planTier: planTier.data,
    billingInterval,
    status: params.subscription.status,
    providerSubscriptionId: params.subscription.id,
    providerCustomerId: params.subscription.customer,
    currentPeriodStart: stripeTimestampToIso(params.subscription.current_period_start),
    currentPeriodEnd: stripeTimestampToIso(params.subscription.current_period_end),
    canceledAt,
    cancelAtPeriodEnd: params.subscription.cancel_at_period_end,
    trialStart,
    trialEnd,
  });
}

export function createStripeBillingClient(options: StripeBillingClientOptions): StripeBillingClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiBaseUrl = options.apiBaseUrl ?? STRIPE_API_BASE_URL;

  return {
    async createCheckoutSession(params) {
      const response = await fetchImpl(`${apiBaseUrl}/checkout/sessions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.secretKey}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: buildCheckoutSessionBody(params),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`Stripe checkout session failed: ${response.status} ${response.statusText} ${detail}`.trim());
      }

      const session = StripeCheckoutSessionSchema.parse(await response.json());
      return StripeBillingCheckoutResponseSchema.parse({
        provider: "stripe",
        providerSessionId: session.id,
        checkoutUrl: session.url,
      });
    },

    async createCustomerPortalSession(params) {
      const body = new URLSearchParams();
      body.set("customer", params.customerId);
      body.set("return_url", params.returnUrl);

      const response = await fetchImpl(`${apiBaseUrl}/billing_portal/sessions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.secretKey}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`Stripe customer portal session failed: ${response.status} ${response.statusText} ${detail}`.trim());
      }

      const session = StripeBillingPortalSessionSchema.parse(await response.json());
      return StripeBillingPortalResponseSchema.parse({
        provider: "stripe",
        providerSessionId: session.id,
        portalUrl: session.url,
      });
    },

    async retrieveSubscription(subscriptionId) {
      const response = await fetchImpl(`${apiBaseUrl}/subscriptions/${encodeURIComponent(subscriptionId)}`, {
        method: "GET",
        headers: {
          authorization: `Bearer ${options.secretKey}`,
        },
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`Stripe subscription fetch failed: ${response.status} ${response.statusText} ${detail}`.trim());
      }

      return StripeSubscriptionSnapshotSchema.parse(await response.json());
    },
  };
}
