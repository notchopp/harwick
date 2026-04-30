import type { OperationsFailureItem } from "@realty-ops/core";
import type { FailureOperationsRepository } from "../../features/operations/failure-operations";
import type { CrmSyncLogRow, ProviderErrorLogRow } from "./database.types";
import type { RealtyOpsSupabaseClient } from "./server-client";
import type { WorkflowJobRow } from "./workflow-jobs";

function mapWorkflowJob(row: WorkflowJobRow): OperationsFailureItem {
  return {
    id: `workflow_job:${row.id}`,
    workspaceId: row.workspace_id,
    itemType: "workflow_job",
    title: `${row.job_type} ${row.status}`,
    detail: row.last_error_message,
    status: row.status,
    retryable: row.attempt_count < row.max_attempts,
    occurredAt: row.updated_at,
    provider: "worker",
    operation: row.job_type,
  };
}

function mapCrmSync(row: CrmSyncLogRow): OperationsFailureItem {
  return {
    id: `crm_sync:${row.id}`,
    workspaceId: row.workspace_id,
    itemType: "crm_sync",
    title: `Follow Up Boss sync ${row.status}`,
    detail: row.last_error_message,
    status: row.status,
    retryable: true,
    occurredAt: row.updated_at,
    provider: row.provider,
    operation: "fub_sync",
  };
}

function mapProviderError(row: ProviderErrorLogRow): OperationsFailureItem {
  return {
    id: `provider_error:${row.id}`,
    workspaceId: row.workspace_id,
    itemType: "provider_error",
    title: `${row.provider} ${row.operation}`,
    detail: row.error_message,
    status: row.error_code,
    retryable: row.retryable,
    occurredAt: row.created_at,
    provider: row.provider,
    operation: row.operation,
  };
}

export function createSupabaseFailureOperationsRepository(
  supabase: RealtyOpsSupabaseClient,
): FailureOperationsRepository {
  return {
    async listFailedWorkflowJobs(params) {
      const { data, error } = await supabase
        .from("workflow_jobs")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .eq("status", "failed")
        .order("updated_at", { ascending: false })
        .limit(params.limit)
        .returns<WorkflowJobRow[]>();

      if (error !== null) {
        throw error;
      }

      return (data ?? []).map(mapWorkflowJob);
    },

    async listStuckWorkflowJobs(params) {
      const { data, error } = await supabase
        .from("workflow_jobs")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .eq("status", "processing")
        .lte("locked_at", params.staleBefore)
        .order("locked_at", { ascending: true })
        .limit(params.limit)
        .returns<WorkflowJobRow[]>();

      if (error !== null) {
        throw error;
      }

      return (data ?? []).map((row) => ({
        ...mapWorkflowJob(row),
        title: `${row.job_type} stuck`,
        detail: row.last_error_message ?? `Locked by ${row.locked_by ?? "unknown worker"}`,
        retryable: true,
      }));
    },

    async listFailedCrmSyncs(params) {
      const { data, error } = await supabase
        .from("crm_sync_logs")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .eq("status", "failed")
        .order("updated_at", { ascending: false })
        .limit(params.limit)
        .returns<CrmSyncLogRow[]>();

      if (error !== null) {
        throw error;
      }

      return (data ?? []).map(mapCrmSync);
    },

    async listProviderErrors(params) {
      const { data, error } = await supabase
        .from("provider_error_logs")
        .select("*")
        .or(`workspace_id.eq.${params.workspaceId},workspace_id.is.null`)
        .order("created_at", { ascending: false })
        .limit(params.limit)
        .returns<ProviderErrorLogRow[]>();

      if (error !== null) {
        throw error;
      }

      return (data ?? []).map(mapProviderError);
    },

    async retryWorkflowJob(params) {
      const { data, error } = await supabase
        .from("workflow_jobs")
        .update({
          status: "queued",
          run_after: new Date().toISOString(),
          locked_at: null,
          locked_by: null,
          last_error_code: null,
          last_error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.jobId)
        .select("*")
        .maybeSingle<WorkflowJobRow>();

      if (error !== null) {
        throw error;
      }

      return data === null ? null : mapWorkflowJob(data);
    },

    async dismissWorkflowJob(params) {
      const { data, error } = await supabase
        .from("workflow_jobs")
        .update({
          status: "skipped",
          locked_at: null,
          locked_by: null,
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.jobId)
        .select("*")
        .maybeSingle<WorkflowJobRow>();

      if (error !== null) {
        throw error;
      }

      return data === null ? null : mapWorkflowJob(data);
    },

    async retryCrmSync(params) {
      const { data: syncLog, error: syncError } = await supabase
        .from("crm_sync_logs")
        .update({
          status: "queued",
          next_retry_at: new Date().toISOString(),
          last_error_code: null,
          last_error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.syncLogId)
        .select("*")
        .maybeSingle<CrmSyncLogRow>();

      if (syncError !== null) {
        throw syncError;
      }
      if (syncLog === null) {
        return null;
      }

      const { error: jobError } = await supabase
        .from("workflow_jobs")
        .upsert({
          workspace_id: syncLog.workspace_id,
          lead_id: syncLog.lead_id,
          lead_event_id: null,
          job_type: "fub_sync",
          payload: {
            jobType: "fub_sync",
            workspaceId: syncLog.workspace_id,
            leadId: syncLog.lead_id,
            qualifiedOnly: true,
          },
          idempotency_key: `fub_sync:retry:${syncLog.id}`,
          run_after: new Date().toISOString(),
        }, {
          onConflict: "workspace_id,idempotency_key",
        });

      if (jobError !== null) {
        throw jobError;
      }

      return mapCrmSync(syncLog);
    },
  };
}
