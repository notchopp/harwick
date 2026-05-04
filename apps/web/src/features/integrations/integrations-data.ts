import { createLogger } from "@realty-ops/core";
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
  warnings: string[];
};

type CountQueryResult = {
  count: number;
  missingRelation: boolean;
};

type PostgrestLikeError = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
};

const logger = createLogger({
  service: "integrations-page-data",
  environment: process.env["APP_ENV"],
});

function isMissingRelationError(error: unknown): error is PostgrestLikeError {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const relationError = error as PostgrestLikeError;
  if (relationError.code === "42P01" || relationError.code === "PGRST205") {
    return true;
  }

  const message = typeof relationError.message === "string" ? relationError.message : "";
  return message.includes("does not exist") || message.includes("schema cache");
}

async function countQuery(params: {
  query: PromiseLike<{ count: number | null; error: unknown }>;
  relationName: string;
  tolerateMissingRelation?: boolean;
  workspaceId: string;
}): Promise<CountQueryResult> {
  const { count, error } = await params.query;
  if (error !== null) {
    if (params.tolerateMissingRelation && isMissingRelationError(error)) {
      logger.warn("integration health query skipped because relation is unavailable", {
        relationName: params.relationName,
        workspaceId: params.workspaceId,
        error,
      });
      return {
        count: 0,
        missingRelation: true,
      };
    }

    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Supabase count query failed.");
  }

  return {
    count: count ?? 0,
    missingRelation: false,
  };
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
    countQuery({
      query: params.supabase
        .from("crm_sync_logs")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", params.workspaceId)
        .eq("provider", "follow_up_boss")
        .eq("status", "failed"),
      relationName: "crm_sync_logs",
      tolerateMissingRelation: true,
      workspaceId: params.workspaceId,
    }),
    countQuery({
      query: params.supabase
        .from("follow_up_boss_webhook_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", params.workspaceId)
        .eq("status", "active"),
      relationName: "follow_up_boss_webhook_subscriptions",
      tolerateMissingRelation: true,
      workspaceId: params.workspaceId,
    }),
    countQuery({
      query: params.supabase
        .from("follow_up_boss_webhook_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", params.workspaceId),
      relationName: "follow_up_boss_webhook_subscriptions",
      tolerateMissingRelation: true,
      workspaceId: params.workspaceId,
    }),
  ]);

  const warnings: string[] = [];
  if (crmFailedSyncs.missingRelation) {
    warnings.push("CRM sync health is unavailable because the crm_sync_logs table is not provisioned in this environment.");
  }
  if (fubActiveWebhooks.missingRelation || fubWebhookCount.missingRelation) {
    warnings.push("Follow Up Boss back-sync status is unavailable because webhook subscription tables are not provisioned in this environment.");
  }

  return {
    accounts,
    health: {
      crmFailedSyncs: crmFailedSyncs.count,
      fubActiveWebhooks: fubActiveWebhooks.count,
      fubWebhookCount: fubWebhookCount.count,
      listingSourceConnected: accounts.some((account) => account.provider === "repliers" && account.status === "connected"),
      metaConnectedCount: accounts.filter((account) => account.provider === "meta" && account.status === "connected").length,
    },
    warnings,
  };
}
