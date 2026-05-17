import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "./common.js";

export const BillingPaidPlanTierSchema = z.enum(["solo", "team", "brokerage"]);
export const BillingPlanTierSchema = z.enum(["free", "solo", "team", "brokerage"]);

export const BillingIntervalSchema = z.enum(["month", "year"]);

export const SubscriptionStatusSchema = z.enum([
  "active",
  "trialing",
  "past_due",
  "canceled",
  "unpaid",
  "incomplete",
  "incomplete_expired",
  "paused",
]);

export const WorkspaceSubscriptionSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  planTier: BillingPaidPlanTierSchema,
  billingInterval: BillingIntervalSchema,
  status: SubscriptionStatusSchema,
  providerSubscriptionId: z.string().trim().min(1).max(120).nullable(),
  providerCustomerId: z.string().trim().min(1).max(120).nullable(),
  currentPeriodStart: IsoDateTimeSchema,
  currentPeriodEnd: IsoDateTimeSchema,
  canceledAt: IsoDateTimeSchema.nullable(),
  cancelAtPeriodEnd: z.boolean(),
  trialStart: IsoDateTimeSchema.nullable(),
  trialEnd: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export const UsageEventTypeSchema = z.enum([
  "lead_event",
  "ai_turn",
  "ai_message_sent",
  "social_message_sent",
  "voice_call_minute",
  "listing_created",
]);

export const WorkspaceUsageEventSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  eventType: UsageEventTypeSchema,
  eventCount: z.number().int().nonnegative(),
  resourceId: UuidSchema.nullable(),
  eventMetadata: z.record(z.string(), z.unknown()).nullable(),
  billingPeriodStart: IsoDateTimeSchema,
  billingPeriodEnd: IsoDateTimeSchema,
  createdAt: IsoDateTimeSchema,
});

export const WorkspaceUsageSummarySchema = z.object({
  workspaceId: UuidSchema,
  planTier: BillingPlanTierSchema,
  billingPeriodStart: IsoDateTimeSchema,
  billingPeriodEnd: IsoDateTimeSchema,
  leadEventCount: z.number().int().nonnegative(),
  aiTurnCount: z.number().int().nonnegative(),
  aiMessageSentCount: z.number().int().nonnegative(),
  socialMessageSentCount: z.number().int().nonnegative(),
  voiceCallMinutes: z.number().nonnegative(),
  listingCount: z.number().int().nonnegative(),
  activeSeatCount: z.number().int().nonnegative(),
  activeIntegrationAccountCount: z.number().int().nonnegative(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export const BillingWalletUsageEventTypeSchema = z.enum([
  "social_turn",
  "voice_minute",
  "memory_loop",
  "overage_listing",
  "overage_seat",
]);

export const WorkspaceUsageWalletSchema = z.object({
  workspaceId: UuidSchema,
  balanceCents: z.number().int().nonnegative(),
  autoRechargeEnabled: z.boolean(),
  autoRechargeThresholdCents: z.number().int().nonnegative(),
  autoRechargeAmountCents: z.number().int().nonnegative(),
  stripePaymentMethodId: z.string().trim().min(1).max(200).nullable(),
  lastRechargeAt: IsoDateTimeSchema.nullable(),
  lowBalanceNotifiedAt: IsoDateTimeSchema.nullable(),
  updatedAt: IsoDateTimeSchema,
});

export const BillingUsageEventSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  occurredAt: IsoDateTimeSchema,
  eventType: BillingWalletUsageEventTypeSchema,
  unitCount: z.number().positive(),
  retailCents: z.number().int().nonnegative(),
  cogsCents: z.number().int().nonnegative(),
  balanceAfterCents: z.number().int().nonnegative(),
  sourceId: z.string().trim().min(1).max(200).nullable(),
  idempotencyKey: z.string().trim().min(1).max(240),
  eventMetadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: IsoDateTimeSchema,
});

export const MonthlyUsageSummarySchema = z.object({
  workspaceId: UuidSchema,
  month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  turnsUsed: z.number().nonnegative(),
  minutesUsed: z.number().nonnegative(),
  memoryLoopsUsed: z.number().nonnegative(),
  overageListings: z.number().nonnegative(),
  overageSeats: z.number().nonnegative(),
  retailCents: z.number().int().nonnegative(),
  cogsCents: z.number().int().nonnegative(),
  balanceAfterCents: z.number().int().nonnegative().nullable(),
});

export const PlanCapacityStatusSchema = z.enum([
  "allow",
  "needs_wallet_funded",
  "blocked_by_plan",
]);

export const PlanCapacityDecisionSchema = z.object({
  status: PlanCapacityStatusSchema,
  planTier: BillingPlanTierSchema,
  eventType: BillingWalletUsageEventTypeSchema,
  limit: z.number().int().nonnegative().nullable(),
  used: z.number().nonnegative(),
  walletBalanceCents: z.number().int().nonnegative(),
  retailCents: z.number().int().nonnegative(),
  cogsCents: z.number().int().nonnegative(),
  reason: z.string().trim().min(1).max(240),
});

export type BillingPlanTier = z.infer<typeof BillingPlanTierSchema>;
export type BillingPaidPlanTier = z.infer<typeof BillingPaidPlanTierSchema>;
export type BillingInterval = z.infer<typeof BillingIntervalSchema>;
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;
export type WorkspaceSubscription = z.infer<typeof WorkspaceSubscriptionSchema>;
export type UsageEventType = z.infer<typeof UsageEventTypeSchema>;
export type WorkspaceUsageEvent = z.infer<typeof WorkspaceUsageEventSchema>;
export type WorkspaceUsageSummary = z.infer<typeof WorkspaceUsageSummarySchema>;
export type BillingWalletUsageEventType = z.infer<typeof BillingWalletUsageEventTypeSchema>;
export type WorkspaceUsageWallet = z.infer<typeof WorkspaceUsageWalletSchema>;
export type BillingUsageEvent = z.infer<typeof BillingUsageEventSchema>;
export type MonthlyUsageSummary = z.infer<typeof MonthlyUsageSummarySchema>;
export type PlanCapacityStatus = z.infer<typeof PlanCapacityStatusSchema>;
export type PlanCapacityDecision = z.infer<typeof PlanCapacityDecisionSchema>;

export const PlanLimitsSchema = z.object({
  listings: z.number().int().positive().nullable(),
  socialTurnsPerMonth: z.number().int().positive().nullable(),
  voiceMinutesPerMonth: z.number().int().positive().nullable(),
  seats: z.number().int().positive().nullable(),
  autoSendAllowed: z.boolean(),
  fubSyncAllowed: z.boolean(),
  harwickBrandingOnOutbound: z.boolean(),
  workspaceMemoryEnabled: z.boolean(),
});

export type PlanLimits = z.infer<typeof PlanLimitsSchema>;

export const PLAN_LIMITS = {
  free: {
    listings: 3,
    socialTurnsPerMonth: 100,
    voiceMinutesPerMonth: 50,
    seats: 1,
    autoSendAllowed: false,
    fubSyncAllowed: false,
    harwickBrandingOnOutbound: true,
    workspaceMemoryEnabled: false,
  },
  solo: {
    listings: 10,
    socialTurnsPerMonth: 2000,
    voiceMinutesPerMonth: 500,
    seats: 2,
    autoSendAllowed: true,
    fubSyncAllowed: true,
    harwickBrandingOnOutbound: false,
    workspaceMemoryEnabled: true,
  },
  team: {
    listings: 50,
    socialTurnsPerMonth: 8000,
    voiceMinutesPerMonth: 2000,
    seats: 10,
    autoSendAllowed: true,
    fubSyncAllowed: true,
    harwickBrandingOnOutbound: false,
    workspaceMemoryEnabled: true,
  },
  brokerage: {
    listings: null,
    socialTurnsPerMonth: 25000,
    voiceMinutesPerMonth: 6000,
    seats: null,
    autoSendAllowed: true,
    fubSyncAllowed: true,
    harwickBrandingOnOutbound: false,
    workspaceMemoryEnabled: true,
  },
} as const satisfies Record<BillingPlanTier, PlanLimits>;

export function getPlanLimits(tier: BillingPlanTier): PlanLimits {
  return PLAN_LIMITS[tier];
}

const WALLET_MINIMUM_FUNDED_CENTS = 100;

const WALLET_OVERAGE_COSTS = {
  social_turn: { retailCents: 20, cogsCents: 4 },
  voice_minute: { retailCents: 100, cogsCents: 25 },
  memory_loop: { retailCents: 50, cogsCents: 10 },
  overage_listing: { retailCents: 500, cogsCents: 0 },
  overage_seat: { retailCents: 1500, cogsCents: 0 },
} as const satisfies Record<BillingWalletUsageEventType, { retailCents: number; cogsCents: number }>;

export function getWalletOverageCost(eventType: BillingWalletUsageEventType): { retailCents: number; cogsCents: number } {
  return WALLET_OVERAGE_COSTS[eventType];
}

function getPlanLimitForUsageEvent(
  tier: BillingPlanTier,
  eventType: BillingWalletUsageEventType,
): number | null {
  const limits = getPlanLimits(tier);
  if (eventType === "social_turn") return limits.socialTurnsPerMonth;
  if (eventType === "voice_minute") return limits.voiceMinutesPerMonth;
  if (eventType === "memory_loop") return limits.workspaceMemoryEnabled ? null : 0;
  if (eventType === "overage_listing") return limits.listings;
  return limits.seats;
}

export function evaluatePlanCapacity(params: {
  planTier: BillingPlanTier;
  eventType: BillingWalletUsageEventType;
  used: number;
  walletBalanceCents: number;
}): PlanCapacityDecision {
  const limit = getPlanLimitForUsageEvent(params.planTier, params.eventType);
  const cost = getWalletOverageCost(params.eventType);
  const normalized = {
    ...params,
    used: Math.max(0, params.used),
    walletBalanceCents: Math.max(0, params.walletBalanceCents),
  };

  if (limit === null || normalized.used < limit) {
    return PlanCapacityDecisionSchema.parse({
      status: "allow",
      planTier: normalized.planTier,
      eventType: normalized.eventType,
      limit,
      used: normalized.used,
      walletBalanceCents: normalized.walletBalanceCents,
      retailCents: 0,
      cogsCents: 0,
      reason: "plan capacity available.",
    });
  }

  if (limit === 0) {
    return PlanCapacityDecisionSchema.parse({
      status: "blocked_by_plan",
      planTier: normalized.planTier,
      eventType: normalized.eventType,
      limit,
      used: normalized.used,
      walletBalanceCents: normalized.walletBalanceCents,
      retailCents: 0,
      cogsCents: 0,
      reason: `${normalized.eventType} is not included on the ${normalized.planTier} plan.`,
    });
  }

  if (normalized.walletBalanceCents < WALLET_MINIMUM_FUNDED_CENTS || normalized.walletBalanceCents < cost.retailCents) {
    return PlanCapacityDecisionSchema.parse({
      status: "needs_wallet_funded",
      planTier: normalized.planTier,
      eventType: normalized.eventType,
      limit,
      used: normalized.used,
      walletBalanceCents: normalized.walletBalanceCents,
      retailCents: cost.retailCents,
      cogsCents: cost.cogsCents,
      reason: `${normalized.planTier} plan ${normalized.eventType} quota is exhausted and wallet balance is below the required funded balance.`,
    });
  }

  return PlanCapacityDecisionSchema.parse({
    status: "allow",
    planTier: normalized.planTier,
    eventType: normalized.eventType,
    limit,
    used: normalized.used,
    walletBalanceCents: normalized.walletBalanceCents,
    retailCents: cost.retailCents,
    cogsCents: cost.cogsCents,
    reason: "plan quota exhausted; usage will be billed from wallet.",
  });
}

type LegacyPlanCapabilities = {
  maxSeats: number | null;
  maxInstagramAccounts: number | null;
  maxFacebookAccounts: number | null;
  maxVoiceAgents: number | null;
  maxPhoneNumbers: number | null;
  maxListings: number | null;
  maxLeadEventsPerMonth: number | null;
  teamRouting: boolean;
  memberRouting: boolean;
  rainmakerAttribution: boolean;
  multiTeamStructure: boolean;
  advancedNurture: boolean;
  csvListingImport: boolean;
  brokerDashboard: boolean;
  dedicatedSupport: boolean;
} & PlanLimits;

export const planCapabilities = {
  free: {
    ...PLAN_LIMITS.free,
    maxSeats: PLAN_LIMITS.free.seats,
    maxInstagramAccounts: 1,
    maxFacebookAccounts: 1,
    maxVoiceAgents: 1,
    maxPhoneNumbers: 1,
    maxListings: PLAN_LIMITS.free.listings,
    maxLeadEventsPerMonth: PLAN_LIMITS.free.socialTurnsPerMonth,
    teamRouting: false,
    memberRouting: false,
    rainmakerAttribution: false,
    multiTeamStructure: false,
    advancedNurture: false,
    csvListingImport: false,
    brokerDashboard: false,
    dedicatedSupport: false,
  },
  solo: {
    ...PLAN_LIMITS.solo,
    maxSeats: PLAN_LIMITS.solo.seats,
    maxInstagramAccounts: 1,
    maxFacebookAccounts: 1,
    maxVoiceAgents: 1,
    maxPhoneNumbers: 1,
    maxListings: PLAN_LIMITS.solo.listings,
    maxLeadEventsPerMonth: PLAN_LIMITS.solo.socialTurnsPerMonth,
    teamRouting: false,
    memberRouting: false,
    rainmakerAttribution: false,
    multiTeamStructure: false,
    advancedNurture: false,
    csvListingImport: false,
    brokerDashboard: false,
    dedicatedSupport: false,
  },
  team: {
    ...PLAN_LIMITS.team,
    maxSeats: PLAN_LIMITS.team.seats,
    maxInstagramAccounts: 2,
    maxFacebookAccounts: 2,
    maxVoiceAgents: 2,
    maxPhoneNumbers: 2,
    maxListings: PLAN_LIMITS.team.listings,
    maxLeadEventsPerMonth: PLAN_LIMITS.team.socialTurnsPerMonth,
    teamRouting: true,
    memberRouting: true,
    rainmakerAttribution: true,
    multiTeamStructure: false,
    advancedNurture: true,
    csvListingImport: true,
    brokerDashboard: false,
    dedicatedSupport: false,
  },
  brokerage: {
    ...PLAN_LIMITS.brokerage,
    maxSeats: PLAN_LIMITS.brokerage.seats,
    maxInstagramAccounts: null,
    maxFacebookAccounts: null,
    maxVoiceAgents: null,
    maxPhoneNumbers: null,
    maxListings: PLAN_LIMITS.brokerage.listings,
    maxLeadEventsPerMonth: PLAN_LIMITS.brokerage.socialTurnsPerMonth,
    teamRouting: true,
    memberRouting: true,
    rainmakerAttribution: true,
    multiTeamStructure: true,
    advancedNurture: true,
    csvListingImport: true,
    brokerDashboard: true,
    dedicatedSupport: true,
  },
} as const satisfies Record<
  BillingPlanTier,
  LegacyPlanCapabilities
>;

export type PlanCapabilities = (typeof planCapabilities)[BillingPlanTier];

export function getPlanCapabilities(tier: BillingPlanTier): PlanCapabilities {
  return planCapabilities[tier];
}

export const PlanGateResultSchema = z.object({
  allowed: z.boolean(),
  reason: z.string().trim().min(1).max(200).nullable(),
  currentCount: z.number().int().nonnegative().nullable(),
  maxCount: z.number().int().nonnegative().nullable(),
});

export type PlanGateResult = z.infer<typeof PlanGateResultSchema>;

export const BillingCheckoutRequestSchema = z.object({
  planTier: BillingPaidPlanTierSchema,
  billingInterval: BillingIntervalSchema,
  returnPath: z.string().trim().regex(/^\/(?!\/)/).max(160).optional(),
});

export const BillingCheckoutResponseSchema = z.object({
  provider: z.literal("stripe"),
  providerSessionId: z.string().trim().min(1).max(200),
  checkoutUrl: z.string().trim().url(),
});

export const BillingPortalResponseSchema = z.object({
  provider: z.literal("stripe"),
  providerSessionId: z.string().trim().min(1).max(200),
  portalUrl: z.string().trim().url(),
});

export const BillingWalletTopUpRequestSchema = z.object({
  amountCents: z.number().int().min(500).max(500_000).default(5000),
  paymentMethodId: z.string().trim().min(1).max(200).optional(),
});

export const BillingWalletTopUpResponseSchema = z.object({
  provider: z.literal("stripe"),
  providerPaymentIntentId: z.string().trim().min(1).max(200),
  status: z.string().trim().min(1).max(80),
  amountCents: z.number().int().positive(),
  clientSecret: z.string().trim().min(1).max(500).nullable(),
});

export const BillingSubscriptionReconciliationSchema = z.object({
  workspaceId: UuidSchema,
  planTier: BillingPaidPlanTierSchema,
  billingInterval: BillingIntervalSchema,
  status: SubscriptionStatusSchema,
  providerSubscriptionId: z.string().trim().min(1).max(120),
  providerCustomerId: z.string().trim().min(1).max(120),
  currentPeriodStart: IsoDateTimeSchema,
  currentPeriodEnd: IsoDateTimeSchema,
  canceledAt: IsoDateTimeSchema.nullable(),
  cancelAtPeriodEnd: z.boolean(),
  trialStart: IsoDateTimeSchema.nullable(),
  trialEnd: IsoDateTimeSchema.nullable(),
});

export const BillingWebhookProcessResultSchema = z.object({
  accepted: z.boolean(),
  provider: z.literal("stripe"),
  eventId: z.string().trim().min(1).max(200),
  eventType: z.string().trim().min(1).max(120),
  status: z.enum(["processed", "ignored", "duplicate"]),
  workspaceId: UuidSchema.nullable(),
  reason: z.string().trim().min(1).max(160).nullable(),
});

export type BillingCheckoutRequest = z.infer<typeof BillingCheckoutRequestSchema>;
export type BillingCheckoutResponse = z.infer<typeof BillingCheckoutResponseSchema>;
export type BillingPortalResponse = z.infer<typeof BillingPortalResponseSchema>;
export type BillingWalletTopUpRequest = z.infer<typeof BillingWalletTopUpRequestSchema>;
export type BillingWalletTopUpResponse = z.infer<typeof BillingWalletTopUpResponseSchema>;
export type BillingSubscriptionReconciliation = z.infer<typeof BillingSubscriptionReconciliationSchema>;
export type BillingWebhookProcessResult = z.infer<typeof BillingWebhookProcessResultSchema>;

export function canAccessFeature(tier: BillingPlanTier, feature: keyof Omit<PlanCapabilities, "maxSeats" | "maxInstagramAccounts" | "maxFacebookAccounts" | "maxVoiceAgents" | "maxPhoneNumbers" | "maxListings" | "maxLeadEventsPerMonth">): boolean {
  const capabilities = getPlanCapabilities(tier);
  return Boolean(capabilities[feature]);
}

export function checkUsageLimit(
  tier: BillingPlanTier,
  limitKey: "maxSeats" | "maxInstagramAccounts" | "maxFacebookAccounts" | "maxVoiceAgents" | "maxPhoneNumbers" | "maxListings" | "maxLeadEventsPerMonth",
  currentCount: number
): PlanGateResult {
  const capabilities = getPlanCapabilities(tier);
  const maxCount = capabilities[limitKey];

  if (maxCount === null) {
    return { allowed: true, reason: null, currentCount, maxCount: null };
  }

  if (currentCount >= maxCount) {
    return {
      allowed: false,
      reason: `Plan limit reached: ${limitKey} is ${maxCount}, current usage is ${currentCount}`,
      currentCount,
      maxCount,
    };
  }

  return { allowed: true, reason: null, currentCount, maxCount };
}
