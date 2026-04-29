import type { RealtyOpsSupabaseClient } from "./server-client";
import type { VerifyListingTaskRepository } from "../../features/tasks/verify-listing-task";

type LeadAssignmentRow = {
  assigned_agent_id: string | null;
};

type LeadTaskRow = {
  id: string;
  workspace_id: string;
  lead_id: string;
  task_type: "call_back" | "verify_listing" | "assign_lead" | "fub_retry" | "nurture_review";
  status: "open" | "in_progress" | "completed" | "dismissed";
  priority: "low" | "normal" | "high" | "urgent";
  title: string;
  description: string | null;
  assigned_member_id: string | null;
  updated_at: string;
};

export function createSupabaseVerifyListingTaskRepository(
  supabase: RealtyOpsSupabaseClient,
): VerifyListingTaskRepository {
  return {
    async findLead(params) {
      const { data, error } = await supabase
        .from("leads")
        .select("assigned_agent_id")
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.leadId)
        .maybeSingle<LeadAssignmentRow>();

      if (error !== null) {
        throw error;
      }

      if (data === null) {
        return null;
      }

      return {
        assignedMemberId: data.assigned_agent_id,
      };
    },

    async findOpenVerifyListingTask(params) {
      const { data, error } = await supabase
        .from("lead_tasks")
        .select("id")
        .eq("workspace_id", params.workspaceId)
        .eq("lead_id", params.leadId)
        .eq("task_type", "verify_listing")
        .in("status", ["open", "in_progress"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle<Pick<LeadTaskRow, "id">>();

      if (error !== null) {
        throw error;
      }

      return data ?? null;
    },

    async insertVerifyListingTask(params) {
      const { error } = await supabase
        .from("lead_tasks")
        .insert({
          workspace_id: params.workspaceId,
          lead_id: params.leadId,
          task_type: "verify_listing",
          priority: params.priority,
          title: params.title,
          description: params.description,
          assigned_member_id: params.assignedMemberId,
        });

      if (error !== null) {
        throw error;
      }
    },

    async updateVerifyListingTask(params) {
      const { error } = await supabase
        .from("lead_tasks")
        .update({
          priority: params.priority,
          title: params.title,
          description: params.description,
          assigned_member_id: params.assignedMemberId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", params.taskId);

      if (error !== null) {
        throw error;
      }
    },
  };
}
