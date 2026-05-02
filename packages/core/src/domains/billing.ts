import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "./common.js";

export const BillingPlanTierSchema = z.enum(["solo", "team", "brokerage"]);

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
  planTier: BillingPlanTierSchema,
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

export type BillingPlanTier = z.infer<typeof BillingPlanTierSchema>;
export type BillingInterval = z.infer<typeof BillingIntervalSchema>;
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;
export type WorkspaceSubscription = z.infer<typeof WorkspaceSubscriptionSchema>;
export type UsageEventType = z.infer<typeof UsageEventTypeSchema>;
export type WorkspaceUsageEvent = z.infer<typeof WorkspaceUsageEventSchema>;
export type WorkspaceUsageSummary = z.infer<typeof WorkspaceUsageSummarySchema>;

export const planCapabilities = {
  solo: {
    maxSeats: 1,
    maxInstagramAccounts: 1,
    maxFacebookAccounts: 1,
    maxVoiceAgents: 1,
    maxPhoneNumbers: 1,
    maxListings: 25,
    maxLeadEventsPerMonth: 200,
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
    maxSeats: 5,
    maxInstagramAccounts: 2,
    maxFacebookAccounts: 2,
    maxVoiceAgents: 2,
    maxPhoneNumbers: 2,
    maxListings: 100,
    maxLeadEventsPerMonth: 500,
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
    maxSeats: null,
    maxInstagramAccounts: null,
    maxFacebookAccounts: null,
    maxVoiceAgents: null,
    maxPhoneNumbers: null,
    maxListings: null,
    maxLeadEventsPerMonth: null,
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
  {
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
  }
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
