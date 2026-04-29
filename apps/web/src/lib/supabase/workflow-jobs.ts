import type {
  EnqueueWorkflowJobInput,
  WorkflowJobPayload,
  WorkflowJobType,
} from "@realty-ops/core";
import { EnqueueWorkflowJobInputSchema } from "@realty-ops/core";
import type { RealtyOpsSupabaseClient } from "./server-client";

export type WorkflowJobRow = {
  id: string;
  workspace_id: string;
  lead_id: string | null;
  lead_event_id: string | null;
  job_type: WorkflowJobType;
  status: "queued" | "processing" | "completed" | "failed" | "skipped";
  payload: WorkflowJobPayload;
  idempotency_key: string;
  attempt_count: number;
  max_attempts: number;
  run_after: string;
  locked_at: string | null;
  locked_by: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkflowJobInsertRow = Omit<
  WorkflowJobRow,
  "id" | "status" | "attempt_count" | "max_attempts" | "run_after" | "locked_at" | "locked_by" | "last_error_code" | "last_error_message" | "created_at" | "updated_at"
> & {
  id?: string;
  status?: WorkflowJobRow["status"];
  attempt_count?: number;
  max_attempts?: number;
  run_after?: string;
  locked_at?: string | null;
  locked_by?: string | null;
  last_error_code?: string | null;
  last_error_message?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type WorkflowJobEnqueuer = (input: EnqueueWorkflowJobInput) => Promise<void>;

export function createWorkflowJobEnqueuer(
  supabase: RealtyOpsSupabaseClient,
): WorkflowJobEnqueuer {
  return async (input) => {
    const parsed = EnqueueWorkflowJobInputSchema.parse(input);
    const row: WorkflowJobInsertRow = {
      workspace_id: parsed.workspaceId,
      lead_id: parsed.leadId,
      lead_event_id: parsed.leadEventId,
      job_type: parsed.jobType,
      payload: parsed.payload,
      idempotency_key: parsed.idempotencyKey,
    };
    if (parsed.runAfter !== undefined) {
      row.run_after = parsed.runAfter;
    }

    const { error } = await supabase
      .from("workflow_jobs")
      .upsert(row, {
        onConflict: "workspace_id,idempotency_key",
        ignoreDuplicates: true,
      });

    if (error !== null) {
      throw error;
    }
  };
}
