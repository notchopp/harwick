import type { LeadsPageRepository } from "../../features/leads/leads-data";
import type { LeadEventRow, WorkspaceMemberRow } from "./database.types";
import type { LeadRow } from "./leads";
import type { ListingFactRow } from "./listings";
import type { RealtyOpsSupabaseClient } from "./server-client";

export function createSupabaseLeadsPageRepository(
  supabase: RealtyOpsSupabaseClient,
): LeadsPageRepository {
  return {
    async listLeads(workspaceId, limit) {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("last_message_at", { ascending: false })
        .limit(limit)
        .returns<LeadRow[]>();
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
  };
}
