import { describe, expect, it } from "vitest";
import {
  BillingPlanTierSchema,
  SubscriptionStatusSchema,
  UsageEventTypeSchema,
  WorkspaceSubscriptionSchema,
  WorkspaceUsageEventSchema,
  WorkspaceUsageSummarySchema,
  getPlanCapabilities,
  canAccessFeature,
  checkUsageLimit,
  PlanGateResultSchema,
} from "./billing.js";

describe("BillingPlanTierSchema", () => {
  it("accepts valid plan tiers", () => {
    expect(BillingPlanTierSchema.parse("solo")).toBe("solo");
    expect(BillingPlanTierSchema.parse("team")).toBe("team");
    expect(BillingPlanTierSchema.parse("brokerage")).toBe("brokerage");
  });

  it("rejects invalid plan tiers", () => {
    expect(() => BillingPlanTierSchema.parse("enterprise")).toThrow();
    expect(() => BillingPlanTierSchema.parse("free")).toThrow();
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

describe("getPlanCapabilities", () => {
  it("returns correct capabilities for solo plan", () => {
    const capabilities = getPlanCapabilities("solo");
    expect(capabilities.maxSeats).toBe(1);
    expect(capabilities.maxLeadEventsPerMonth).toBe(200);
    expect(capabilities.teamRouting).toBe(false);
    expect(capabilities.memberRouting).toBe(false);
    expect(capabilities.advancedNurture).toBe(false);
  });

  it("returns correct capabilities for team plan", () => {
    const capabilities = getPlanCapabilities("team");
    expect(capabilities.maxSeats).toBe(5);
    expect(capabilities.maxLeadEventsPerMonth).toBe(500);
    expect(capabilities.teamRouting).toBe(true);
    expect(capabilities.memberRouting).toBe(true);
    expect(capabilities.advancedNurture).toBe(true);
    expect(capabilities.csvListingImport).toBe(true);
  });

  it("returns correct capabilities for brokerage plan", () => {
    const capabilities = getPlanCapabilities("brokerage");
    expect(capabilities.maxSeats).toBeNull();
    expect(capabilities.maxLeadEventsPerMonth).toBeNull();
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
    expect(result.maxCount).toBe(1);
  });

  it("blocks solo plan at seat limit", () => {
    const result = checkUsageLimit("solo", "maxSeats", 1);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("maxSeats is 1");
    expect(result.currentCount).toBe(1);
    expect(result.maxCount).toBe(1);
  });

  it("allows usage within team plan lead event limits", () => {
    const result = checkUsageLimit("team", "maxLeadEventsPerMonth", 350);
    expect(result.allowed).toBe(true);
    expect(result.currentCount).toBe(350);
    expect(result.maxCount).toBe(500);
  });

  it("blocks usage at team plan lead event limit", () => {
    const result = checkUsageLimit("team", "maxLeadEventsPerMonth", 500);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("maxLeadEventsPerMonth is 500");
    expect(result.currentCount).toBe(500);
    expect(result.maxCount).toBe(500);
  });

  it("always allows brokerage plan unlimited resources", () => {
    const seatResult = checkUsageLimit("brokerage", "maxSeats", 999);
    expect(seatResult.allowed).toBe(true);
    expect(seatResult.maxCount).toBeNull();

    const eventResult = checkUsageLimit("brokerage", "maxLeadEventsPerMonth", 10000);
    expect(eventResult.allowed).toBe(true);
    expect(eventResult.maxCount).toBeNull();
  });

  it("blocks solo plan from exceeding listing limit", () => {
    const result = checkUsageLimit("solo", "maxListings", 25);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("maxListings is 25");
  });

  it("allows team plan within listing limit", () => {
    const result = checkUsageLimit("team", "maxListings", 50);
    expect(result.allowed).toBe(true);
    expect(result.currentCount).toBe(50);
    expect(result.maxCount).toBe(100);
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
