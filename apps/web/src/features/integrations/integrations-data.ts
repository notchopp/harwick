import type { IntegrationAccountRow } from "../../lib/supabase/database.types";
import type { RealtyOpsSupabaseClient } from "../../lib/supabase/server-client";

export type WorkspaceIntegrationAccount = {
  id: string;
  accountScope: IntegrationAccountRow["account_scope"];
  ownerMemberId: string | null;
  provider: IntegrationAccountRow["provider"];
  status: IntegrationAccountRow["status"];
  providerAccountId: string | null;
  providerAccountName: string | null;
  connectedAt: string | null;
  lastHealthCheckAt: string | null;
};

export type IntegrationHealthSummary = {
  crmFailedSyncs: number;
  fubActiveWebhooks: number;
  fubWebhookCount: number;
  listingSourceConnected: boolean;
  metaConnectedCount: number;
};

export type IntegrationsPageData = {
  accounts: WorkspaceIntegrationAccount[];
  health: IntegrationHealthSummary;
};

async function countQuery(query: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count, error } = await query;
  if (error !== null) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Supabase count query failed.");
  }

  return count ?? 0;
}

export async function loadIntegrationsPageData(params: {
  workspaceId: string;
  supabase: RealtyOpsSupabaseClient;
}): Promise<IntegrationsPageData> {
  const { data, error } = await params.supabase
    .from("integration_accounts")
    .select("id,account_scope,owner_member_id,provider,status,provider_account_id,provider_account_name,connected_at,last_health_check_at")
    .eq("workspace_id", params.workspaceId)
    .order("updated_at", { ascending: false });

  if (error !== null) {
    throw error;
  }

  const accounts = (data ?? []).map((row) => ({
    id: row.id,
    accountScope: row.account_scope,
    ownerMemberId: row.owner_member_id,
    provider: row.provider,
    status: row.status,
    providerAccountId: row.provider_account_id,
    providerAccountName: row.provider_account_name,
    connectedAt: row.connected_at,
    lastHealthCheckAt: row.last_health_check_at,
  }));

  const [
    crmFailedSyncs,
    fubActiveWebhooks,
    fubWebhookCount,
  ] = await Promise.all([
    countQuery(
      params.supabase
        .from("crm_sync_logs")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", params.workspaceId)
        .eq("provider", "follow_up_boss")
        .eq("status", "failed"),
    ),
    countQuery(
      params.supabase
        .from("follow_up_boss_webhook_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", params.workspaceId)
        .eq("status", "active"),
    ),
    countQuery(
      params.supabase
        .from("follow_up_boss_webhook_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", params.workspaceId),
    ),
  ]);

  return {
    accounts,
    health: {
      crmFailedSyncs,
      fubActiveWebhooks,
      fubWebhookCount,
      listingSourceConnected: accounts.some((account) => account.provider === "repliers" && account.status === "connected"),
      metaConnectedCount: accounts.filter((account) => account.provider === "meta" && account.status === "connected").length,
    },
  };
}
