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
        .maybeSingle();

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
  };
}
