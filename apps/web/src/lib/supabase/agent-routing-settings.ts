import type { RealtyOpsSupabaseClient } from "./server-client";

export type AgentRoutingSettingsRow = {
  id: string;
  workspace_id: string;
  member_id: string;
  territories: string[];
  specializations: string[];
  min_budget: number | null;
  max_budget: number | null;
  max_active_leads: number;
  auto_assign_enabled: boolean;
  auto_reply_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type AgentRoutingSettingsInsertRow = Omit<
  AgentRoutingSettingsRow,
  "id" | "created_at" | "updated_at"
> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type AgentRoutingSettingsRepository = {
  getByMemberId(workspaceId: string, memberId: string): Promise<AgentRoutingSettingsRow | null>;
  getByWorkspaceId(workspaceId: string): Promise<AgentRoutingSettingsRow[]>;
  upsert(row: AgentRoutingSettingsInsertRow): Promise<AgentRoutingSettingsRow>;
  update(id: string, partial: Partial<AgentRoutingSettingsRow>): Promise<AgentRoutingSettingsRow>;
};

export function createSupabaseAgentRoutingSettingsRepository(
  supabase: RealtyOpsSupabaseClient,
): AgentRoutingSettingsRepository {
  return {
    async getByMemberId(workspaceId, memberId) {
      const { data, error } = await supabase
        .from("agent_routing_settings")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("member_id", memberId)
        .maybeSingle<AgentRoutingSettingsRow>();

      if (error !== null) {
        throw error;
      }

      return data;
    },

    async getByWorkspaceId(workspaceId) {
      const { data, error } = await supabase
        .from("agent_routing_settings")
        .select("*")
        .eq("workspace_id", workspaceId);

      if (error !== null) {
        throw error;
      }

      return (data ?? []);
    },

    async upsert(row) {
      const { data, error } = await supabase
        .from("agent_routing_settings")
        .upsert([row], {
          onConflict: "workspace_id,member_id",
        })
        .select("*")
        .single<AgentRoutingSettingsRow>();

      if (error !== null) {
        throw error;
      }

      return data;
    },

    async update(id, partial) {
      const updatePayload = {
        ...partial,
        updated_at: new Date().toISOString(),
      } as unknown as Partial<AgentRoutingSettingsRow>;

      const { data, error } = await supabase
        .from("agent_routing_settings")
        .update(updatePayload)
        .eq("id", id)
        .select("*")
        .single<AgentRoutingSettingsRow>();

      if (error !== null) {
        throw error;
      }

      return data;
    },
  };
}
