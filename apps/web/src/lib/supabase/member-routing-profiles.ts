import {
  AgentRoutingProfileSchema,
  type AgentRoutingProfile,
  type RoutingCalendarStatus,
  type RoutingPropertyType,
  type ShowingMode,
} from "@realty-ops/core";
import type {
  MemberRoutingProfileInsertRow,
  MemberRoutingProfileRow,
  MemberRoutingProfileUpdateRow,
} from "./database.types";
import type { RealtyOpsSupabaseClient } from "./server-client";

export type MemberRoutingProfileRepository = {
  findProfileByMemberId(params: {
    workspaceId: string;
    memberId: string;
  }): Promise<MemberRoutingProfileRow | null>;

  listProfilesForWorkspace(workspaceId: string): Promise<MemberRoutingProfileRow[]>;

  insertProfile(row: MemberRoutingProfileInsertRow): Promise<MemberRoutingProfileRow>;

  updateProfile(params: {
    workspaceId: string;
    memberId: string;
    row: MemberRoutingProfileUpdateRow;
  }): Promise<MemberRoutingProfileRow>;

  deleteProfile(params: {
    workspaceId: string;
    memberId: string;
  }): Promise<void>;
};

export function mapRowToAgentRoutingProfile(params: {
  profile: MemberRoutingProfileRow;
  displayName: string;
  activeLeadCount: number;
  calendarStatus?: RoutingCalendarStatus;
  showingMode?: ShowingMode | null;
}): AgentRoutingProfile {
  return AgentRoutingProfileSchema.parse({
    memberId: params.profile.member_id,
    displayName: params.displayName,
    roleLabel: params.profile.role_label,
    areas: params.profile.areas,
    propertyTypes: params.profile.property_types as RoutingPropertyType[],
    leadTypes: params.profile.lead_types.filter((lt: string): lt is "buyer" | "seller" | "renter" | "investor" =>
      lt !== "unknown"
    ),
    budgetMin: params.profile.budget_min,
    budgetMax: params.profile.budget_max,
    activeLeadCount: params.activeLeadCount,
    maxActiveLeads: params.profile.max_active_leads,
    acceptsNewLeads: params.profile.accepts_new_leads,
    notificationPreference: params.profile.notification_preference,
    calendarStatus: params.calendarStatus ?? "unknown",
    showingMode: params.showingMode ?? null,
  });
}

export function createSupabaseMemberRoutingProfileRepository(
  supabase: RealtyOpsSupabaseClient,
): MemberRoutingProfileRepository {
  return {
    async findProfileByMemberId(params) {
      const { data, error } = await supabase
        .from("member_routing_profiles")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .eq("member_id", params.memberId)
        .maybeSingle<MemberRoutingProfileRow>();

      if (error !== null) {
        throw error;
      }

      return data;
    },

    async listProfilesForWorkspace(workspaceId) {
      const { data, error } = await supabase
        .from("member_routing_profiles")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true })
        .returns<MemberRoutingProfileRow[]>();

      if (error !== null) {
        throw error;
      }

      return data ?? [];
    },

    async insertProfile(row) {
      const { data, error } = await supabase
        .from("member_routing_profiles")
        .insert(row)
        .select("*")
        .single<MemberRoutingProfileRow>();

      if (error !== null) {
        throw error;
      }

      return data;
    },

    async updateProfile(params) {
      const { data, error } = await supabase
        .from("member_routing_profiles")
        .update({ ...params.row, updated_at: new Date().toISOString() })
        .eq("workspace_id", params.workspaceId)
        .eq("member_id", params.memberId)
        .select("*")
        .single<MemberRoutingProfileRow>();

      if (error !== null) {
        throw error;
      }

      return data;
    },

    async deleteProfile(params) {
      const { error } = await supabase
        .from("member_routing_profiles")
        .delete()
        .eq("workspace_id", params.workspaceId)
        .eq("member_id", params.memberId);

      if (error !== null) {
        throw error;
      }
    },
  };
}
