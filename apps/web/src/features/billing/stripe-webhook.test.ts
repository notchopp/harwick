import { describe, expect, it } from "vitest";
import type { BillingSubscriptionReconciliation } from "@realty-ops/core";
import type { StripeBillingClient, StripeBillingWebhookEvent } from "@realty-ops/integrations";
import { handleStripeBillingWebhookEvent, type BillingWebhookStore } from "./stripe-webhook";

function subscriptionEvent(overrides: Partial<StripeBillingWebhookEvent> = {}): StripeBillingWebhookEvent {
  return {
    id: "evt_123",
    type: "customer.subscription.updated",
    objectId: "sub_123",
    subscription: {
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
    ...overrides,
  } as StripeBillingWebhookEvent;
}

function createStore(options: {
  duplicate?: boolean;
  upserts?: BillingSubscriptionReconciliation[];
  completions?: Array<{
    eventId: string;
    status: "processed" | "ignored" | "failed";
    workspaceId?: string | null;
    errorMessage?: string | null;
  }>;
} = {}): BillingWebhookStore {
  return {
    claimEvent() {
      if (options.duplicate === true) {
        return Promise.resolve({ claimed: false, reason: "duplicate" });
      }

      return Promise.resolve({ claimed: true, eventId: "ledger_123" });
    },
    completeEvent(params) {
      options.completions?.push(params);
      return Promise.resolve();
    },
    upsertSubscription(update) {
      options.upserts?.push(update);
      return Promise.resolve();
    },
  };
}

const stripeClient: Pick<StripeBillingClient, "retrieveSubscription"> = {
  retrieveSubscription() {
    return Promise.reject(new Error("retrieveSubscription should not be called"));
  },
};

describe("handleStripeBillingWebhookEvent", () => {
  it("claims the event, upserts the subscription, and marks it processed", async () => {
    const upserts: BillingSubscriptionReconciliation[] = [];
    const completions: Array<{
      eventId: string;
      status: "processed" | "ignored" | "failed";
      workspaceId?: string | null;
      errorMessage?: string | null;
    }> = [];

    const result = await handleStripeBillingWebhookEvent({
      event: subscriptionEvent(),
      stripeClient,
      store: createStore({ upserts, completions }),
    });

    expect(result).toMatchObject({
      accepted: true,
      status: "processed",
      workspaceId: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      providerSubscriptionId: "sub_123",
      providerCustomerId: "cus_123",
      planTier: "team",
    });
    expect(completions).toEqual([{
      eventId: "ledger_123",
      status: "processed",
      workspaceId: "123e4567-e89b-12d3-a456-426614174000",
    }]);
  });

  it("does not process duplicate Stripe events twice", async () => {
    const upserts: BillingSubscriptionReconciliation[] = [];

    const result = await handleStripeBillingWebhookEvent({
      event: subscriptionEvent(),
      stripeClient,
      store: createStore({ duplicate: true, upserts }),
    });

    expect(result.status).toBe("duplicate");
    expect(upserts).toHaveLength(0);
  });

  it("retrieves a subscription for completed checkout sessions", async () => {
    const upserts: BillingSubscriptionReconciliation[] = [];
    const event: StripeBillingWebhookEvent = {
      id: "evt_checkout",
      type: "checkout.session.completed",
      objectId: "cs_test_123",
      checkoutSession: {
        id: "cs_test_123",
        object: "checkout.session",
        customer: "cus_123",
        subscription: "sub_123",
        client_reference_id: "123e4567-e89b-12d3-a456-426614174000",
        metadata: {
          plan_tier: "solo",
          billing_interval: "year",
        },
      },
    };

    const result = await handleStripeBillingWebhookEvent({
      event,
      stripeClient: {
        retrieveSubscription(subscriptionId) {
          expect(subscriptionId).toBe("sub_123");
          return Promise.resolve({
            id: "sub_123",
            customer: "cus_123",
            status: "trialing",
            current_period_start: 1_767_225_600,
            current_period_end: 1_798_761_600,
            cancel_at_period_end: false,
            metadata: {},
          });
        },
      },
      store: createStore({ upserts }),
    });

    expect(result.status).toBe("processed");
    expect(upserts[0]).toMatchObject({
      workspaceId: "123e4567-e89b-12d3-a456-426614174000",
      planTier: "solo",
      billingInterval: "year",
    });
  });

  it("ignores unsupported events after claiming them", async () => {
    const completions: Array<{
      eventId: string;
      status: "processed" | "ignored" | "failed";
      workspaceId?: string | null;
      errorMessage?: string | null;
    }> = [];

    const result = await handleStripeBillingWebhookEvent({
      event: {
        id: "evt_invoice",
        type: "invoice.paid",
        objectId: "in_123",
        ignored: true,
      },
      stripeClient,
      store: createStore({ completions }),
    });

    expect(result).toMatchObject({
      status: "ignored",
      reason: "unsupported_event_type",
    });
    expect(completions).toEqual([{
      eventId: "ledger_123",
      status: "ignored",
      workspaceId: null,
      errorMessage: "unsupported_event_type",
    }]);
  });
});
