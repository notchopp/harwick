import type { ConversationAutomationMode } from "@realty-ops/core";
import type { RealtyOpsSupabaseClient } from "./server-client";

export type ConversationRow = {
  id: string;
  workspace_id: string;
  lead_id: string;
  channel: "instagram_dm" | "facebook_dm" | "instagram_comment" | "facebook_comment" | "sms" | "call";
  provider_account_id: string | null;
  recipient_user_id: string | null;
  source_post_id: string | null;
  source_comment_id: string | null;
  automation_mode: ConversationAutomationMode;
  automation_changed_by_member_id: string | null;
  automation_changed_at: string | null;
  automation_reason: string | null;
  status: "active" | "paused" | "resolved" | "archived" | "dismissed";
  dismissal_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type ConversationActivityLogRow = {
  id: string;
  conversation_id: string;
  event_type: string;
  actor_type: "system" | "operator" | "customer" | "ai";
  actor_id: string | null;
  data: Record<string, unknown> | null;
  created_at: string;
};

export type ConversationRepository = {
  findConversationByLeadId(params: {
    workspaceId: string;
    leadId: string;
  }): Promise<ConversationRow | null>;

  findOrCreateConversation(params: {
    workspaceId: string;
    leadId: string;
    channel: string;
    providerAccountId?: string | null;
    recipientUserId?: string | null;
    sourcePostId?: string | null;
    sourceCommentId?: string | null;
  }): Promise<ConversationRow>;

  updateConversationAutomation(params: {
    workspaceId: string;
    leadId: string;
    automationMode: ConversationAutomationMode;
    automationReason: string | null;
    changedByMemberId: string;
    changedAt: string;
  }): Promise<ConversationRow>;

  listConversations(params: {
    workspaceId: string;
    limit?: number;
    offset?: number;
  }): Promise<ConversationRow[]>;

  getActivityLog(params: {
    conversationId: string;
    limit?: number;
    offset?: number;
  }): Promise<ConversationActivityLogRow[]>;

  logActivity(params: {
    conversationId: string;
    eventType: string;
    actorType: "system" | "operator" | "customer" | "ai";
    actorId?: string | null;
    data?: Record<string, unknown> | null;
  }): Promise<ConversationActivityLogRow>;
};

export function createSupabaseConversationsRepository(
  supabase: RealtyOpsSupabaseClient,
): ConversationRepository {
  return {
    async findConversationByLeadId(params) {
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .eq("lead_id", params.leadId)
        .maybeSingle<ConversationRow>();

      if (error !== null) {
        throw error;
      }

      return data;
    },

    async findOrCreateConversation(params) {
      // Try to find existing
      const conversation = await this.findConversationByLeadId({
        workspaceId: params.workspaceId,
        leadId: params.leadId,
      });

      if (conversation !== null) {
        return conversation;
      }

      // Create new
      const { data, error } = await supabase
        .from("conversations")
        .insert({
          workspace_id: params.workspaceId,
          lead_id: params.leadId,
          channel: params.channel,
          provider_account_id: params.providerAccountId ?? null,
          recipient_user_id: params.recipientUserId ?? null,
          source_post_id: params.sourcePostId ?? null,
          source_comment_id: params.sourceCommentId ?? null,
          automation_mode: "ai_on",
          status: "active",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select("*")
        .single<ConversationRow>();

      if (error !== null) {
        throw error;
      }

      return data;
    },

    async updateConversationAutomation(params) {
      const { data, error } = await supabase
        .from("conversations")
        .update({
          automation_mode: params.automationMode,
          automation_reason: params.automationReason,
          automation_changed_by_member_id: params.changedByMemberId,
          automation_changed_at: params.changedAt,
          updated_at: params.changedAt,
        })
        .eq("workspace_id", params.workspaceId)
        .eq("lead_id", params.leadId)
        .select("*")
        .single<ConversationRow>();

      if (error !== null) {
        throw error;
      }

      // Log the activity
      await this.logActivity({
        conversationId: data.id,
        eventType:
          params.automationMode === "ai_on"
            ? "operator_resumed_ai"
            : params.automationMode === "human_takeover"
              ? "operator_paused_ai"
              : "automation_disabled",
        actorType: "operator",
        actorId: params.changedByMemberId,
        data: {
          old_mode: data.automation_mode,
          new_mode: params.automationMode,
          reason: params.automationReason,
        },
      });

      return data;
    },

    async listConversations(params) {
      let query = supabase
        .from("conversations")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .order("updated_at", { ascending: false });

      if (params.limit !== undefined) {
        query = query.limit(params.limit);
      }

      if (params.offset !== undefined) {
        query = query.range(params.offset, (params.offset ?? 0) + (params.limit ?? 50) - 1);
      }

      const { data, error } = await query;

      if (error !== null) {
        throw error;
      }

      return data as ConversationRow[];
    },

    async getActivityLog(params) {
      let query = supabase
        .from("conversation_activity_log")
        .select("*")
        .eq("conversation_id", params.conversationId)
        .order("created_at", { ascending: false });

      if (params.limit !== undefined) {
        query = query.limit(params.limit);
      }

      if (params.offset !== undefined) {
        query = query.range(params.offset, (params.offset ?? 0) + (params.limit ?? 50) - 1);
      }

      const { data, error } = await query;

      if (error !== null) {
        throw error;
      }

      return data as ConversationActivityLogRow[];
    },

    async logActivity(params) {
      const { data, error } = await supabase
        .from("conversation_activity_log")
        .insert([{
          conversation_id: params.conversationId,
          event_type: params.eventType,
          actor_type: params.actorType,
          actor_id: params.actorId ?? null,
          data: params.data ?? null,
          created_at: new Date().toISOString(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }] as any)
        .select("*")
        .single<ConversationActivityLogRow>();

      if (error !== null) {
        throw error;
      }

      return data;
    },
  };
}
