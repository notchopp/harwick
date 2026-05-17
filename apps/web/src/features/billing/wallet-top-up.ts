import {
  BillingWalletTopUpResponseSchema,
  type BillingWalletTopUpRequest,
  type WorkspaceSubscription,
  type WorkspaceUsageWallet,
} from "@realty-ops/core";
import type { StripeBillingClient } from "@realty-ops/integrations";

type WalletPaymentParams = {
  stripeClient: Pick<StripeBillingClient, "createPaymentIntent">;
  workspaceId: string;
  subscription: Pick<WorkspaceSubscription, "providerCustomerId"> | null;
  wallet: WorkspaceUsageWallet | null;
};

function requireStripeCustomer(subscription: Pick<WorkspaceSubscription, "providerCustomerId"> | null): string {
  if (subscription?.providerCustomerId === null || subscription?.providerCustomerId === undefined) {
    throw new Error("Stripe customer is required before wallet top-up.");
  }

  return subscription.providerCustomerId;
}

function requirePaymentMethod(wallet: WorkspaceUsageWallet | null, requestPaymentMethodId?: string): string {
  const paymentMethodId = requestPaymentMethodId ?? wallet?.stripePaymentMethodId ?? null;
  if (paymentMethodId === null) {
    throw new Error("A saved Stripe payment method is required before wallet top-up.");
  }

  return paymentMethodId;
}

function topUpIdempotencyKey(workspaceId: string, amountCents: number): string {
  return `wallet_top_up_${workspaceId}_${amountCents}_${Date.now()}`;
}

function autoRechargeIdempotencyKey(workspaceId: string, now = new Date()): string {
  const windowStart = new Date(now);
  windowStart.setUTCMinutes(Math.floor(windowStart.getUTCMinutes() / 10) * 10, 0, 0);
  return `wallet_recharge_${workspaceId}_${windowStart.toISOString()}`;
}

export async function createWorkspaceWalletTopUpPaymentIntent(
  params: WalletPaymentParams & {
    request: BillingWalletTopUpRequest;
  },
) {
  const customerId = requireStripeCustomer(params.subscription);
  const paymentMethodId = requirePaymentMethod(params.wallet, params.request.paymentMethodId);

  const paymentIntent = await params.stripeClient.createPaymentIntent({
    workspaceId: params.workspaceId,
    amountCents: params.request.amountCents,
    customerId,
    paymentMethodId,
    idempotencyKey: topUpIdempotencyKey(params.workspaceId, params.request.amountCents),
    kind: "wallet_top_up",
  });

  return BillingWalletTopUpResponseSchema.parse(paymentIntent);
}

export async function createWorkspaceWalletAutoRechargePaymentIntent(
  params: WalletPaymentParams & {
    now?: Date;
  },
) {
  const customerId = requireStripeCustomer(params.subscription);
  const paymentMethodId = requirePaymentMethod(params.wallet);
  const amountCents = params.wallet?.autoRechargeAmountCents ?? 5000;

  const paymentIntent = await params.stripeClient.createPaymentIntent({
    workspaceId: params.workspaceId,
    amountCents,
    customerId,
    paymentMethodId,
    idempotencyKey: autoRechargeIdempotencyKey(params.workspaceId, params.now),
    kind: "wallet_auto_recharge",
  });

  return BillingWalletTopUpResponseSchema.parse(paymentIntent);
}
