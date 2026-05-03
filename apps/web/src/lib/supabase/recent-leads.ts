import type { RecentLeadsRepository } from "../../features/home/recent-leads";
import type { LeadRow } from "./leads";
import type { RealtyOpsSupabaseClient } from "./server-client";

export function createSupabaseRecentLeadsRepository(
  supabase: RealtyOpsSupabaseClient,
): RecentLeadsRepository {
  return {
    async listRecentLeads(params) {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .neq("status", "archived")
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("updated_at", { ascending: false })
        .limit(params.limit)
        .returns<LeadRow[]>();

      if (error !== null) {
        throw error;
      }

      return data ?? [];
    },

    async findMembersDisplayNamesByIds(params) {
      if (params.memberIds.length === 0) {
        return new Map<string, string>();
      }

      const { data, error } = await supabase
        .from("workspace_members")
        .select("id, display_name")
        .eq("workspace_id", params.workspaceId)
        .in("id", params.memberIds)
        .returns<Array<{ id: string; display_name: string }>>();

      if (error !== null) {
        throw error;
      }

      const map = new Map<string, string>();
      for (const row of data ?? []) {
        map.set(row.id, row.display_name);
      }
      return map;
    },
  };
}
