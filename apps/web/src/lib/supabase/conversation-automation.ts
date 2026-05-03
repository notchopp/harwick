import type { ConversationAutomationMode } from "@realty-ops/core";
import type { ConversationAutomationStateRow } from "./database.types";
import type { LeadRow } from "./leads";
import type { RealtyOpsSupabaseClient } from "./server-client";

export type ConversationAutomationRepository = {
  findLeadByConversationId(conversationId: string): Promise<LeadRow | null>;
  findAutomationState(params: {
    workspaceId: string;
    leadId: string;
  }): Promise<ConversationAutomationStateRow | null>;
  insertAutomationState(params: {
    workspaceId: string;
    leadId: string;
    automationMode: ConversationAutomationMode;
    automationReason: string | null;
    changedByMemberId: string;
    changedAt: string;
  }): Promise<void>;
  updateAutomationState(params: {
    stateId: string;
    automationMode: ConversationAutomationMode;
    automationReason: string | null;
    changedByMemberId: string;
    changedAt: string;
  }): Promise<void>;
};

export async function findConversationAutomationMode(params: {
  supabase: RealtyOpsSupabaseClient;
  workspaceId: string;
  leadId?: string | null;
  providerAccountId?: string | null;
  recipientUserId?: string | null;
  channel?: "instagram_dm" | "instagram_comment" | "facebook_dm" | "facebook_comment" | null;
}): Promise<ConversationAutomationMode> {
  let query = params.supabase
    .from("conversation_automation_states")
    .select("*")
    .eq("workspace_id", params.workspaceId);

  if (params.leadId !== undefined && params.leadId !== null) {
    query = query.eq("lead_id", params.leadId);
  } else if (
    params.providerAccountId !== undefined
    && params.providerAccountId !== null
    && params.channel !== undefined
    && params.channel !== null
  ) {
    query = query
      .is("lead_id", null)
      .eq("provider_account_id", params.providerAccountId)
      .eq("channel", params.channel);

    query = params.recipientUserId === undefined || params.recipientUserId === null
      ? query.is("recipient_user_id", null)
      : query.eq("recipient_user_id", params.recipientUserId);
  } else {
    return "ai_on";
  }

  const { data, error } = await query.maybeSingle<ConversationAutomationStateRow>();
  if (error !== null) {
    throw error;
  }

  return (data?.automation_mode as ConversationAutomationMode) ?? "ai_on";
}

export function createSupabaseConversationAutomationRepository(
  supabase: RealtyOpsSupabaseClient,
): ConversationAutomationRepository {
  return {
    async findLeadByConversationId(conversationId) {
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

    async findAutomationState(params) {
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

    async insertAutomationState(params) {
      console.log("[INSERT AUTOMATION STATE]", { workspaceId: params.workspaceId, leadId: params.leadId });
      
      // Lead-scoped automation: provider_account_id and channel are now nullable (migration 20260502000100 applied)
      const insertData = {
        workspace_id: params.workspaceId,
        lead_id: params.leadId,
        automation_mode: params.automationMode,
        automation_reason: params.automationReason,
        changed_by_member_id: params.changedByMemberId,
        changed_at: params.changedAt,
        updated_at: params.changedAt,
        created_at: params.changedAt,
        provider_account_id: null,
        channel: null,
        recipient_user_id: null,
      } as unknown;

      const { error } = await supabase
        .from("conversation_automation_states")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert([insertData] as any);

      if (error !== null) {
        console.error("[INSERT AUTOMATION STATE ERROR]", error);
        throw error;
      }
    },

    async updateAutomationState(params) {
      console.log("[UPDATE AUTOMATION STATE]", { stateId: params.stateId });
      const { error } = await supabase
        .from("conversation_automation_states")
        .update({
          automation_mode: params.automationMode,
          automation_reason: params.automationReason,
          changed_by_member_id: params.changedByMemberId,
          changed_at: params.changedAt,
          updated_at: params.changedAt,
        })
        .eq("id", params.stateId);

      if (error !== null) {
        console.error("[UPDATE AUTOMATION STATE ERROR]", error);
        throw error;
      }
    },
  };
}
