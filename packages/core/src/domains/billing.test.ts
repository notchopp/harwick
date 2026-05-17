import { describe, expect, it } from "vitest";
import {
  PLAN_LIMITS,
  BillingPaidPlanTierSchema,
  BillingPlanTierSchema,
  SubscriptionStatusSchema,
  UsageEventTypeSchema,
  WorkspaceSubscriptionSchema,
  WorkspaceUsageEventSchema,
  WorkspaceUsageSummarySchema,
  getPlanCapabilities,
  getPlanLimits,
  canAccessFeature,
  checkUsageLimit,
  PlanGateResultSchema,
  BillingCheckoutRequestSchema,
  BillingCheckoutResponseSchema,
  BillingPortalResponseSchema,
  BillingSubscriptionReconciliationSchema,
  BillingUsageEventSchema,
  BillingWalletUsageEventTypeSchema,
  BillingWebhookProcessResultSchema,
  MonthlyUsageSummarySchema,
  WorkspaceUsageWalletSchema,
} from "./billing.js";

describe("BillingPlanTierSchema", () => {
  it("accepts valid plan tiers", () => {
    expect(BillingPlanTierSchema.parse("free")).toBe("free");
    expect(BillingPlanTierSchema.parse("solo")).toBe("solo");
    expect(BillingPlanTierSchema.parse("team")).toBe("team");
    expect(BillingPlanTierSchema.parse("brokerage")).toBe("brokerage");
  });

  it("rejects invalid plan tiers", () => {
    expect(() => BillingPlanTierSchema.parse("enterprise")).toThrow();
  });
});

describe("BillingPaidPlanTierSchema", () => {
  it("accepts only paid plan tiers", () => {
    expect(BillingPaidPlanTierSchema.parse("solo")).toBe("solo");
    expect(BillingPaidPlanTierSchema.parse("team")).toBe("team");
    expect(BillingPaidPlanTierSchema.parse("brokerage")).toBe("brokerage");
    expect(() => BillingPaidPlanTierSchema.parse("free")).toThrow();
  });
});

describe("SubscriptionStatusSchema", () => {
  it("accepts valid subscription statuses", () => {
    expect(SubscriptionStatusSchema.parse("active")).toBe("active");
    expect(SubscriptionStatusSchema.parse("trialing")).toBe("trialing");
    expect(SubscriptionStatusSchema.parse("past_due")).toBe("past_due");
    expect(SubscriptionStatusSchema.parse("canceled")).toBe("canceled");
  });

  it("rejects invalid statuses", () => {
    expect(() => SubscriptionStatusSchema.parse("unknown")).toThrow();
  });
});

describe("WorkspaceSubscriptionSchema", () => {
  it("accepts valid workspace subscription", () => {
    const sub = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      workspaceId: "550e8400-e29b-41d4-a716-446655440001",
      planTier: "team",
      billingInterval: "month",
      status: "active",
      providerSubscriptionId: "sub_1234567890",
      providerCustomerId: "cus_1234567890",
      currentPeriodStart: "2026-05-01T00:00:00Z",
      currentPeriodEnd: "2026-06-01T00:00:00Z",
      canceledAt: null,
      cancelAtPeriodEnd: false,
      trialStart: null,
      trialEnd: null,
      createdAt: "2026-05-01T00:00:00Z",
      updatedAt: "2026-05-01T00:00:00Z",
    };

    const result = WorkspaceSubscriptionSchema.parse(sub);
    expect(result.planTier).toBe("team");
    expect(result.status).toBe("active");
  });

  it("accepts trialing subscription with trial dates", () => {
    const sub = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      workspaceId: "550e8400-e29b-41d4-a716-446655440001",
      planTier: "solo",
      billingInterval: "month",
      status: "trialing",
      providerSubscriptionId: null,
      providerCustomerId: null,
      currentPeriodStart: "2026-05-01T00:00:00Z",
      currentPeriodEnd: "2026-06-01T00:00:00Z",
      canceledAt: null,
      cancelAtPeriodEnd: false,
      trialStart: "2026-05-01T00:00:00Z",
      trialEnd: "2026-05-15T00:00:00Z",
      createdAt: "2026-05-01T00:00:00Z",
      updatedAt: "2026-05-01T00:00:00Z",
    };

    const result = WorkspaceSubscriptionSchema.parse(sub);
    expect(result.status).toBe("trialing");
    expect(result.trialStart).toBe("2026-05-01T00:00:00Z");
  });
});

describe("UsageEventTypeSchema", () => {
  it("accepts valid usage event types", () => {
    expect(UsageEventTypeSchema.parse("lead_event")).toBe("lead_event");
    expect(UsageEventTypeSchema.parse("ai_turn")).toBe("ai_turn");
    expect(UsageEventTypeSchema.parse("ai_message_sent")).toBe("ai_message_sent");
    expect(UsageEventTypeSchema.parse("social_message_sent")).toBe("social_message_sent");
    expect(UsageEventTypeSchema.parse("voice_call_minute")).toBe("voice_call_minute");
    expect(UsageEventTypeSchema.parse("listing_created")).toBe("listing_created");
  });

  it("rejects invalid event types", () => {
    expect(() => UsageEventTypeSchema.parse("unknown_event")).toThrow();
  });
});

describe("WorkspaceUsageEventSchema", () => {
  it("accepts valid usage event", () => {
    const event = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      workspaceId: "550e8400-e29b-41d4-a716-446655440001",
      eventType: "lead_event",
      eventCount: 5,
      resourceId: "550e8400-e29b-41d4-a716-446655440002",
      eventMetadata: { source: "instagram_dm", leadId: "abc-123" },
      billingPeriodStart: "2026-05-01T00:00:00Z",
      billingPeriodEnd: "2026-06-01T00:00:00Z",
      createdAt: "2026-05-10T15:30:00Z",
    };

    const result = WorkspaceUsageEventSchema.parse(event);
    expect(result.eventType).toBe("lead_event");
    expect(result.eventCount).toBe(5);
  });

  it("rejects negative event count", () => {
    const event = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      workspaceId: "550e8400-e29b-41d4-a716-446655440001",
      eventType: "ai_turn",
      eventCount: -1,
      resourceId: null,
      eventMetadata: null,
      billingPeriodStart: "2026-05-01T00:00:00Z",
      billingPeriodEnd: "2026-06-01T00:00:00Z",
      createdAt: "2026-05-10T15:30:00Z",
    };

    expect(() => WorkspaceUsageEventSchema.parse(event)).toThrow();
  });
});

describe("WorkspaceUsageSummarySchema", () => {
  it("accepts valid usage summary", () => {
    const summary = {
      workspaceId: "550e8400-e29b-41d4-a716-446655440001",
      planTier: "team",
      billingPeriodStart: "2026-05-01T00:00:00Z",
      billingPeriodEnd: "2026-06-01T00:00:00Z",
      leadEventCount: 120,
      aiTurnCount: 340,
      aiMessageSentCount: 85,
      socialMessageSentCount: 45,
      voiceCallMinutes: 127.5,
      listingCount: 12,
      activeSeatCount: 3,
      activeIntegrationAccountCount: 4,
      createdAt: "2026-05-10T00:00:00Z",
      updatedAt: "2026-05-10T15:30:00Z",
    };

    const result = WorkspaceUsageSummarySchema.parse(summary);
    expect(result.leadEventCount).toBe(120);
    expect(result.activeSeatCount).toBe(3);
    expect(result.voiceCallMinutes).toBe(127.5);
  });

  it("rejects negative usage counts", () => {
    const summary = {
      workspaceId: "550e8400-e29b-41d4-a716-446655440001",
      planTier: "solo",
      billingPeriodStart: "2026-05-01T00:00:00Z",
      billingPeriodEnd: "2026-06-01T00:00:00Z",
      leadEventCount: -10,
      aiTurnCount: 0,
      aiMessageSentCount: 0,
      socialMessageSentCount: 0,
      voiceCallMinutes: 0,
      listingCount: 0,
      activeSeatCount: 1,
      activeIntegrationAccountCount: 1,
      createdAt: "2026-05-10T00:00:00Z",
      updatedAt: "2026-05-10T00:00:00Z",
    };

    expect(() => WorkspaceUsageSummarySchema.parse(summary)).toThrow();
  });
});

describe("billing wallet contracts", () => {
  it("validates wallet-backed usage event types", () => {
    expect(BillingWalletUsageEventTypeSchema.parse("social_turn")).toBe("social_turn");
    expect(BillingWalletUsageEventTypeSchema.parse("voice_minute")).toBe("voice_minute");
    expect(BillingWalletUsageEventTypeSchema.parse("memory_loop")).toBe("memory_loop");
    expect(() => BillingWalletUsageEventTypeSchema.parse("ai_turn")).toThrow();
  });

  it("validates workspace usage wallet rows", () => {
    const wallet = WorkspaceUsageWalletSchema.parse({
      workspaceId: "550e8400-e29b-41d4-a716-446655440001",
      balanceCents: 5000,
      autoRechargeEnabled: true,
      autoRechargeThresholdCents: 1000,
      autoRechargeAmountCents: 5000,
      stripePaymentMethodId: "pm_123",
      lastRechargeAt: "2026-05-17T12:00:00Z",
      lowBalanceNotifiedAt: null,
      updatedAt: "2026-05-17T12:00:00Z",
    });

    expect(wallet.balanceCents).toBe(5000);
    expect(wallet.autoRechargeEnabled).toBe(true);
  });

  it("rejects negative wallet balances", () => {
    expect(() => WorkspaceUsageWalletSchema.parse({
      workspaceId: "550e8400-e29b-41d4-a716-446655440001",
      balanceCents: -1,
      autoRechargeEnabled: false,
      autoRechargeThresholdCents: 1000,
      autoRechargeAmountCents: 5000,
      stripePaymentMethodId: null,
      lastRechargeAt: null,
      lowBalanceNotifiedAt: null,
      updatedAt: "2026-05-17T12:00:00Z",
    })).toThrow();
  });

  it("validates append-only usage ledger events", () => {
    const event = BillingUsageEventSchema.parse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      workspaceId: "550e8400-e29b-41d4-a716-446655440001",
      occurredAt: "2026-05-17T12:00:00Z",
      eventType: "social_turn",
      unitCount: 1,
      retailCents: 20,
      cogsCents: 4,
      balanceAfterCents: 4980,
      sourceId: "trajectory_123",
      idempotencyKey: "trajectory_123",
      eventMetadata: { model: "gpt-4.1-mini" },
      createdAt: "2026-05-17T12:00:00Z",
    });

    expect(event.eventType).toBe("social_turn");
    expect(event.balanceAfterCents).toBe(4980);
  });

  it("validates monthly usage summary rows", () => {
    const summary = MonthlyUsageSummarySchema.parse({
      workspaceId: "550e8400-e29b-41d4-a716-446655440001",
      month: "2026-05-01",
      turnsUsed: 12,
      minutesUsed: 3.5,
      memoryLoopsUsed: 2,
      overageListings: 0,
      overageSeats: 0,
      retailCents: 240,
      cogsCents: 48,
      balanceAfterCents: 4760,
    });

    expect(summary.month).toBe("2026-05-01");
    expect(summary.turnsUsed).toBe(12);
  });
});

describe("PLAN_LIMITS", () => {
  it("defines the free plan operating limits", () => {
    expect(PLAN_LIMITS.free).toEqual({
      listings: 3,
      socialTurnsPerMonth: 100,
      voiceMinutesPerMonth: 50,
      seats: 1,
      autoSendAllowed: false,
      fubSyncAllowed: false,
      harwickBrandingOnOutbound: true,
      workspaceMemoryEnabled: false,
    });
  });

  it("defines paid plan capacity from one source of truth", () => {
    expect(getPlanLimits("solo")).toMatchObject({
      listings: 10,
      socialTurnsPerMonth: 2000,
      voiceMinutesPerMonth: 500,
      seats: 2,
    });
    expect(getPlanLimits("team")).toMatchObject({
      listings: 50,
      socialTurnsPerMonth: 8000,
      voiceMinutesPerMonth: 2000,
      seats: 10,
    });
    expect(getPlanLimits("brokerage")).toMatchObject({
      listings: null,
      socialTurnsPerMonth: 25000,
      voiceMinutesPerMonth: 6000,
      seats: null,
    });
  });
});

describe("getPlanCapabilities", () => {
  it("returns correct capabilities for free plan", () => {
    const capabilities = getPlanCapabilities("free");
    expect(capabilities.maxSeats).toBe(1);
    expect(capabilities.maxListings).toBe(3);
    expect(capabilities.maxLeadEventsPerMonth).toBe(100);
    expect(capabilities.autoSendAllowed).toBe(false);
    expect(capabilities.fubSyncAllowed).toBe(false);
    expect(capabilities.harwickBrandingOnOutbound).toBe(true);
  });

  it("returns correct capabilities for solo plan", () => {
    const capabilities = getPlanCapabilities("solo");
    expect(capabilities.maxSeats).toBe(2);
    expect(capabilities.maxListings).toBe(10);
    expect(capabilities.maxLeadEventsPerMonth).toBe(2000);
    expect(capabilities.teamRouting).toBe(false);
    expect(capabilities.memberRouting).toBe(false);
    expect(capabilities.advancedNurture).toBe(false);
    expect(capabilities.autoSendAllowed).toBe(true);
    expect(capabilities.fubSyncAllowed).toBe(true);
  });

  it("returns correct capabilities for team plan", () => {
    const capabilities = getPlanCapabilities("team");
    expect(capabilities.maxSeats).toBe(10);
    expect(capabilities.maxListings).toBe(50);
    expect(capabilities.maxLeadEventsPerMonth).toBe(8000);
    expect(capabilities.teamRouting).toBe(true);
    expect(capabilities.memberRouting).toBe(true);
    expect(capabilities.advancedNurture).toBe(true);
    expect(capabilities.csvListingImport).toBe(true);
  });

  it("returns correct capabilities for brokerage plan", () => {
    const capabilities = getPlanCapabilities("brokerage");
    expect(capabilities.maxSeats).toBeNull();
    expect(capabilities.maxListings).toBeNull();
    expect(capabilities.maxLeadEventsPerMonth).toBe(25000);
    expect(capabilities.voiceMinutesPerMonth).toBe(6000);
    expect(capabilities.teamRouting).toBe(true);
    expect(capabilities.multiTeamStructure).toBe(true);
    expect(capabilities.brokerDashboard).toBe(true);
    expect(capabilities.dedicatedSupport).toBe(true);
  });
});

describe("canAccessFeature", () => {
  it("solo plan cannot access team routing", () => {
    expect(canAccessFeature("solo", "teamRouting")).toBe(false);
  });

  it("team plan can access team routing", () => {
    expect(canAccessFeature("team", "teamRouting")).toBe(true);
  });

  it("solo plan cannot access advanced nurture", () => {
    expect(canAccessFeature("solo", "advancedNurture")).toBe(false);
  });

  it("brokerage plan can access all features", () => {
    expect(canAccessFeature("brokerage", "teamRouting")).toBe(true);
    expect(canAccessFeature("brokerage", "memberRouting")).toBe(true);
    expect(canAccessFeature("brokerage", "multiTeamStructure")).toBe(true);
    expect(canAccessFeature("brokerage", "brokerDashboard")).toBe(true);
  });
});

describe("checkUsageLimit", () => {
  it("allows usage within solo plan limits", () => {
    const result = checkUsageLimit("solo", "maxSeats", 0);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.currentCount).toBe(0);
    expect(result.maxCount).toBe(2);
  });

  it("blocks solo plan at seat limit", () => {
    const result = checkUsageLimit("solo", "maxSeats", 2);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("maxSeats is 2");
    expect(result.currentCount).toBe(2);
    expect(result.maxCount).toBe(2);
  });

  it("allows usage within team plan lead event limits", () => {
    const result = checkUsageLimit("team", "maxLeadEventsPerMonth", 350);
    expect(result.allowed).toBe(true);
    expect(result.currentCount).toBe(350);
    expect(result.maxCount).toBe(8000);
  });

  it("blocks usage at team plan lead event limit", () => {
    const result = checkUsageLimit("team", "maxLeadEventsPerMonth", 8000);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("maxLeadEventsPerMonth is 8000");
    expect(result.currentCount).toBe(8000);
    expect(result.maxCount).toBe(8000);
  });

  it("allows brokerage plan unlimited seat and listing resources", () => {
    const seatResult = checkUsageLimit("brokerage", "maxSeats", 999);
    expect(seatResult.allowed).toBe(true);
    expect(seatResult.maxCount).toBeNull();

    const listingResult = checkUsageLimit("brokerage", "maxListings", 10000);
    expect(listingResult.allowed).toBe(true);
    expect(listingResult.maxCount).toBeNull();
  });

  it("blocks solo plan from exceeding listing limit", () => {
    const result = checkUsageLimit("solo", "maxListings", 10);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("maxListings is 10");
  });

  it("allows team plan within listing limit", () => {
    const result = checkUsageLimit("team", "maxListings", 49);
    expect(result.allowed).toBe(true);
    expect(result.currentCount).toBe(49);
    expect(result.maxCount).toBe(50);
  });
});

describe("PlanGateResultSchema", () => {
  it("accepts valid gate result with block reason", () => {
    const gateResult = {
      allowed: false,
      reason: "Plan limit reached for seats",
      currentCount: 5,
      maxCount: 5,
    };

    const result = PlanGateResultSchema.parse(gateResult);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("Plan limit reached for seats");
  });

  it("accepts valid gate result allowing access", () => {
    const gateResult = {
      allowed: true,
      reason: null,
      currentCount: 3,
      maxCount: 5,
    };

    const result = PlanGateResultSchema.parse(gateResult);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeNull();
  });
});

describe("billing checkout contracts", () => {
  it("validates a checkout request", () => {
    const request = BillingCheckoutRequestSchema.parse({
      planTier: "team",
      billingInterval: "month",
    });

    expect(request.planTier).toBe("team");
  });

  it("does not allow a free plan through Stripe checkout", () => {
    expect(() => BillingCheckoutRequestSchema.parse({
      planTier: "free",
      billingInterval: "month",
    })).toThrow();
  });

  it("validates a Stripe checkout response without leaking secrets", () => {
    const response = BillingCheckoutResponseSchema.parse({
      provider: "stripe",
      providerSessionId: "cs_test_123",
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_123",
    });

    expect(response.providerSessionId).toBe("cs_test_123");
  });

  it("validates a Stripe customer portal response", () => {
    const response = BillingPortalResponseSchema.parse({
      provider: "stripe",
      providerSessionId: "bps_123",
      portalUrl: "https://billing.stripe.com/p/session/bps_123",
    });

    expect(response.portalUrl).toContain("billing.stripe.com");
  });
});

describe("billing webhook reconciliation contracts", () => {
  it("validates provider subscription updates before persistence", () => {
    const update = BillingSubscriptionReconciliationSchema.parse({
      workspaceId: "123e4567-e89b-12d3-a456-426614174000",
      planTier: "team",
      billingInterval: "month",
      status: "active",
      providerSubscriptionId: "sub_123",
      providerCustomerId: "cus_123",
      currentPeriodStart: "2026-05-01T00:00:00.000Z",
      currentPeriodEnd: "2026-06-01T00:00:00.000Z",
      canceledAt: null,
      cancelAtPeriodEnd: false,
      trialStart: null,
      trialEnd: null,
    });

    expect(update.providerSubscriptionId).toBe("sub_123");
  });

  it("does not reconcile free plans as provider subscriptions", () => {
    expect(() => BillingSubscriptionReconciliationSchema.parse({
      workspaceId: "123e4567-e89b-12d3-a456-426614174000",
      planTier: "free",
      billingInterval: "month",
      status: "active",
      providerSubscriptionId: "sub_123",
      providerCustomerId: "cus_123",
      currentPeriodStart: "2026-05-01T00:00:00.000Z",
      currentPeriodEnd: "2026-06-01T00:00:00.000Z",
      canceledAt: null,
      cancelAtPeriodEnd: false,
      trialStart: null,
      trialEnd: null,
    })).toThrow();
  });

  it("validates webhook process results without provider secrets", () => {
    const result = BillingWebhookProcessResultSchema.parse({
      accepted: true,
      provider: "stripe",
      eventId: "evt_123",
      eventType: "customer.subscription.updated",
      status: "processed",
      workspaceId: "123e4567-e89b-12d3-a456-426614174000",
      reason: null,
    });

    expect(result.status).toBe("processed");
  });
});
