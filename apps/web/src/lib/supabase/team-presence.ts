import type { TeamPresenceRepository, WorkspaceMemberPresenceRow } from "../../features/home/team-presence";
import type { RealtyOpsSupabaseClient } from "./server-client";

type CountRow = {
  assigned_agent_id?: string | null;
  assigned_member_id?: string | null;
};

function incrementCount(counts: Map<string, number>, memberId: string | null | undefined) {
  if (memberId === null || memberId === undefined) {
    return;
  }
  counts.set(memberId, (counts.get(memberId) ?? 0) + 1);
}

export function createSupabaseTeamPresenceRepository(
  supabase: RealtyOpsSupabaseClient,
): TeamPresenceRepository {
  return {
    async listActiveMembers(workspaceId) {
      const { data, error } = await supabase
        .from("workspace_members")
        .select("id,workspace_id,role,display_name,avatar_url,role_label,presence_status,presence_last_seen_at")
        .eq("workspace_id", workspaceId)
        .eq("is_active", true)
        .order("presence_last_seen_at", { ascending: false })
        .returns<WorkspaceMemberPresenceRow[]>();

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
        .in("status", ["new", "engaged", "qualified", "hot", "assigned", "nurture", "appointment_booked"])
        .not("assigned_agent_id", "is", null)
        .returns<CountRow[]>();

      if (error !== null) {
        throw error;
      }

      const counts = new Map<string, number>();
      for (const row of data ?? []) {
        incrementCount(counts, row.assigned_agent_id);
      }
      return counts;
    },

    async countOpenWorkByMember(workspaceId) {
      const { data, error } = await supabase
        .from("lead_tasks")
        .select("assigned_member_id")
        .eq("workspace_id", workspaceId)
        .in("status", ["open", "in_progress"])
        .not("assigned_member_id", "is", null)
        .returns<CountRow[]>();

      if (error !== null) {
        throw error;
      }

      const counts = new Map<string, number>();
      for (const row of data ?? []) {
        incrementCount(counts, row.assigned_member_id);
      }
      return counts;
    },
  };
}
