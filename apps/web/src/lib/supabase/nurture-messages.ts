import type { NurtureMessage } from "@realty-ops/core";
import type { NurtureMessageRepository } from "../../features/nurture/nurture-message-actions";
import type { NurtureMessageRow } from "./database.types";
import type { RealtyOpsSupabaseClient } from "./server-client";

function mapNurtureMessage(row: NurtureMessageRow): NurtureMessage {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    leadId: row.lead_id,
    enrollmentId: row.enrollment_id,
    channel: row.channel as "instagram_dm" | "facebook_dm" | "sms",
    status: row.status as "sent" | "queued" | "failed" | "blocked" | "drafted",
    stepIndex: row.step_index,
    body: row.body,
    blockReason: (row.block_reason as "opted_out" | "quiet_hours" | "missing_contact" | "sequence_complete" | null) ?? null,
    providerMessageId: row.provider_message_id,
    scheduledFor: row.scheduled_for,
    sentAt: row.sent_at,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSupabaseNurtureMessageRepository(
  supabase: RealtyOpsSupabaseClient,
): NurtureMessageRepository {
  return {
    async findNurtureMessage(params) {
      const { data, error } = await supabase
        .from("nurture_messages")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.messageId)
        .maybeSingle<NurtureMessageRow>();

      if (error !== null) {
        throw error;
      }

      return data === null ? null : mapNurtureMessage(data);
    },

    async updateNurtureMessage(params) {
      const { data, error } = await supabase
        .from("nurture_messages")
        .update({
          status: params.values.status,
          ...(params.values.blockReason === undefined ? {} : { block_reason: params.values.blockReason }),
          ...(params.values.providerMessageId === undefined ? {} : { provider_message_id: params.values.providerMessageId }),
          ...(params.values.sentAt === undefined ? {} : { sent_at: params.values.sentAt }),
          ...(params.values.lastErrorCode === undefined ? {} : { last_error_code: params.values.lastErrorCode }),
          ...(params.values.lastErrorMessage === undefined ? {} : { last_error_message: params.values.lastErrorMessage }),
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.messageId)
        .select("*")
        .maybeSingle<NurtureMessageRow>();

      if (error !== null) {
        throw error;
      }

      return data === null ? null : mapNurtureMessage(data);
    },
  };
}
