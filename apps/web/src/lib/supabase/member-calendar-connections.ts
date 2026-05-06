import {
  WorkspaceMemberCalendarConnectionSchema,
  type WorkspaceMemberCalendarConnection,
} from "@realty-ops/core";
import type {
  WorkspaceMemberCalendarConnectionRow,
} from "./database.types";
import type { RealtyOpsSupabaseClient } from "./server-client";

export type ActiveMemberCalendarConnection = WorkspaceMemberCalendarConnection & {
  encryptedCredentialRef: string;
};

export type MemberCalendarConnectionRepository = {
  findActiveConnection(params: {
    workspaceId: string;
    memberId: string;
  }): Promise<ActiveMemberCalendarConnection | null>;
  updateEncryptedCredential(params: {
    connectionId: string;
    encryptedCredentialRef: string;
    syncedAt: string;
  }): Promise<void>;
};

function mapCalendarConnectionRow(row: WorkspaceMemberCalendarConnectionRow): ActiveMemberCalendarConnection {
  const connection = WorkspaceMemberCalendarConnectionSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    memberId: row.member_id,
    provider: row.provider,
    providerAccountEmail: row.provider_account_email,
    calendarId: row.calendar_id,
    status: row.status,
    showingMode: row.showing_mode,
    timezone: row.timezone,
    lastSyncedAt: row.last_synced_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  return {
    ...connection,
    encryptedCredentialRef: row.encrypted_credential_ref,
  };
}

export function createSupabaseMemberCalendarConnectionRepository(
  supabase: RealtyOpsSupabaseClient,
): MemberCalendarConnectionRepository {
  return {
    async findActiveConnection(params) {
      const { data, error } = await supabase
        .from("workspace_member_calendar_connections")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .eq("member_id", params.memberId)
        .eq("provider", "google")
        .eq("status", "connected")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle<WorkspaceMemberCalendarConnectionRow>();

      if (error !== null) {
        throw error;
      }

      return data === null ? null : mapCalendarConnectionRow(data);
    },

    async updateEncryptedCredential(params) {
      const { error } = await supabase
        .from("workspace_member_calendar_connections")
        .update({
          encrypted_credential_ref: params.encryptedCredentialRef,
          status: "connected",
          last_synced_at: params.syncedAt,
          updated_at: params.syncedAt,
        })
        .eq("id", params.connectionId);

      if (error !== null) {
        throw error;
      }
    },
  };
}
