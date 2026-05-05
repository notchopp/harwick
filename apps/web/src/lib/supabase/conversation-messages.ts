import type { NormalizedLeadEvent } from "@realty-ops/core";
import type { RealtyOpsSupabaseClient } from "./server-client";

export type ConversationMessageRow = {
  id: string;
  lead_id: string;
  workspace_id: string;
  sender_type: "customer" | "ai" | "operator";
  sender_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  status: "sent" | "in_progress" | "failed";
  source_channel: string | null;
  provider_message_id: string | null;
  error_code: string | null;
  error_message: string | null;
  /** Trajectory that produced this AI message; null for customer/operator messages. */
  agent_trajectory_id: string | null;
  /** Specific agent step that produced this AI message; lets operators inline-tag the exact (state, action) pair. */
  agent_step_id: string | null;
};

export type ConversationMessageInsertRow = Omit<
  ConversationMessageRow,
  "id" | "created_at" | "updated_at" | "agent_trajectory_id" | "agent_step_id"
> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
  agent_trajectory_id?: string | null;
  agent_step_id?: string | null;
};

export type ConversationMessageRepository = {
  getMessagesByLeadId(leadId: string): Promise<ConversationMessageRow[]>;
  insertMessage(row: ConversationMessageInsertRow): Promise<ConversationMessageRow>;
  updateMessageStatus(messageId: string, status: "sent" | "failed", errorCode?: string, errorMessage?: string): Promise<void>;
};

export function createSupabaseConversationMessageRepository(
  supabase: RealtyOpsSupabaseClient,
): ConversationMessageRepository {
  return {
    async getMessagesByLeadId(leadId: string) {
      const { data, error } = await supabase
        .from("conversation_messages")
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: true });

      if (error !== null) {
        throw error;
      }

      return (data as ConversationMessageRow[]) ?? [];
    },

    async insertMessage(row) {
      const { data, error } = await supabase
        .from("conversation_messages")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert([row] as any)
        .select("*")
        .single<ConversationMessageRow>();

      if (error !== null) {
        throw error;
      }

      return data;
    },

    async updateMessageStatus(messageId, status, errorCode, errorMessage) {
      const updatePayload: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (errorCode !== undefined) {
        updatePayload["error_code"] = errorCode || null;
      }

      if (errorMessage !== undefined) {
        updatePayload["error_message"] = errorMessage || null;
      }

      const { error } = await supabase
        .from("conversation_messages")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(updatePayload as any)
        .eq("id", messageId);

      if (error !== null) {
        throw error;
      }
    },
  };
}

export function createConversationMessageCreator(
  repository: ConversationMessageRepository,
) {
  return async (params: {
    workspaceId: string;
    leadId: string;
    event: NormalizedLeadEvent;
  }) => {
    if (params.event.text === null) {
      return;
    }

    await repository.insertMessage({
      lead_id: params.leadId,
      workspace_id: params.workspaceId,
      sender_type: "customer",
      sender_id: null,
      body: params.event.text,
      source_channel: params.event.sourceChannel,
      provider_message_id: params.event.providerEventId,
      status: "sent",
      created_at: params.event.occurredAt,
      error_code: null,
      error_message: null,
    });
  };
}
