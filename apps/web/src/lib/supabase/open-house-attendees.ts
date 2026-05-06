import type {
  OpenHouseAttendeeLead,
  OpenHouseAttendeesRepository,
  OpenHouseRegistrationTask,
} from "../../features/public-listings/open-house-attendees";
import type { RealtyOpsSupabaseClient } from "./server-client";

type RegistrationTaskRow = {
  id: string;
  workspace_id: string;
  listing_id: string;
  lead_id: string | null;
  status: string;
  requested_start_at: string | null;
  created_at: string;
};

type AttendeeLeadRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
};

function mapRegistrationTask(row: RegistrationTaskRow): OpenHouseRegistrationTask {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    listingId: row.listing_id,
    leadId: row.lead_id,
    status: row.status,
    requestedArrivalAt: row.requested_start_at,
    createdAt: row.created_at,
  };
}

function mapLead(row: AttendeeLeadRow): OpenHouseAttendeeLead {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
  };
}

export function createSupabaseOpenHouseAttendeesRepository(
  supabase: RealtyOpsSupabaseClient,
): OpenHouseAttendeesRepository {
  return {
    async listRegistrationTasks(params) {
      const { data, error } = await supabase
        .from("lead_tasks")
        .select("id, workspace_id, listing_id, lead_id, status, requested_start_at, created_at")
        .eq("workspace_id", params.workspaceId)
        .eq("listing_id", params.listingId)
        .eq("task_type", "open_house_registration")
        .order("created_at", { ascending: false })
        .limit(params.limit)
        .returns<RegistrationTaskRow[]>();

      if (error !== null) {
        throw error;
      }

      return (data ?? []).map(mapRegistrationTask);
    },

    async listLeads(params) {
      if (params.leadIds.length === 0) {
        return [];
      }

      const { data, error } = await supabase
        .from("leads")
        .select("id, full_name, email, phone")
        .eq("workspace_id", params.workspaceId)
        .in("id", params.leadIds)
        .returns<AttendeeLeadRow[]>();

      if (error !== null) {
        throw error;
      }

      return (data ?? []).map(mapLead);
    },
  };
}
