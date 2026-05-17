import type { RealtyOpsSupabaseClient } from "./server-client";
import {
  WorkspaceSubscription,
  MonthlyUsageSummary,
  WorkspaceUsageWallet,
  WorkspaceUsageSummary,
  type BillingWalletUsageEventType,
  type BillingSubscriptionReconciliation,
  type UsageEventType,
  getPlanCapabilities,
  checkUsageLimit,
  PlanGateResult,
} from "@realty-ops/core";
import type {
  BillingUsageEventInsertRow,
  BillingWebhookEventRow,
  Json,
  MonthlyUsageSummaryRow,
  WorkspaceUsageEventInsertRow,
  WorkspaceUsageWalletRow,
} from "./database.types";

async function countQuery(query: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
  const { count, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

export async function getWorkspaceSubscription(
  supabase: RealtyOpsSupabaseClient,
  workspaceId: string
): Promise<WorkspaceSubscription | null> {
  const { data, error } = await supabase
    .from("workspace_subscriptions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch workspace subscription: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    workspaceId: data.workspace_id,
    planTier: data.plan_tier as WorkspaceSubscription["planTier"],
    billingInterval: data.billing_interval as WorkspaceSubscription["billingInterval"],
    status: data.status as WorkspaceSubscription["status"],
    providerSubscriptionId: data.provider_subscription_id,
    providerCustomerId: data.provider_customer_id,
    currentPeriodStart: data.current_period_start,
    currentPeriodEnd: data.current_period_end,
    canceledAt: data.canceled_at,
    cancelAtPeriodEnd: data.cancel_at_period_end,
    trialStart: data.trial_start,
    trialEnd: data.trial_end,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

function mapWorkspaceSubscriptionRow(data: {
  id: string;
  workspace_id: string;
  plan_tier: string;
  billing_interval: string;
  status: string;
  provider_subscription_id: string | null;
  provider_customer_id: string | null;
  current_period_start: string;
  current_period_end: string;
  canceled_at: string | null;
  cancel_at_period_end: boolean;
  trial_start: string | null;
  trial_end: string | null;
  created_at: string;
  updated_at: string;
}): WorkspaceSubscription {
  return {
    id: data.id,
    workspaceId: data.workspace_id,
    planTier: data.plan_tier as WorkspaceSubscription["planTier"],
    billingInterval: data.billing_interval as WorkspaceSubscription["billingInterval"],
    status: data.status as WorkspaceSubscription["status"],
    providerSubscriptionId: data.provider_subscription_id,
    providerCustomerId: data.provider_customer_id,
    currentPeriodStart: data.current_period_start,
    currentPeriodEnd: data.current_period_end,
    canceledAt: data.canceled_at,
    cancelAtPeriodEnd: data.cancel_at_period_end,
    trialStart: data.trial_start,
    trialEnd: data.trial_end,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function upsertWorkspaceSubscriptionFromProvider(
  supabase: RealtyOpsSupabaseClient,
  update: BillingSubscriptionReconciliation,
): Promise<WorkspaceSubscription> {
  const { data, error } = await supabase
    .from("workspace_subscriptions")
    .upsert({
      workspace_id: update.workspaceId,
      plan_tier: update.planTier,
      billing_interval: update.billingInterval,
      status: update.status,
      provider_subscription_id: update.providerSubscriptionId,
      provider_customer_id: update.providerCustomerId,
      current_period_start: update.currentPeriodStart,
      current_period_end: update.currentPeriodEnd,
      canceled_at: update.canceledAt,
      cancel_at_period_end: update.cancelAtPeriodEnd,
      trial_start: update.trialStart,
      trial_end: update.trialEnd,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: "workspace_id",
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to reconcile workspace subscription: ${error.message}`);
  }

  return mapWorkspaceSubscriptionRow(data);
}

export type BillingWebhookClaimResult =
  | { claimed: true; event: BillingWebhookEventRow }
  | { claimed: false; reason: "duplicate" };

export async function claimBillingWebhookEvent(
  supabase: RealtyOpsSupabaseClient,
  params: {
    provider: "stripe";
    providerEventId: string;
    eventType: string;
    providerObjectId: string | null;
  },
): Promise<BillingWebhookClaimResult> {
  const { data, error } = await supabase
    .from("billing_webhook_events")
    .insert({
      provider: params.provider,
      provider_event_id: params.providerEventId,
      event_type: params.eventType,
      provider_object_id: params.providerObjectId,
      processing_status: "processing",
    })
    .select("*")
    .single();

  if (error) {
    const maybeCode = "code" in error ? String(error.code) : "";
    if (maybeCode === "23505") {
      return { claimed: false, reason: "duplicate" };
    }

    throw new Error(`Failed to claim billing webhook event: ${error.message}`);
  }

  return { claimed: true, event: data };
}

export async function completeBillingWebhookEvent(
  supabase: RealtyOpsSupabaseClient,
  params: {
    eventId: string;
    status: "processed" | "ignored" | "failed";
    workspaceId?: string | null;
    errorMessage?: string | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from("billing_webhook_events")
    .update({
      processing_status: params.status,
      workspace_id: params.workspaceId ?? null,
      error_message: params.errorMessage ?? null,
      processed_at: new Date().toISOString(),
    })
    .eq("id", params.eventId);

  if (error) {
    throw new Error(`Failed to complete billing webhook event: ${error.message}`);
  }
}

export async function getCurrentUsageSummary(
  supabase: RealtyOpsSupabaseClient,
  workspaceId: string,
  billingPeriodStart: string
): Promise<WorkspaceUsageSummary | null> {
  const { data, error } = await supabase
    .from("workspace_usage_summaries")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("billing_period_start", billingPeriodStart)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch usage summary: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    workspaceId: data.workspace_id,
    planTier: data.plan_tier as WorkspaceUsageSummary["planTier"],
    billingPeriodStart: data.billing_period_start,
    billingPeriodEnd: data.billing_period_end,
    leadEventCount: data.lead_event_count,
    aiTurnCount: data.ai_turn_count,
    aiMessageSentCount: data.ai_message_sent_count,
    socialMessageSentCount: data.social_message_sent_count,
    voiceCallMinutes: data.voice_call_minutes,
    listingCount: data.listing_count,
    activeSeatCount: data.active_seat_count,
    activeIntegrationAccountCount: data.active_integration_account_count,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

function mapWorkspaceUsageWalletRow(data: WorkspaceUsageWalletRow): WorkspaceUsageWallet {
  return {
    workspaceId: data.workspace_id,
    balanceCents: data.balance_cents,
    autoRechargeEnabled: data.auto_recharge_enabled,
    autoRechargeThresholdCents: data.auto_recharge_threshold_cents,
    autoRechargeAmountCents: data.auto_recharge_amount_cents,
    stripePaymentMethodId: data.stripe_payment_method_id,
    lastRechargeAt: data.last_recharge_at,
    lowBalanceNotifiedAt: data.low_balance_notified_at,
    updatedAt: data.updated_at,
  };
}

function mapMonthlyUsageSummaryRow(data: MonthlyUsageSummaryRow): MonthlyUsageSummary {
  return {
    workspaceId: data.workspace_id ?? "",
    month: data.month ?? new Date().toISOString().slice(0, 10),
    turnsUsed: data.turns_used ?? 0,
    minutesUsed: data.minutes_used ?? 0,
    memoryLoopsUsed: data.memory_loops_used ?? 0,
    overageListings: data.overage_listings ?? 0,
    overageSeats: data.overage_seats ?? 0,
    retailCents: data.retail_cents ?? 0,
    cogsCents: data.cogs_cents ?? 0,
    balanceAfterCents: data.balance_after_cents ?? null,
  };
}

export async function getLatestMonthlyUsageSummary(
  supabase: RealtyOpsSupabaseClient,
  workspaceId: string,
): Promise<MonthlyUsageSummary | null> {
  const { data, error } = await supabase
    .from("monthly_usage_summary")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("month", { ascending: false })
    .limit(1)
    .maybeSingle<MonthlyUsageSummaryRow>();

  if (error) {
    throw new Error(`Failed to fetch monthly usage summary: ${error.message}`);
  }

  return data === null ? null : mapMonthlyUsageSummaryRow(data);
}

export async function getWorkspaceUsageWallet(
  supabase: RealtyOpsSupabaseClient,
  workspaceId: string,
): Promise<WorkspaceUsageWallet | null> {
  const { data, error } = await supabase
    .from("workspace_usage_wallet")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle<WorkspaceUsageWalletRow>();

  if (error) {
    throw new Error(`Failed to fetch workspace usage wallet: ${error.message}`);
  }

  return data === null ? null : mapWorkspaceUsageWalletRow(data);
}

export async function creditWorkspaceUsageWallet(
  supabase: RealtyOpsSupabaseClient,
  params: {
    workspaceId: string;
    amountCents: number;
    stripePaymentMethodId?: string | null;
  },
): Promise<number> {
  const { data, error } = await supabase.rpc("credit_workspace_usage_wallet", {
    p_workspace_id: params.workspaceId,
    p_amount_cents: params.amountCents,
    p_stripe_payment_method_id: params.stripePaymentMethodId ?? null,
  });

  if (error) {
    throw new Error(`Failed to credit workspace usage wallet: ${error.message}`);
  }

  return data;
}

export async function recordBillingUsageEvent(
  supabase: RealtyOpsSupabaseClient,
  params: {
    workspaceId: string;
    eventType: BillingWalletUsageEventType;
    idempotencyKey: string;
    unitCount?: number;
    retailCents?: number;
    cogsCents?: number;
    sourceId?: string | null;
    eventMetadata?: Record<string, unknown> | null;
  },
): Promise<boolean> {
  const wallet = await getWorkspaceUsageWallet(supabase, params.workspaceId);
  const row: BillingUsageEventInsertRow = {
    workspace_id: params.workspaceId,
    event_type: params.eventType,
    unit_count: params.unitCount ?? 1,
    retail_cents: params.retailCents ?? 0,
    cogs_cents: params.cogsCents ?? 0,
    balance_after_cents: wallet?.balanceCents ?? 0,
    source_id: params.sourceId ?? null,
    idempotency_key: params.idempotencyKey,
    event_metadata: (params.eventMetadata ?? null) as Json,
  };

  const { error } = await supabase.from("usage_events").insert(row);
  if (error) {
    const maybeCode = "code" in error ? String(error.code) : "";
    if (maybeCode === "23505") {
      return false;
    }

    throw new Error(`Failed to record billing usage event: ${error.message}`);
  }

  return true;
}

export async function checkSeatLimit(
  supabase: RealtyOpsSupabaseClient,
  workspaceId: string
): Promise<PlanGateResult> {
  const subscription = await getWorkspaceSubscription(supabase, workspaceId);

  if (!subscription) {
    return {
      allowed: false,
      reason: "No active subscription found",
      currentCount: null,
      maxCount: null,
    };
  }

  const currentSeats = await countQuery(
    supabase
      .from("workspace_members")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("is_active", true),
  );
  return checkUsageLimit(subscription.planTier, "maxSeats", currentSeats);
}

export async function checkLeadEventLimit(
  supabase: RealtyOpsSupabaseClient,
  workspaceId: string,
  billingPeriodStart: string
): Promise<PlanGateResult> {
  const subscription = await getWorkspaceSubscription(supabase, workspaceId);

  if (!subscription) {
    return {
      allowed: false,
      reason: "No active subscription found",
      currentCount: null,
      maxCount: null,
    };
  }

  const summary = await getCurrentUsageSummary(supabase, workspaceId, billingPeriodStart);

  const currentEvents = summary?.leadEventCount ?? 0;
  return checkUsageLimit(subscription.planTier, "maxLeadEventsPerMonth", currentEvents);
}

export async function checkListingLimit(
  supabase: RealtyOpsSupabaseClient,
  workspaceId: string
): Promise<PlanGateResult> {
  const subscription = await getWorkspaceSubscription(supabase, workspaceId);

  if (!subscription) {
    return {
      allowed: false,
      reason: "No active subscription found",
      currentCount: null,
      maxCount: null,
    };
  }

  const currentListings = await countQuery(
    supabase
      .from("listing_facts")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .neq("status", "archived"),
  );
  return checkUsageLimit(subscription.planTier, "maxListings", currentListings);
}

export async function checkIntegrationAccountLimit(
  supabase: RealtyOpsSupabaseClient,
  workspaceId: string,
  provider: "meta" | "follow_up_boss" | "twilio" | "retell"
): Promise<PlanGateResult> {
  const subscription = await getWorkspaceSubscription(supabase, workspaceId);

  if (!subscription) {
    return {
      allowed: false,
      reason: "No active subscription found",
      currentCount: null,
      maxCount: null,
    };
  }

  let limitKey: "maxInstagramAccounts" | "maxFacebookAccounts" | "maxVoiceAgents";
  let providerFilter: "meta" | "follow_up_boss" | "twilio" | "retell";

  if (provider === "meta") {
    limitKey = "maxInstagramAccounts";
    providerFilter = "meta";
  } else if (provider === "retell") {
    limitKey = "maxVoiceAgents";
    providerFilter = "retell";
  } else {
    return {
      allowed: true,
      reason: null,
      currentCount: null,
      maxCount: null,
    };
  }

  const currentCount = await countQuery(
    supabase
      .from("integration_accounts")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("provider", providerFilter)
      .in("status", ["connected", "pending"]),
  );
  return checkUsageLimit(subscription.planTier, limitKey, currentCount);
}

export async function canAccessPlanFeature(
  supabase: RealtyOpsSupabaseClient,
  workspaceId: string,
  feature: keyof ReturnType<typeof getPlanCapabilities>
): Promise<boolean> {
  const subscription = await getWorkspaceSubscription(supabase, workspaceId);

  if (!subscription) {
    return false;
  }

  const capabilities = getPlanCapabilities(subscription.planTier);
  return Boolean(capabilities[feature]);
}

export async function recordUsageEvent(
  supabase: RealtyOpsSupabaseClient,
  workspaceId: string,
  eventType: UsageEventType,
  eventCount: number,
  billingPeriodStart: string,
  billingPeriodEnd: string,
  resourceId?: string,
  eventMetadata?: Record<string, unknown>
): Promise<void> {
  const row: WorkspaceUsageEventInsertRow = {
    workspace_id: workspaceId,
    event_type: eventType,
    event_count: eventCount,
    resource_id: resourceId ?? null,
    event_metadata: (eventMetadata ?? null) as Json,
    billing_period_start: billingPeriodStart,
    billing_period_end: billingPeriodEnd,
  };
  const { error } = await supabase.from("workspace_usage_events").insert([row]);

  if (error) {
    throw new Error(`Failed to record usage event: ${error.message}`);
  }
}

export async function recordCurrentPeriodUsageEvent(
  supabase: RealtyOpsSupabaseClient,
  params: {
    workspaceId: string;
    eventType: UsageEventType;
    eventCount?: number;
    resourceId?: string | null;
    eventMetadata?: Record<string, unknown> | null;
  },
): Promise<boolean> {
  const subscription = await getWorkspaceSubscription(supabase, params.workspaceId);
  if (
    subscription === null
    || subscription.status === "canceled"
    || subscription.status === "incomplete_expired"
    || subscription.status === "paused"
  ) {
    return false;
  }

  await recordUsageEvent(
    supabase,
    params.workspaceId,
    params.eventType,
    params.eventCount ?? 1,
    subscription.currentPeriodStart,
    subscription.currentPeriodEnd,
    params.resourceId ?? undefined,
    params.eventMetadata ?? undefined,
  );
  return true;
}
