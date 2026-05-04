import { describe, expect, it, vi } from "vitest";
import { loadIntegrationsPageData } from "./integrations-data";

type QueryResult = {
  data?: unknown;
  count?: number | null;
  error: unknown;
};

function createQuery(result: QueryResult) {
  const promise = Promise.resolve(result);
  const query = {
    select() {
      return query;
    },
    eq() {
      return query;
    },
    order() {
      return query;
    },
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  };

  return query;
}

function createSupabaseMock(config: {
  accounts?: unknown[];
  crmSyncLogs?: QueryResult;
  fubSubscriptions?: QueryResult;
}) {
  return {
    from(table: string) {
      if (table === "integration_accounts") {
        return createQuery({
          data: config.accounts ?? [],
          error: null,
        });
      }

      if (table === "crm_sync_logs") {
        return createQuery(config.crmSyncLogs ?? {
          count: 0,
          error: null,
        });
      }

      if (table === "follow_up_boss_webhook_subscriptions") {
        return createQuery(config.fubSubscriptions ?? {
          count: 0,
          error: null,
        });
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

describe("loadIntegrationsPageData", () => {
  it("returns integration health counts when all tables are available", async () => {
    const supabase = createSupabaseMock({
      accounts: [
        {
          id: "acct-1",
          account_scope: "workspace",
          owner_member_id: null,
          provider: "meta",
          status: "connected",
          provider_account_id: "meta-1",
          provider_account_name: "Main Meta",
          connected_at: "2026-05-01T00:00:00.000Z",
          last_health_check_at: "2026-05-01T01:00:00.000Z",
        },
      ],
      crmSyncLogs: {
        count: 3,
        error: null,
      },
      fubSubscriptions: {
        count: 2,
        error: null,
      },
    });

    const result = await loadIntegrationsPageData({
      workspaceId: "workspace-1",
      supabase: supabase as never,
    });

    expect(result.health.crmFailedSyncs).toBe(3);
    expect(result.health.fubActiveWebhooks).toBe(2);
    expect(result.health.fubWebhookCount).toBe(2);
    expect(result.health.metaConnectedCount).toBe(1);
    expect(result.warnings).toEqual([]);
  });

  it("degrades gracefully when the Follow Up Boss webhook table is missing", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await loadIntegrationsPageData({
      workspaceId: "workspace-1",
      supabase: createSupabaseMock({
        accounts: [],
        crmSyncLogs: {
          count: 1,
          error: null,
        },
        fubSubscriptions: {
          error: {
            code: "42P01",
            message: "relation \"public.follow_up_boss_webhook_subscriptions\" does not exist",
          },
        },
      }) as never,
    });

    expect(result.health.crmFailedSyncs).toBe(1);
    expect(result.health.fubActiveWebhooks).toBe(0);
    expect(result.health.fubWebhookCount).toBe(0);
    expect(result.warnings).toEqual([
      "Follow Up Boss back-sync status is unavailable because webhook subscription tables are not provisioned in this environment.",
    ]);

    warnSpy.mockRestore();
  });
});
