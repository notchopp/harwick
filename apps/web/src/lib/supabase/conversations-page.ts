import type { ConversationsInboxRepository } from "../../features/conversations/conversations-data";
import type {
  LeadEventRow,
  SocialReplyReviewRow,
  WorkspaceMemberRow,
} from "./database.types";
import type { LeadRow } from "./leads";
import type { RealtyOpsSupabaseClient } from "./server-client";

export function createSupabaseConversationsInboxRepository(
  supabase: RealtyOpsSupabaseClient,
): ConversationsInboxRepository {
  return {
    async listLeads(params) {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .not("last_message_at", "is", null)
        .neq("status", "archived")
        .order("last_message_at", { ascending: false })
        .limit(params.limit)
        .returns<LeadRow[]>();

      if (error !== null) {
        throw error;
      }

      return data ?? [];
    },

    async listWorkspaceMembers(workspaceId) {
      const { data, error } = await supabase
        .from("workspace_members")
        .select("id,display_name")
        .eq("workspace_id", workspaceId)
        .eq("is_active", true)
        .returns<Array<Pick<WorkspaceMemberRow, "id" | "display_name">>>();

      if (error !== null) {
        throw error;
      }

      return data ?? [];
    },

    async listLeadEvents(params) {
      if (params.leadIds.length === 0) {
        return [];
      }

      const { data, error } = await supabase
        .from("lead_events")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .in("lead_id", params.leadIds)
        .order("occurred_at", { ascending: true })
        .limit(params.limit)
        .returns<LeadEventRow[]>();

      if (error !== null) {
        throw error;
      }

      return data ?? [];
    },

    async listSocialReplyReviews(params) {
      if (params.leadIds.length === 0) {
        return [];
      }

      const { data, error } = await supabase
        .from("social_reply_reviews")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .in("lead_id", params.leadIds)
        .order("updated_at", { ascending: false })
        .returns<SocialReplyReviewRow[]>();

      if (error !== null) {
        throw error;
      }

      return data ?? [];
    },
  };
}
