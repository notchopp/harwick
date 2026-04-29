import type { FollowUpBossWebhookEventType, FollowUpBossWebhookNotification } from "@realty-ops/core";
import type {
  CrmBacksyncEventRow,
  FollowUpBossWebhookSubscriptionRow,
  IntegrationAccountRow,
} from "./database.types";
import type { RealtyOpsSupabaseClient } from "./server-client";

type ConnectedFollowUpBossCredentialRow = Pick<
  IntegrationAccountRow,
  "id" | "workspace_id" | "encrypted_credential_ref"
>;

export type ConnectedFollowUpBossCredentialRecord = {
  integrationAccountId: string;
  workspaceId: string;
  encryptedCredentialRef: string;
};

type FollowUpBossWebhookSubscriptionRecordRow = Pick<
  FollowUpBossWebhookSubscriptionRow,
  | "id"
  | "workspace_id"
  | "integration_account_id"
  | "event_type"
  | "status"
  | "provider_webhook_id"
  | "callback_token"
  | "system_name"
  | "encrypted_system_key_ref"
>;

export type FollowUpBossWebhookSubscriptionRecord = {
  subscriptionId: string;
  workspaceId: string;
  integrationAccountId: string;
  eventType: FollowUpBossWebhookEventType;
  status: FollowUpBossWebhookSubscriptionRow["status"];
  providerWebhookId: string | null;
  callbackToken: string;
  systemName: string;
  encryptedSystemKeyRef: string;
};

export type FollowUpBossWebhookRegistrationSeed = {
  eventType: FollowUpBossWebhookEventType;
  callbackToken: string;
  systemName: string;
  encryptedSystemKeyRef: string;
};

type CrmBacksyncEventInsertRow = Omit<
  CrmBacksyncEventRow,
  "id" | "created_at" | "updated_at" | "status" | "correlated_sync_log_id" | "processed_at" | "last_error_code" | "last_error_message"
> & Partial<Pick<
  CrmBacksyncEventRow,
  "id" | "created_at" | "updated_at" | "status" | "correlated_sync_log_id" | "processed_at" | "last_error_code" | "last_error_message"
>>;

export function createSupabaseFollowUpBossCredentialRepository(
  supabase: RealtyOpsSupabaseClient,
) {
  return {
    async findConnectedCredential(workspaceId: string): Promise<ConnectedFollowUpBossCredentialRecord | null> {
      const { data, error } = await supabase
        .from("integration_accounts")
        .select("id,workspace_id,encrypted_credential_ref")
        .eq("workspace_id", workspaceId)
        .eq("provider", "follow_up_boss")
        .eq("status", "connected")
        .not("encrypted_credential_ref", "is", null)
        .maybeSingle<ConnectedFollowUpBossCredentialRow>();

      if (error !== null) {
        throw error;
      }
      if (data?.encrypted_credential_ref === null || data === null) {
        return null;
      }

      return {
        integrationAccountId: data.id,
        workspaceId: data.workspace_id,
        encryptedCredentialRef: data.encrypted_credential_ref,
      };
    },
  };
}

export function createSupabaseFollowUpBossWebhookRepository(
  supabase: RealtyOpsSupabaseClient,
) {
  async function listSubscriptionsByWorkspace(
    workspaceId: string,
  ): Promise<FollowUpBossWebhookSubscriptionRecord[]> {
    const { data, error } = await supabase
      .from("follow_up_boss_webhook_subscriptions")
      .select("id,workspace_id,integration_account_id,event_type,status,provider_webhook_id,callback_token,system_name,encrypted_system_key_ref")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true });

    if (error !== null) {
      throw error;
    }

    return (data ?? []).map((row) => ({
      subscriptionId: row.id,
      workspaceId: row.workspace_id,
      integrationAccountId: row.integration_account_id,
      eventType: row.event_type,
      status: row.status,
      providerWebhookId: row.provider_webhook_id,
      callbackToken: row.callback_token,
      systemName: row.system_name,
      encryptedSystemKeyRef: row.encrypted_system_key_ref,
    }));
  }

  return {
    listSubscriptionsByWorkspace,

    async upsertRegistrationSeeds(params: {
      workspaceId: string;
      integrationAccountId: string;
      subscriptions: FollowUpBossWebhookRegistrationSeed[];
    }): Promise<FollowUpBossWebhookSubscriptionRecord[]> {
      const rows = params.subscriptions.map((subscription) => ({
        workspace_id: params.workspaceId,
        integration_account_id: params.integrationAccountId,
        event_type: subscription.eventType,
        status: "pending" as const,
        provider_webhook_id: null,
        callback_token: subscription.callbackToken,
        system_name: subscription.systemName,
        encrypted_system_key_ref: subscription.encryptedSystemKeyRef,
      }));

      const { error } = await supabase
        .from("follow_up_boss_webhook_subscriptions")
        .upsert(rows, {
          onConflict: "workspace_id,integration_account_id,event_type",
          ignoreDuplicates: true,
        });

      if (error !== null) {
        throw error;
      }

      return listSubscriptionsByWorkspace(params.workspaceId);
    },

    async markSubscriptionActive(params: {
      subscriptionId: string;
      providerWebhookId: string;
    }): Promise<void> {
      const { error } = await supabase
        .from("follow_up_boss_webhook_subscriptions")
        .update({
          status: "active",
          provider_webhook_id: params.providerWebhookId,
          last_registered_at: new Date().toISOString(),
          last_error_code: null,
          last_error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", params.subscriptionId);

      if (error !== null) {
        throw error;
      }
    },

    async markSubscriptionError(params: {
      subscriptionId: string;
      errorCode: string;
      errorMessage: string;
    }): Promise<void> {
      const { error } = await supabase
        .from("follow_up_boss_webhook_subscriptions")
        .update({
          status: "error",
          last_error_code: params.errorCode,
          last_error_message: params.errorMessage.slice(0, 1000),
          updated_at: new Date().toISOString(),
        })
        .eq("id", params.subscriptionId);

      if (error !== null) {
        throw error;
      }
    },

    async findSubscriptionByCallbackToken(
      callbackToken: string,
    ): Promise<FollowUpBossWebhookSubscriptionRecord | null> {
      const { data, error } = await supabase
        .from("follow_up_boss_webhook_subscriptions")
        .select("id,workspace_id,integration_account_id,event_type,status,provider_webhook_id,callback_token,system_name,encrypted_system_key_ref")
        .eq("callback_token", callbackToken)
        .in("status", ["pending", "active", "error"])
        .maybeSingle<FollowUpBossWebhookSubscriptionRecordRow>();

      if (error !== null) {
        throw error;
      }
      if (data === null) {
        return null;
      }

      return {
        subscriptionId: data.id,
        workspaceId: data.workspace_id,
        integrationAccountId: data.integration_account_id,
        eventType: data.event_type,
        status: data.status,
        providerWebhookId: data.provider_webhook_id,
        callbackToken: data.callback_token,
        systemName: data.system_name,
        encryptedSystemKeyRef: data.encrypted_system_key_ref,
      };
    },

    async recordInboundEvent(params: {
      workspaceId: string;
      subscriptionId: string;
      notification: FollowUpBossWebhookNotification;
    }): Promise<{ backsyncEventId: string; inserted: boolean }> {
      const row: CrmBacksyncEventInsertRow = {
        workspace_id: params.workspaceId,
        provider: "follow_up_boss",
        subscription_id: params.subscriptionId,
        provider_event_id: params.notification.eventId,
        event_type: params.notification.event,
        resource_ids: params.notification.resourceIds,
        resource_uri: params.notification.uri,
        event_created_at: params.notification.eventCreated,
        payload: params.notification,
      };

      const { data, error } = await supabase
        .from("crm_backsync_events")
        .upsert(row, {
          onConflict: "workspace_id,provider,provider_event_id",
          ignoreDuplicates: true,
        })
        .select("id")
        .maybeSingle();

      if (error !== null) {
        throw error;
      }

      if (data !== null) {
        return {
          backsyncEventId: data.id,
          inserted: true,
        };
      }

      const { data: existing, error: existingError } = await supabase
        .from("crm_backsync_events")
        .select("id")
        .eq("workspace_id", params.workspaceId)
        .eq("provider", "follow_up_boss")
        .eq("provider_event_id", params.notification.eventId)
        .maybeSingle();

      if (existingError !== null) {
        throw existingError;
      }
      if (existing === null) {
        throw new Error("Follow Up Boss backsync event was not persisted.");
      }

      return {
        backsyncEventId: existing.id,
        inserted: false,
      };
    },
  };
}
