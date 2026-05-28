import { workspaceRoleHasCapability, type WorkspaceRole, type ConversationAutomationMode } from "@realty-ops/core";
import type { LeadsPageRepository } from "../../features/leads/leads-data";
import type { LeadEventRow, SocialReplyReviewRow, WorkspaceMemberRow } from "./database.types";
import type { LeadRow } from "./leads";
import type { ListingFactRow } from "./listings";
import type { RealtyOpsSupabaseClient } from "./server-client";

export function createSupabaseLeadsPageRepository(
  supabase: RealtyOpsSupabaseClient,
): LeadsPageRepository {
  return {
    async listLeads(workspaceId, limit, viewer) {
      let query = supabase
        .from("leads")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("last_message_at", { ascending: false })
        .limit(limit);

      if (!workspaceRoleHasCapability(viewer.role as WorkspaceRole, "leads.read_all")) {
        query = query.eq("assigned_agent_id", viewer.memberId);
      }

      const { data, error } = await query.returns<LeadRow[]>();
      if (error !== null) throw error;
      return data ?? [];
    },

    async listWorkspaceMembers(workspaceId) {
      const { data, error } = await supabase
        .from("workspace_members")
        .select("id,display_name,role")
        .eq("workspace_id", workspaceId)
        .eq("is_active", true)
        .returns<Array<Pick<WorkspaceMemberRow, "id" | "display_name" | "role">>>();
      if (error !== null) throw error;
      return data ?? [];
    },

    async listListingFacts(workspaceId, limit) {
      const { data, error } = await supabase
        .from("listing_facts")
        .select("address,status,price")
        .eq("workspace_id", workspaceId)
        .order("updated_at", { ascending: false })
        .limit(limit)
        .returns<Array<Pick<ListingFactRow, "address" | "status" | "price">>>();
      if (error !== null) throw error;
      return data ?? [];
    },

    async findLatestLeadMessage(params) {
      // Try the public-listing-chat transcript first — for chat-origin
      // leads it's the freshest, richest source of the visitor's last
      // utterance. Falls back to lead_events for IG/FB/voice flows
      // where the chat table won't have anything. The two public-chat
      // tables aren't in the generated database.types.ts yet (added in
      // migrations 20260525*), so we cast at the boundary.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const untyped = supabase as any;
      const sessionsQuery: { data: Array<{ id: string }> | null } = await untyped
        .from("public_listing_sessions")
        .select("id")
        .eq("workspace_id", params.workspaceId)
        .eq("promoted_lead_id", params.leadId);
      const sessionIds: string[] = (sessionsQuery.data ?? []).map((row) => row.id);
      if (sessionIds.length > 0) {
        const turnsQuery: { data: { body: string | null } | null } = await untyped
          .from("public_listing_session_turns")
          .select("body")
          .in("session_id", sessionIds)
          .eq("actor", "visitor")
          .not("body", "is", null)
          .order("occurred_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const body = turnsQuery.data?.body ?? null;
        if (body !== null && body.trim().length > 0) {
          return body;
        }
      }
      const { data, error } = await supabase
        .from("lead_events")
        .select("text")
        .eq("workspace_id", params.workspaceId)
        .eq("lead_id", params.leadId)
        .not("text", "is", null)
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle<Pick<LeadEventRow, "text">>();
      if (error !== null) throw error;
      return data?.text ?? null;
    },

    async findLatestSocialReviewForLead(params) {
      const { data, error } = await supabase
        .from("social_reply_reviews")
        .select("id,automation_mode,automation_reason")
        .eq("workspace_id", params.workspaceId)
        .eq("lead_id", params.leadId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle<Pick<SocialReplyReviewRow, "id" | "automation_mode" | "automation_reason">>();
      if (error !== null) throw error;
      return data === null
        ? null
        : {
            id: data.id,
            automationMode: data.automation_mode as ConversationAutomationMode,
            automationReason: data.automation_reason,
          };
    },
  };
}
