import {
  BillingWebhookProcessResultSchema,
  type BillingSubscriptionReconciliation,
  type BillingWebhookProcessResult,
} from "@realty-ops/core";
import {
  normalizeStripeSubscriptionForBilling,
  type StripeBillingClient,
  type StripeBillingWebhookEvent,
} from "@realty-ops/integrations";

export type BillingWebhookStore = {
  claimEvent(params: {
    provider: "stripe";
    providerEventId: string;
    eventType: string;
    providerObjectId: string | null;
  }): Promise<
    | { claimed: true; eventId: string }
    | { claimed: false; reason: "duplicate" }
  >;
  completeEvent(params: {
    eventId: string;
    status: "processed" | "ignored" | "failed";
    workspaceId?: string | null;
    errorMessage?: string | null;
  }): Promise<void>;
  upsertSubscription(update: BillingSubscriptionReconciliation): Promise<void>;
  creditWallet(params: {
    workspaceId: string;
    amountCents: number;
    stripePaymentMethodId: string | null;
    providerPaymentIntentId: string;
    idempotencyKey: string;
  }): Promise<void>;
};

function eventObjectId(event: StripeBillingWebhookEvent): string | null {
  if ("ignored" in event) {
    return event.objectId;
  }

  return event.objectId;
}

function result(params: {
  eventId: string;
  eventType: string;
  status: "processed" | "ignored" | "duplicate";
  workspaceId?: string | null;
  reason?: string | null;
}): BillingWebhookProcessResult {
  return BillingWebhookProcessResultSchema.parse({
    accepted: true,
    provider: "stripe",
    eventId: params.eventId,
    eventType: params.eventType,
    status: params.status,
    workspaceId: params.workspaceId ?? null,
    reason: params.reason ?? null,
  });
}

async function resolveSubscriptionUpdate(params: {
  event: StripeBillingWebhookEvent;
  stripeClient: Pick<StripeBillingClient, "retrieveSubscription">;
}): Promise<{ update: BillingSubscriptionReconciliation | null; reason: string | null }> {
  if ("ignored" in params.event) {
    return { update: null, reason: "unsupported_event_type" };
  }

  if (params.event.type === "checkout.session.completed") {
    const providerSubscriptionId = params.event.checkoutSession.subscription;
    if (providerSubscriptionId === null || providerSubscriptionId === undefined) {
      return { update: null, reason: "checkout_session_missing_subscription" };
    }

    const subscription = await params.stripeClient.retrieveSubscription(providerSubscriptionId);
    return {
      update: normalizeStripeSubscriptionForBilling({
        subscription,
        metadataFallback: {
          ...params.event.checkoutSession.metadata,
          ...(params.event.checkoutSession.client_reference_id === undefined || params.event.checkoutSession.client_reference_id === null
            ? {}
            : { workspace_id: params.event.checkoutSession.client_reference_id }),
        },
      }),
      reason: null,
    };
  }

  if ("subscription" in params.event) {
    return {
      update: normalizeStripeSubscriptionForBilling({ subscription: params.event.subscription }),
      reason: null,
    };
  }

  return { update: null, reason: "unsupported_event_type" };
}

function resolveWalletCredit(event: StripeBillingWebhookEvent): {
  workspaceId: string;
  amountCents: number;
  stripePaymentMethodId: string | null;
  providerPaymentIntentId: string;
  idempotencyKey: string;
} | null {
  if ("ignored" in event || event.type !== "payment_intent.succeeded") {
    return null;
  }

  const kind = event.paymentIntent.metadata["kind"];
  if (kind !== "wallet_top_up" && kind !== "wallet_auto_recharge") {
    return null;
  }

  const workspaceId = event.paymentIntent.metadata["workspace_id"];
  const idempotencyKey = event.paymentIntent.metadata["idempotency_key"];
  if (workspaceId === undefined || idempotencyKey === undefined) {
    return null;
  }

  return {
    workspaceId,
    amountCents: event.paymentIntent.amount_received ?? event.paymentIntent.amount,
    stripePaymentMethodId: event.paymentIntent.payment_method ?? null,
    providerPaymentIntentId: event.paymentIntent.id,
    idempotencyKey,
  };
}

export async function handleStripeBillingWebhookEvent(params: {
  event: StripeBillingWebhookEvent;
  stripeClient: Pick<StripeBillingClient, "retrieveSubscription">;
  store: BillingWebhookStore;
}): Promise<BillingWebhookProcessResult> {
  const claim = await params.store.claimEvent({
    provider: "stripe",
    providerEventId: params.event.id,
    eventType: params.event.type,
    providerObjectId: eventObjectId(params.event),
  });

  if (!claim.claimed) {
    return result({
      eventId: params.event.id,
      eventType: params.event.type,
      status: "duplicate",
      reason: "already_processed",
    });
  }

  try {
    const walletCredit = resolveWalletCredit(params.event);
    if (walletCredit !== null) {
      await params.store.creditWallet(walletCredit);
      await params.store.completeEvent({
        eventId: claim.eventId,
        status: "processed",
        workspaceId: walletCredit.workspaceId,
      });

      return result({
        eventId: params.event.id,
        eventType: params.event.type,
        status: "processed",
        workspaceId: walletCredit.workspaceId,
      });
    }

    const resolved = await resolveSubscriptionUpdate({
      event: params.event,
      stripeClient: params.stripeClient,
    });

    if (resolved.update === null) {
      const reason = resolved.reason ?? "subscription_missing_required_metadata";
      await params.store.completeEvent({
        eventId: claim.eventId,
        status: "ignored",
        workspaceId: null,
        errorMessage: reason,
      });
      return result({
        eventId: params.event.id,
        eventType: params.event.type,
        status: "ignored",
        reason,
      });
    }

    await params.store.upsertSubscription(resolved.update);
    await params.store.completeEvent({
      eventId: claim.eventId,
      status: "processed",
      workspaceId: resolved.update.workspaceId,
    });

    return result({
      eventId: params.event.id,
      eventType: params.event.type,
      status: "processed",
      workspaceId: resolved.update.workspaceId,
    });
  } catch (error) {
    await params.store.completeEvent({
      eventId: claim.eventId,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Unknown Stripe webhook reconciliation error.",
    });
    throw error;
  }
}
