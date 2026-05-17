import { describe, expect, it } from "vitest";
import type { RealtyOpsSupabaseClient } from "./server-client";
import {
  getWorkspaceSubscription,
  getCurrentUsageSummary,
  checkSeatLimit,
  checkListingLimit,
  checkIntegrationAccountLimit,
  canAccessPlanFeature,
  recordUsageEvent,
  recordBillingUsageEvent,
  recordCurrentPeriodUsageEvent,
  upsertWorkspaceSubscriptionFromProvider,
  claimBillingWebhookEvent,
  completeBillingWebhookEvent,
} from "./billing.js";
import type { WorkspaceSubscriptionRow, WorkspaceUsageSummaryRow } from "./database.types";

describe("billing service", () => {
  describe("getWorkspaceSubscription", () => {
    it("should return null for workspace without subscription", async () => {
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        }),
      } as unknown as RealtyOpsSupabaseClient;

      const result = await getWorkspaceSubscription(mockSupabase, "workspace-123");
      expect(result).toBeNull();
    });

    it("should throw on database error", async () => {
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: { message: "DB error" } }),
            }),
          }),
        }),
      } as unknown as RealtyOpsSupabaseClient;

      await expect(getWorkspaceSubscription(mockSupabase, "workspace-123")).rejects.toThrow(
        "Failed to fetch workspace subscription: DB error"
      );
    });

    it("should map database row to WorkspaceSubscription", async () => {
      const mockData: WorkspaceSubscriptionRow = {
        id: "sub-123",
        workspace_id: "workspace-123",
        plan_tier: "team",
        billing_interval: "month",
        status: "active",
        provider_subscription_id: "stripe-sub-123",
        provider_customer_id: "stripe-cus-123",
        current_period_start: "2026-05-01T00:00:00Z",
        current_period_end: "2026-06-01T00:00:00Z",
        canceled_at: null,
        cancel_at_period_end: false,
        trial_start: null,
        trial_end: null,
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-01T00:00:00Z",
      };

      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: mockData, error: null }),
            }),
          }),
        }),
      } as unknown as RealtyOpsSupabaseClient;

      const result = await getWorkspaceSubscription(mockSupabase, "workspace-123");
      expect(result).toEqual({
        id: "sub-123",
        workspaceId: "workspace-123",
        planTier: "team",
        billingInterval: "month",
        status: "active",
        providerSubscriptionId: "stripe-sub-123",
        providerCustomerId: "stripe-cus-123",
        currentPeriodStart: "2026-05-01T00:00:00Z",
        currentPeriodEnd: "2026-06-01T00:00:00Z",
        canceledAt: null,
        cancelAtPeriodEnd: false,
        trialStart: null,
        trialEnd: null,
        createdAt: "2026-05-01T00:00:00Z",
        updatedAt: "2026-05-01T00:00:00Z",
      });
    });
  });

  describe("getCurrentUsageSummary", () => {
    it("should return null for period without summary", async () => {
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
        }),
      } as unknown as RealtyOpsSupabaseClient;

      const result = await getCurrentUsageSummary(
        mockSupabase,
        "workspace-123",
        "2026-05-01T00:00:00Z"
      );
      expect(result).toBeNull();
    });

    it("should map database row to WorkspaceUsageSummary", async () => {
      const mockData: WorkspaceUsageSummaryRow = {
        workspace_id: "workspace-123",
        plan_tier: "team",
        billing_period_start: "2026-05-01T00:00:00Z",
        billing_period_end: "2026-06-01T00:00:00Z",
        lead_event_count: 120,
        ai_turn_count: 340,
        ai_message_sent_count: 85,
        social_message_sent_count: 45,
        voice_call_minutes: 127.5,
        listing_count: 12,
        active_seat_count: 3,
        active_integration_account_count: 4,
        created_at: "2026-05-10T00:00:00Z",
        updated_at: "2026-05-10T15:30:00Z",
      };

      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: mockData, error: null }),
              }),
            }),
          }),
        }),
      } as unknown as RealtyOpsSupabaseClient;

      const result = await getCurrentUsageSummary(
        mockSupabase,
        "workspace-123",
        "2026-05-01T00:00:00Z"
      );
      expect(result).toEqual({
        workspaceId: "workspace-123",
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
      });
    });
  });

  describe("checkSeatLimit", () => {
    it("should block when no subscription exists", async () => {
      const mockSupabase = {
        from: (table: string) => {
          if (table === "workspace_subscriptions") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({ data: null, error: null }),
                }),
              }),
            };
          }
          return {};
        },
      } as unknown as RealtyOpsSupabaseClient;

      const result = await checkSeatLimit(mockSupabase, "workspace-123");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("No active subscription");
    });

    it("should allow solo plan with seats under the plan limit", async () => {
      const mockSupabase = {
        from: (table: string) => {
          if (table === "workspace_subscriptions") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({
                    data: {
                      id: "sub-123",
                      workspace_id: "workspace-123",
                      plan_tier: "solo",
                      billing_interval: "month",
                      status: "active",
                      provider_subscription_id: null,
                      provider_customer_id: null,
                      current_period_start: "2026-05-01T00:00:00Z",
                      current_period_end: "2026-06-01T00:00:00Z",
                      canceled_at: null,
                      cancel_at_period_end: false,
                      trial_start: null,
                      trial_end: null,
                      created_at: "2026-05-01T00:00:00Z",
                      updated_at: "2026-05-01T00:00:00Z",
                    },
                    error: null,
                  }),
                }),
              }),
            };
          } else if (table === "workspace_members") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => Promise.resolve({ count: 0, error: null }),
                }),
              }),
            };
          }
          return {};
        },
      } as unknown as RealtyOpsSupabaseClient;

      const result = await checkSeatLimit(mockSupabase, "workspace-123");
      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(0);
      expect(result.maxCount).toBe(2);
    });

    it("should block solo plan from exceeding the seat limit", async () => {
      const mockSupabase = {
        from: (table: string) => {
          if (table === "workspace_subscriptions") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({
                    data: {
                      id: "sub-123",
                      workspace_id: "workspace-123",
                      plan_tier: "solo",
                      billing_interval: "month",
                      status: "active",
                      provider_subscription_id: null,
                      provider_customer_id: null,
                      current_period_start: "2026-05-01T00:00:00Z",
                      current_period_end: "2026-06-01T00:00:00Z",
                      canceled_at: null,
                      cancel_at_period_end: false,
                      trial_start: null,
                      trial_end: null,
                      created_at: "2026-05-01T00:00:00Z",
                      updated_at: "2026-05-01T00:00:00Z",
                    },
                    error: null,
                  }),
                }),
              }),
            };
          } else if (table === "workspace_members") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => Promise.resolve({ count: 2, error: null }),
                }),
              }),
            };
          }
          return {};
        },
      } as unknown as RealtyOpsSupabaseClient;

      const result = await checkSeatLimit(mockSupabase, "workspace-123");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("maxSeats is 2");
      expect(result.currentCount).toBe(2);
      expect(result.maxCount).toBe(2);
    });
  });

  describe("checkListingLimit", () => {
    it("counts active listing facts and blocks when the plan limit is reached", async () => {
      const mockSupabase = {
        from: (table: string) => {
          if (table === "workspace_subscriptions") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({
                    data: {
                      id: "sub-123",
                      workspace_id: "workspace-123",
                      plan_tier: "solo",
                      billing_interval: "month",
                      status: "active",
                      provider_subscription_id: null,
                      provider_customer_id: null,
                      current_period_start: "2026-05-01T00:00:00Z",
                      current_period_end: "2026-06-01T00:00:00Z",
                      canceled_at: null,
                      cancel_at_period_end: false,
                      trial_start: null,
                      trial_end: null,
                      created_at: "2026-05-01T00:00:00Z",
                      updated_at: "2026-05-01T00:00:00Z",
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }

          if (table === "listing_facts") {
            return {
              select: () => ({
                eq: () => ({
                  neq: () => ({
                    then: (resolve: (value: { count: number; error: null }) => unknown) =>
                      Promise.resolve(resolve({ count: 25, error: null })),
                  }),
                }),
              }),
            };
          }

          return {};
        },
      };

      const result = await checkListingLimit(mockSupabase as unknown as RealtyOpsSupabaseClient, "workspace-123");
      expect(result.allowed).toBe(false);
      expect(result.currentCount).toBe(25);
      expect(result.maxCount).toBe(10);
    });
  });

  describe("checkIntegrationAccountLimit", () => {
    it("counts connected and pending Meta accounts against the plan limit", async () => {
      const mockSupabase = {
        from: (table: string) => {
          if (table === "workspace_subscriptions") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({
                    data: {
                      id: "sub-123",
                      workspace_id: "workspace-123",
                      plan_tier: "team",
                      billing_interval: "month",
                      status: "active",
                      provider_subscription_id: null,
                      provider_customer_id: null,
                      current_period_start: "2026-05-01T00:00:00Z",
                      current_period_end: "2026-06-01T00:00:00Z",
                      canceled_at: null,
                      cancel_at_period_end: false,
                      trial_start: null,
                      trial_end: null,
                      created_at: "2026-05-01T00:00:00Z",
                      updated_at: "2026-05-01T00:00:00Z",
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }

          if (table === "integration_accounts") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    in: () => ({
                      then: (resolve: (value: { count: number; error: null }) => unknown) =>
                        Promise.resolve(resolve({ count: 2, error: null })),
                    }),
                  }),
                }),
              }),
            };
          }

          return {};
        },
      };

      const result = await checkIntegrationAccountLimit(mockSupabase as unknown as RealtyOpsSupabaseClient, "workspace-123", "meta");
      expect(result.allowed).toBe(false);
      expect(result.currentCount).toBe(2);
      expect(result.maxCount).toBe(2);
    });
  });

  describe("canAccessPlanFeature", () => {
    it("should return false when no subscription exists", async () => {
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        }),
      };

      const result = await canAccessPlanFeature(mockSupabase as unknown as RealtyOpsSupabaseClient, "workspace-123", "teamRouting");
      expect(result).toBe(false);
    });

    it("should return false for solo plan attempting team routing", async () => {
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({
                data: {
                  id: "sub-123",
                  workspace_id: "workspace-123",
                  plan_tier: "solo",
                  billing_interval: "month",
                  status: "active",
                  provider_subscription_id: null,
                  provider_customer_id: null,
                  current_period_start: "2026-05-01T00:00:00Z",
                  current_period_end: "2026-06-01T00:00:00Z",
                  canceled_at: null,
                  cancel_at_period_end: false,
                  trial_start: null,
                  trial_end: null,
                  created_at: "2026-05-01T00:00:00Z",
                  updated_at: "2026-05-01T00:00:00Z",
                },
                error: null,
              }),
            }),
          }),
        }),
      };

      const result = await canAccessPlanFeature(mockSupabase as unknown as RealtyOpsSupabaseClient, "workspace-123", "teamRouting");
      expect(result).toBe(false);
    });

    it("should return true for team plan accessing team routing", async () => {
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({
                data: {
                  id: "sub-123",
                  workspace_id: "workspace-123",
                  plan_tier: "team",
                  billing_interval: "month",
                  status: "active",
                  provider_subscription_id: null,
                  provider_customer_id: null,
                  current_period_start: "2026-05-01T00:00:00Z",
                  current_period_end: "2026-06-01T00:00:00Z",
                  canceled_at: null,
                  cancel_at_period_end: false,
                  trial_start: null,
                  trial_end: null,
                  created_at: "2026-05-01T00:00:00Z",
                  updated_at: "2026-05-01T00:00:00Z",
                },
                error: null,
              }),
            }),
          }),
        }),
      } as unknown as RealtyOpsSupabaseClient;

      const result = await canAccessPlanFeature(mockSupabase, "workspace-123", "teamRouting");
      expect(result).toBe(true);
    });
  });

  describe("recordUsageEvent", () => {
    it("should insert usage event successfully", async () => {
      let insertedData: Record<string, unknown>[] | null = null;

      const mockSupabase = {
        from: () => ({
          insert: (data: Record<string, unknown>[]) =>
            Promise.resolve({ error: null }).then(() => {
              insertedData = data;
              return { error: null };
            }),
        }),
      } as unknown as RealtyOpsSupabaseClient;

      await recordUsageEvent(
        mockSupabase,
        "workspace-123",
        "lead_event",
        5,
        "2026-05-01T00:00:00Z",
        "2026-06-01T00:00:00Z",
        "lead-456",
        { source: "instagram_dm" }
      );

      expect(insertedData).toEqual([{
        workspace_id: "workspace-123",
        event_type: "lead_event",
        event_count: 5,
        resource_id: "lead-456",
        event_metadata: { source: "instagram_dm" },
        billing_period_start: "2026-05-01T00:00:00Z",
        billing_period_end: "2026-06-01T00:00:00Z",
      }]);
    });

    it("should throw on database error", async () => {
      const mockSupabase = {
        from: () => ({
          insert: () => Promise.resolve({ error: { message: "Insert failed" } }),
        }),
      } as unknown as RealtyOpsSupabaseClient;

      await expect(
        recordUsageEvent(
          mockSupabase,
          "workspace-123",
          "ai_turn",
          1,
          "2026-05-01T00:00:00Z",
          "2026-06-01T00:00:00Z"
        )
      ).rejects.toThrow("Failed to record usage event: Insert failed");
    });
  });

  describe("recordCurrentPeriodUsageEvent", () => {
    it("records usage against the active subscription period", async () => {
      let insertedData: Record<string, unknown>[] | null = null;

      const mockSupabase = {
        from: (table: string) => {
          if (table === "workspace_subscriptions") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({
                    data: {
                      id: "sub-123",
                      workspace_id: "workspace-123",
                      plan_tier: "team",
                      billing_interval: "month",
                      status: "active",
                      provider_subscription_id: "sub_123",
                      provider_customer_id: "cus_123",
                      current_period_start: "2026-05-01T00:00:00Z",
                      current_period_end: "2026-06-01T00:00:00Z",
                      canceled_at: null,
                      cancel_at_period_end: false,
                      trial_start: null,
                      trial_end: null,
                      created_at: "2026-05-01T00:00:00Z",
                      updated_at: "2026-05-01T00:00:00Z",
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }

          expect(table).toBe("workspace_usage_events");
          return {
            insert: (data: Record<string, unknown>[]) => {
              insertedData = data;
              return Promise.resolve({ error: null });
            },
          };
        },
      } as unknown as RealtyOpsSupabaseClient;

      await expect(recordCurrentPeriodUsageEvent(mockSupabase, {
        workspaceId: "workspace-123",
        eventType: "ai_turn",
        resourceId: "123e4567-e89b-12d3-a456-426614174099",
        eventMetadata: { channel: "instagram_dm" },
      })).resolves.toBe(true);

      expect(insertedData).toEqual([{
        workspace_id: "workspace-123",
        event_type: "ai_turn",
        event_count: 1,
        resource_id: "123e4567-e89b-12d3-a456-426614174099",
        event_metadata: { channel: "instagram_dm" },
        billing_period_start: "2026-05-01T00:00:00Z",
        billing_period_end: "2026-06-01T00:00:00Z",
      }]);
    });

    it("skips usage recording when no active billing period exists", async () => {
      const mockSupabase = {
        from: (table: string) => {
          expect(table).toBe("workspace_subscriptions");
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          };
        },
      } as unknown as RealtyOpsSupabaseClient;

      await expect(recordCurrentPeriodUsageEvent(mockSupabase, {
        workspaceId: "workspace-123",
        eventType: "lead_event",
      })).resolves.toBe(false);
    });
  });

  describe("recordBillingUsageEvent", () => {
    it("records wallet-backed usage with an idempotency key", async () => {
      let insertedData: Record<string, unknown> | null = null;

      const mockSupabase = {
        from: (table: string) => {
          if (table === "workspace_usage_wallet") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({
                    data: {
                      workspace_id: "workspace-123",
                      balance_cents: 5000,
                      auto_recharge_enabled: false,
                      auto_recharge_threshold_cents: 1000,
                      auto_recharge_amount_cents: 5000,
                      stripe_payment_method_id: null,
                      last_recharge_at: null,
                      low_balance_notified_at: null,
                      updated_at: "2026-05-17T12:00:00Z",
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }

          expect(table).toBe("usage_events");
          return {
            insert: (data: Record<string, unknown>) => {
              insertedData = data;
              return Promise.resolve({ error: null });
            },
          };
        },
      } as unknown as RealtyOpsSupabaseClient;

      await expect(recordBillingUsageEvent(mockSupabase, {
        workspaceId: "workspace-123",
        eventType: "social_turn",
        sourceId: "trajectory-123",
        idempotencyKey: "harwick_trajectory:trajectory-123",
        eventMetadata: { channel: "instagram_dm" },
      })).resolves.toBe(true);

      expect(insertedData).toEqual({
        workspace_id: "workspace-123",
        event_type: "social_turn",
        unit_count: 1,
        retail_cents: 0,
        cogs_cents: 0,
        balance_after_cents: 5000,
        source_id: "trajectory-123",
        idempotency_key: "harwick_trajectory:trajectory-123",
        event_metadata: { channel: "instagram_dm" },
      });
    });

    it("treats duplicate wallet usage events as already recorded", async () => {
      const mockSupabase = {
        from: (table: string) => {
          if (table === "workspace_usage_wallet") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({ data: null, error: null }),
                }),
              }),
            };
          }

          return {
            insert: () => Promise.resolve({ error: { code: "23505", message: "duplicate key" } }),
          };
        },
      } as unknown as RealtyOpsSupabaseClient;

      await expect(recordBillingUsageEvent(mockSupabase, {
        workspaceId: "workspace-123",
        eventType: "voice_minute",
        unitCount: 2,
        sourceId: "call-123",
        idempotencyKey: "retell_call:call-123",
      })).resolves.toBe(false);
    });
  });

  describe("provider subscription reconciliation", () => {
    it("upserts the Stripe subscription by workspace id", async () => {
      let upserted: Record<string, unknown> | null = null;
      let onConflict: string | undefined;

      const mockSupabase = {
        from: (table: string) => {
          expect(table).toBe("workspace_subscriptions");
          return {
            upsert: (row: Record<string, unknown>, options: { onConflict: string }) => {
              upserted = row;
              onConflict = options.onConflict;
              return {
                select: () => ({
                  single: () => Promise.resolve({
                    data: {
                      id: "sub-row-123",
                      workspace_id: "123e4567-e89b-12d3-a456-426614174000",
                      plan_tier: "team",
                      billing_interval: "month",
                      status: "active",
                      provider_subscription_id: "sub_123",
                      provider_customer_id: "cus_123",
                      current_period_start: "2026-01-01T00:00:00.000Z",
                      current_period_end: "2026-02-01T00:00:00.000Z",
                      canceled_at: null,
                      cancel_at_period_end: false,
                      trial_start: null,
                      trial_end: null,
                      created_at: "2026-01-01T00:00:00.000Z",
                      updated_at: "2026-01-01T00:00:00.000Z",
                    },
                    error: null,
                  }),
                }),
              };
            },
          };
        },
      } as unknown as RealtyOpsSupabaseClient;

      const result = await upsertWorkspaceSubscriptionFromProvider(mockSupabase, {
        workspaceId: "123e4567-e89b-12d3-a456-426614174000",
        planTier: "team",
        billingInterval: "month",
        status: "active",
        providerSubscriptionId: "sub_123",
        providerCustomerId: "cus_123",
        currentPeriodStart: "2026-01-01T00:00:00.000Z",
        currentPeriodEnd: "2026-02-01T00:00:00.000Z",
        canceledAt: null,
        cancelAtPeriodEnd: false,
        trialStart: null,
        trialEnd: null,
      });

      expect(onConflict).toBe("workspace_id");
      expect(upserted).toMatchObject({
        workspace_id: "123e4567-e89b-12d3-a456-426614174000",
        provider_subscription_id: "sub_123",
        provider_customer_id: "cus_123",
      });
      expect(result.providerSubscriptionId).toBe("sub_123");
    });
  });

  describe("billing webhook event ledger", () => {
    it("claims a new provider event", async () => {
      let inserted: Record<string, unknown> | null = null;
      const mockSupabase = {
        from: (table: string) => {
          expect(table).toBe("billing_webhook_events");
          return {
            insert: (row: Record<string, unknown>) => {
              inserted = row;
              return {
                select: () => ({
                  single: () => Promise.resolve({
                    data: {
                      id: "ledger-123",
                      workspace_id: null,
                      provider: "stripe",
                      provider_event_id: "evt_123",
                      event_type: "customer.subscription.updated",
                      provider_object_id: "sub_123",
                      processing_status: "processing",
                      error_message: null,
                      processed_at: null,
                      created_at: "2026-01-01T00:00:00.000Z",
                    },
                    error: null,
                  }),
                }),
              };
            },
          };
        },
      } as unknown as RealtyOpsSupabaseClient;

      const result = await claimBillingWebhookEvent(mockSupabase, {
        provider: "stripe",
        providerEventId: "evt_123",
        eventType: "customer.subscription.updated",
        providerObjectId: "sub_123",
      });

      expect(result.claimed).toBe(true);
      expect(inserted).toMatchObject({
        provider: "stripe",
        provider_event_id: "evt_123",
        processing_status: "processing",
      });
    });

    it("treats unique constraint errors as duplicate events", async () => {
      const mockSupabase = {
        from: () => ({
          insert: () => ({
            select: () => ({
              single: () => Promise.resolve({
                data: null,
                error: { code: "23505", message: "duplicate key" },
              }),
            }),
          }),
        }),
      } as unknown as RealtyOpsSupabaseClient;

      const result = await claimBillingWebhookEvent(mockSupabase, {
        provider: "stripe",
        providerEventId: "evt_123",
        eventType: "customer.subscription.updated",
        providerObjectId: "sub_123",
      });

      expect(result).toEqual({ claimed: false, reason: "duplicate" });
    });

    it("marks a claimed event complete", async () => {
      let update: Record<string, unknown> | null = null;
      let id: string | null = null;
      const mockSupabase = {
        from: (table: string) => {
          expect(table).toBe("billing_webhook_events");
          return {
            update: (row: Record<string, unknown>) => {
              update = row;
              return {
                eq: (column: string, value: string) => {
                  expect(column).toBe("id");
                  id = value;
                  return Promise.resolve({ error: null });
                },
              };
            },
          };
        },
      } as unknown as RealtyOpsSupabaseClient;

      await completeBillingWebhookEvent(mockSupabase, {
        eventId: "ledger-123",
        status: "processed",
        workspaceId: "123e4567-e89b-12d3-a456-426614174000",
      });

      expect(id).toBe("ledger-123");
      expect(update).toMatchObject({
        processing_status: "processed",
        workspace_id: "123e4567-e89b-12d3-a456-426614174000",
        error_message: null,
      });
    });
  });
});


