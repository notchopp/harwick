import type {
  ShowingApprovalLead,
  ShowingApprovalRepository,
  ShowingApprovalTask,
} from "../../features/calendar/showing-approval-actions";
import type { RealtyOpsSupabaseClient } from "./server-client";

type ShowingTaskRow = {
  id: string;
  workspace_id: string;
  lead_id: string | null;
  listing_id: string | null;
  task_type: string;
  status: string;
  title: string;
  description: string | null;
  assigned_member_id: string | null;
  requested_start_at: string | null;
  requested_end_at: string | null;
};

type ShowingLeadRow = {
  id: string;
  assigned_agent_id: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
};

function mapTask(row: ShowingTaskRow): ShowingApprovalTask {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    leadId: row.lead_id,
    listingId: row.listing_id,
    taskType: row.task_type,
    status: row.status,
    title: row.title,
    description: row.description,
    assignedMemberId: row.assigned_member_id,
    requestedStartAt: row.requested_start_at,
    requestedEndAt: row.requested_end_at,
  };
}

function mapLead(row: ShowingLeadRow): ShowingApprovalLead {
  return {
    id: row.id,
    assignedAgentId: row.assigned_agent_id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
  };
}

export function createSupabaseShowingApprovalRepository(
  supabase: RealtyOpsSupabaseClient,
): ShowingApprovalRepository {
  return {
    async findShowingTask(params) {
      const { data, error } = await supabase
        .from("lead_tasks")
        .select("id, workspace_id, lead_id, listing_id, task_type, status, title, description, assigned_member_id, requested_start_at, requested_end_at")
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.taskId)
        .in("task_type", ["request_showing_approval", "showing_approval"])
        .maybeSingle<ShowingTaskRow>();

      if (error !== null) {
        throw error;
      }

      return data === null ? null : mapTask(data);
    },

    async findLead(params) {
      const { data, error } = await supabase
        .from("leads")
        .select("id, assigned_agent_id, full_name, email, phone")
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.leadId)
        .maybeSingle<ShowingLeadRow>();

      if (error !== null) {
        throw error;
      }

      return data === null ? null : mapLead(data);
    },

    async completeShowingTask(params) {
      const { error } = await supabase
        .from("lead_tasks")
        .update({
          status: "completed",
          requested_start_at: params.start,
          requested_end_at: params.end,
          calendar_provider: params.calendarProvider,
          calendar_id: params.calendarId,
          calendar_event_id: params.calendarEventId,
          approved_by_member_id: params.approvedByMemberId,
          approved_at: params.approvedAt,
          updated_at: params.approvedAt,
        })
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.taskId);

      if (error !== null) {
        throw error;
      }
    },

    async dismissShowingTask(params) {
      const { error } = await supabase
        .from("lead_tasks")
        .update({
          status: "dismissed",
          description: `Dismissed: ${params.reason}`,
          updated_at: params.dismissedAt,
        })
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.taskId);

      if (error !== null) {
        throw error;
      }
    },

    async markLeadAppointmentBooked(params) {
      const { error } = await supabase
        .from("leads")
        .update({
          status: "appointment_booked",
          updated_at: params.updatedAt,
        })
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.leadId);

      if (error !== null) {
        throw error;
      }
    },
  };
}
