import type { WorkspaceActivityRepository } from "../../features/activity/activity-data";
import type { Tables } from "./database.types";
import type { RealtyOpsSupabaseClient } from "./server-client";

type WorkflowJobRow = Tables<"workflow_jobs">;

export function createSupabaseWorkspaceActivityRepository(
  supabase: RealtyOpsSupabaseClient,
): WorkspaceActivityRepository {
  return {
    async listLeadEvents(params) {
      const { data, error } = await supabase
        .from("lead_events")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .order("occurred_at", { ascending: false })
        .limit(params.limit);
      if (error !== null) throw error;
      return data ?? [];
    },

    async listAuditLogs(params) {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .order("created_at", { ascending: false })
        .limit(params.limit);
      if (error !== null) throw error;
      return data ?? [];
    },

    async listWorkflowJobs(params) {
      const { data, error } = await supabase
        .from("workflow_jobs")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .order("updated_at", { ascending: false })
        .limit(params.limit)
        .returns<WorkflowJobRow[]>();
      if (error !== null) throw error;
      return data ?? [];
    },

    async listCrmSyncLogs(params) {
      const { data, error } = await supabase
        .from("crm_sync_logs")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .order("updated_at", { ascending: false })
        .limit(params.limit);
      if (error !== null) throw error;
      return data ?? [];
    },

    async listProviderErrors(params) {
      const { data, error } = await supabase
        .from("provider_error_logs")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .order("created_at", { ascending: false })
        .limit(params.limit);
      if (error !== null) throw error;
      return data ?? [];
    },
  };
}
