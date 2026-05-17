import type { RoutingDeskRepository } from "../../features/home/routing-desk";
import type { MemberRoutingProfileRow, WorkspaceMemberRow } from "./database.types";
import type { LeadRow } from "./leads";
import type { RealtyOpsSupabaseClient } from "./server-client";

type CountRow = { assigned_agent_id: string | null };

export function createSupabaseRoutingDeskRepository(
  supabase: RealtyOpsSupabaseClient,
): RoutingDeskRepository {
  return {
    async listLeadsForRouting(params) {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .is("assigned_agent_id", null)
        .neq("status", "archived")
        .neq("status", "closed_lost")
        .neq("status", "closed_won")
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("updated_at", { ascending: false })
        .limit(params.limit)
        .returns<LeadRow[]>();

      if (error !== null) {
        throw error;
      }

      return data ?? [];
    },

    async listMemberRoutingProfiles(workspaceId) {
      const { data, error } = await supabase
        .from("member_routing_profiles")
        .select("*")
        .eq("workspace_id", workspaceId)
        .returns<MemberRoutingProfileRow[]>();

      if (error !== null) {
        throw error;
      }

      return data ?? [];
    },

    async listMembersByIds(params) {
      if (params.memberIds.length === 0) {
        return [];
      }

      const { data, error } = await supabase
        .from("workspace_members")
        .select("id, display_name, role, role_label")
        .eq("workspace_id", params.workspaceId)
        .in("id", params.memberIds)
        .returns<Pick<WorkspaceMemberRow, "id" | "display_name" | "role" | "role_label">[]>();

      if (error !== null) {
        throw error;
      }

      return data ?? [];
    },

    async countActiveLeadsByMember(workspaceId) {
      const { data, error } = await supabase
        .from("leads")
        .select("assigned_agent_id")
        .eq("workspace_id", workspaceId)
        .in("status", [
          "new",
          "engaged",
          "qualified",
          "hot",
          "assigned",
          "nurture",
          "appointment_booked",
        ])
        .not("assigned_agent_id", "is", null)
        .returns<CountRow[]>();

      if (error !== null) {
        throw error;
      }

      const counts = new Map<string, number>();
      for (const row of data ?? []) {
        if (row.assigned_agent_id !== null) {
          counts.set(row.assigned_agent_id, (counts.get(row.assigned_agent_id) ?? 0) + 1);
        }
      }
      return counts;
    },
  };
}
