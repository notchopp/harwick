import type { MetaOAuthRepository } from "../../features/integrations/meta-oauth";
import type { GoogleCalendarOAuthRepository } from "../../features/integrations/google-calendar-oauth";
import type { IntegrationAccountRow } from "./database.types";
import type { RealtyOpsSupabaseClient } from "./server-client";

type ConnectedMetaCredentialRow = Pick<
  IntegrationAccountRow,
  "workspace_id" | "provider_account_id" | "provider_account_ids" | "encrypted_credential_ref"
>;

export type ConnectedMetaCredentialRecord = {
  workspaceId: string;
  providerAccountId: string | null;
  providerAccountIds: string[];
  encryptedCredentialRef: string;
};

export type ConnectedRepliersCredentialRecord = {
  integrationAccountId: string;
  workspaceId: string;
  providerAccountId: string | null;
  providerAccountName: string | null;
  encryptedCredentialRef: string;
};

type ConnectedMetaIntegrationRow = Pick<
  IntegrationAccountRow,
  "id" | "workspace_id" | "account_scope" | "owner_member_id" | "provider_account_id" | "provider_account_ids" | "provider_account_name"
>;

export type ConnectedMetaIntegrationRecord = {
  integrationAccountId: string;
  workspaceId: string;
  accountScope: "workspace" | "member";
  ownerMemberId: string | null;
  providerAccountId: string;
  providerAccountIds: string[];
  providerAccountName: string | null;
};

export function createSupabaseMetaOAuthRepository(
  supabase: RealtyOpsSupabaseClient,
): MetaOAuthRepository {
  return {
    async createPendingIntegration(params) {
      const { error } = await supabase
        .from("integration_accounts")
        .insert({
          workspace_id: params.workspaceId,
          account_scope: params.accountScope,
          owner_member_id: params.ownerMemberId,
          provider: "meta",
          status: "pending",
          provider_account_id: null,
          provider_account_ids: [],
          provider_account_name: null,
          encrypted_credential_ref: null,
          oauth_state: params.oauthState,
          connected_at: null,
          last_health_check_at: null,
        });

      if (error !== null) {
        throw error;
      }
    },

    async connectIntegration(params) {
      const { data, error } = await supabase
        .from("integration_accounts")
        .update({
          status: "connected",
          provider_account_id: params.providerAccountId,
          provider_account_ids: params.providerAccountIds,
          provider_account_name: params.providerAccountName,
          encrypted_credential_ref: params.encryptedCredentialRef,
          oauth_state: null,
          connected_at: new Date().toISOString(),
          last_health_check_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("provider", "meta")
        .eq("status", "pending")
        .eq("oauth_state", params.oauthState)
        .select("id,workspace_id,account_scope,owner_member_id,provider_account_id,provider_account_ids,provider_account_name");

      if (error !== null) {
        throw error;
      }

      const row = data?.[0] as ConnectedMetaIntegrationRow | undefined;
      if (row?.provider_account_id === null || row === undefined) {
        return null;
      }

      return {
        integrationAccountId: row.id,
        workspaceId: row.workspace_id,
        accountScope: row.account_scope as "workspace" | "member",
        ownerMemberId: row.owner_member_id,
        providerAccountId: row.provider_account_id,
        providerAccountIds: row.provider_account_ids,
        providerAccountName: row.provider_account_name,
      };
    },

    async stagePendingIntegrationSelection(params) {
      const { data, error } = await supabase
        .from("integration_accounts")
        .update({
          encrypted_credential_ref: params.encryptedCredentialRef,
          updated_at: new Date().toISOString(),
        })
        .eq("provider", "meta")
        .eq("status", "pending")
        .eq("oauth_state", params.oauthState)
        .select("id");

      if (error !== null) {
        throw error;
      }

      return (data?.length ?? 0) > 0;
    },

    async findPendingIntegrationSelection(params) {
      const { data, error } = await supabase
        .from("integration_accounts")
        .select("encrypted_credential_ref")
        .eq("provider", "meta")
        .eq("status", "pending")
        .eq("oauth_state", params.oauthState)
        .not("encrypted_credential_ref", "is", null)
        .maybeSingle<Pick<IntegrationAccountRow, "encrypted_credential_ref">>();

      if (error !== null) {
        throw error;
      }

      if (data?.encrypted_credential_ref === null || data === null) {
        return null;
      }

      return {
        encryptedCredentialRef: data.encrypted_credential_ref,
      };
    },

    async clearPendingIntegrationSelection(params) {
      const { error } = await supabase
        .from("integration_accounts")
        .update({
          encrypted_credential_ref: null,
          updated_at: new Date().toISOString(),
        })
        .eq("provider", "meta")
        .eq("status", "pending")
        .eq("oauth_state", params.oauthState);

      if (error !== null) {
        throw error;
      }
    },
  };
}

export function createSupabaseMetaCredentialRepository(
  supabase: RealtyOpsSupabaseClient,
) {
  return {
    async findConnectedCredential(params: {
      workspaceId: string;
      providerAccountId: string;
    }): Promise<ConnectedMetaCredentialRecord | null> {
      const selectColumns = "workspace_id,provider_account_id,provider_account_ids,encrypted_credential_ref";

      const { data, error } = await supabase
        .from("integration_accounts")
        .select(selectColumns)
        .eq("workspace_id", params.workspaceId)
        .eq("provider", "meta")
        .eq("status", "connected")
        .eq("provider_account_id", params.providerAccountId)
        .maybeSingle<ConnectedMetaCredentialRow>();

      if (error !== null) {
        throw error;
      }

      const directMatch = data?.encrypted_credential_ref === null || data === null
        ? null
        : {
            workspaceId: data.workspace_id,
            providerAccountId: data.provider_account_id,
            providerAccountIds: data.provider_account_ids,
            encryptedCredentialRef: data.encrypted_credential_ref,
          };

      if (directMatch !== null) {
        return directMatch;
      }

      const { data: aliasData, error: aliasError } = await supabase
        .from("integration_accounts")
        .select(selectColumns)
        .eq("workspace_id", params.workspaceId)
        .eq("provider", "meta")
        .eq("status", "connected")
        .contains("provider_account_ids", [params.providerAccountId])
        .maybeSingle<ConnectedMetaCredentialRow>();

      if (aliasError !== null) {
        throw aliasError;
      }

      if (aliasData?.encrypted_credential_ref === null || aliasData === null) {
        return null;
      }

      return {
        workspaceId: aliasData.workspace_id,
        providerAccountId: aliasData.provider_account_id,
        providerAccountIds: aliasData.provider_account_ids,
        encryptedCredentialRef: aliasData.encrypted_credential_ref,
      };
    },
  };
}

export function createSupabaseGoogleCalendarOAuthRepository(
  supabase: RealtyOpsSupabaseClient,
): GoogleCalendarOAuthRepository {
  return {
    async createPendingConnection(params) {
      const { error } = await supabase
        .from("integration_accounts")
        .insert({
          workspace_id: params.workspaceId,
          account_scope: "member",
          owner_member_id: params.memberId,
          provider: "google_calendar",
          status: "pending",
          provider_account_id: null,
          provider_account_ids: [],
          provider_account_name: null,
          encrypted_credential_ref: null,
          oauth_state: params.oauthState,
          connected_at: null,
          last_health_check_at: null,
        });

      if (error !== null) {
        throw error;
      }
    },

    async connectCalendar(params) {
      const connectedAt = new Date().toISOString();
      const providerAccountId = params.providerAccountEmail ?? `primary:${params.calendarId}`;
      const { data, error } = await supabase
        .from("integration_accounts")
        .update({
          status: "connected",
          provider_account_id: providerAccountId,
          provider_account_ids: [params.calendarId],
          provider_account_name: params.providerAccountEmail ?? "Google Calendar",
          encrypted_credential_ref: params.encryptedCredentialRef,
          oauth_state: null,
          connected_at: connectedAt,
          last_health_check_at: connectedAt,
          updated_at: connectedAt,
        })
        .eq("provider", "google_calendar")
        .eq("status", "pending")
        .eq("oauth_state", params.oauthState)
        .select("workspace_id,owner_member_id")
        .maybeSingle<Pick<IntegrationAccountRow, "workspace_id" | "owner_member_id">>();

      if (error !== null) {
        throw error;
      }

      if (data === null || data.owner_member_id === null) {
        return null;
      }

      const { error: upsertError } = await supabase
        .from("workspace_member_calendar_connections")
        .upsert({
          workspace_id: data.workspace_id,
          member_id: data.owner_member_id,
          provider: "google",
          provider_account_email: params.providerAccountEmail,
          calendar_id: params.calendarId,
          status: "connected",
          showing_mode: "request_approve",
          timezone: params.timezone,
          encrypted_credential_ref: params.encryptedCredentialRef,
          last_synced_at: connectedAt,
          updated_at: connectedAt,
        }, {
          onConflict: "workspace_id,member_id,provider,calendar_id",
        });

      if (upsertError !== null) {
        throw upsertError;
      }

      return {
        workspaceId: data.workspace_id,
        memberId: data.owner_member_id,
      };
    },
  };
}

export function createSupabaseRepliersCredentialRepository(
  supabase: RealtyOpsSupabaseClient,
) {
  return {
    async findConnectedCredential(params: {
      workspaceId: string;
    }): Promise<ConnectedRepliersCredentialRecord | null> {
      const { data, error } = await supabase
        .from("integration_accounts")
        .select("id,workspace_id,provider_account_id,provider_account_name,encrypted_credential_ref")
        .eq("workspace_id", params.workspaceId)
        .eq("provider", "repliers")
        .eq("status", "connected")
        .eq("account_scope", "workspace")
        .not("encrypted_credential_ref", "is", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle<Pick<
          IntegrationAccountRow,
          "id" | "workspace_id" | "provider_account_id" | "provider_account_name" | "encrypted_credential_ref"
        >>();

      if (error !== null) {
        throw error;
      }

      if (data === null || data.encrypted_credential_ref === null) {
        return null;
      }

      return {
        integrationAccountId: data.id,
        workspaceId: data.workspace_id,
        providerAccountId: data.provider_account_id,
        providerAccountName: data.provider_account_name,
        encryptedCredentialRef: data.encrypted_credential_ref,
      };
    },

    async upsertWorkspaceCredential(params: {
      workspaceId: string;
      providerAccountId: string;
      providerAccountName: string | null;
      encryptedCredentialRef: string;
    }): Promise<ConnectedRepliersCredentialRecord> {
      const { data, error } = await supabase
        .from("integration_accounts")
        .upsert({
          workspace_id: params.workspaceId,
          account_scope: "workspace",
          owner_member_id: null,
          provider: "repliers",
          status: "connected",
          provider_account_id: params.providerAccountId,
          provider_account_ids: [],
          provider_account_name: params.providerAccountName,
          encrypted_credential_ref: params.encryptedCredentialRef,
          oauth_state: null,
          connected_at: new Date().toISOString(),
          last_health_check_at: null,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: "workspace_id,provider,provider_account_id",
        })
        .select("id,workspace_id,provider_account_id,provider_account_name,encrypted_credential_ref")
        .single<Pick<
          IntegrationAccountRow,
          "id" | "workspace_id" | "provider_account_id" | "provider_account_name" | "encrypted_credential_ref"
        >>();

      if (error !== null) {
        throw error;
      }

      if (data.encrypted_credential_ref === null) {
        throw new Error("Connected Repliers integration is missing encrypted credentials.");
      }

      return {
        integrationAccountId: data.id,
        workspaceId: data.workspace_id,
        providerAccountId: data.provider_account_id,
        providerAccountName: data.provider_account_name,
        encryptedCredentialRef: data.encrypted_credential_ref,
      };
    },
  };
}
