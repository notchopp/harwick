import type { RealtyOpsSupabaseClient } from "./server-client";
import type { ConversationMessageRepository } from "../../features/conversations/conversation-message-send";
import type { LeadRow } from "./leads";
import type { ConversationAutomationStateRow } from "./database.types";

export function createSupabaseConversationMessageRepository(
  supabase: RealtyOpsSupabaseClient,
): ConversationMessageRepository {
  return {
    findLeadByConversationId: async (conversationId: string): Promise<LeadRow | null> => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("id", conversationId)
        .maybeSingle<LeadRow>();

      if (error !== null) {
        throw error;
      }

      return data;
    },

    findAutomationState: async (params: {
      workspaceId: string;
      leadId: string;
    }): Promise<ConversationAutomationStateRow | null> => {
      const { data, error } = await supabase
        .from("conversation_automation_states")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .eq("lead_id", params.leadId)
        .maybeSingle();

      if (error !== null) {
        throw error;
      }

      return data;
    },

    recordManualOutboundMessage: async (params) => {
      const occurredAt = new Date().toISOString();
      const providerEventId = `manual-reply:${crypto.randomUUID()}`;
      const { error } = await supabase
        .from("lead_events")
        .insert({
          workspace_id: params.workspaceId,
          lead_id: params.leadId,
          provider: "manual",
          event_type: "reply_sent",
          source_channel: params.sourceChannel,
          provider_event_id: providerEventId,
          provider_account_id: null,
          provider_user_id: null,
          source_post_id: null,
          source_comment_id: null,
          text: params.reply,
          occurred_at: occurredAt,
        });

      if (error !== null) {
        throw error;
      }

      const { error: leadError } = await supabase
        .from("leads")
        .update({
          last_message_at: occurredAt,
          updated_at: occurredAt,
        })
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.leadId);

      if (leadError !== null) {
        throw leadError;
      }

      return {
        status: 200 as const,
        body: {
          status: "sent" as const,
          providerEventId,
          occurredAt,
          channel: params.sourceChannel,
        },
      };
    },
  };
}
