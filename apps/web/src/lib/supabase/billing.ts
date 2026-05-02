import type { RealtyOpsSupabaseClient } from "./server-client";
import {
  WorkspaceSubscription,
  WorkspaceUsageSummary,
  getPlanCapabilities,
  checkUsageLimit,
  PlanGateResult,
} from "@realty-ops/core";

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
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    planTier: data.plan_tier as WorkspaceSubscription["planTier"],
    billingInterval: data.billing_interval,
    status: data.status,
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
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
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
  eventType: "lead_event" | "ai_turn" | "ai_message_sent" | "social_message_sent" | "voice_call_minute" | "listing_created",
  eventCount: number,
  billingPeriodStart: string,
  billingPeriodEnd: string,
  resourceId?: string,
  eventMetadata?: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase.from("workspace_usage_events").insert({
    workspace_id: workspaceId,
    event_type: eventType,
    event_count: eventCount,
    resource_id: resourceId ?? null,
    event_metadata: eventMetadata ?? null,
    billing_period_start: billingPeriodStart,
    billing_period_end: billingPeriodEnd,
  });

  if (error) {
    throw new Error(`Failed to record usage event: ${error.message}`);
  }
}
