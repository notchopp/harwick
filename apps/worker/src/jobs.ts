import {
  decideLeadWorkflow,
  WorkflowJobSchema,
  type WorkflowJob,
  type WorkflowJobPayload,
  type WorkflowJobStatus,
} from "@realty-ops/core";

export type WorkerJobRow = {
  id: string;
  workspace_id: string;
  lead_id: string | null;
  lead_event_id: string | null;
  job_type: string;
  status: string;
  payload: unknown;
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

export type WorkerJobResult = {
  status: Extract<WorkflowJobStatus, "completed" | "skipped">;
  message: string;
};

export type LeadWorkflowContext = {
  leadId: string;
  workspaceId: string;
  sourceChannel: "instagram_dm" | "instagram_comment" | "facebook_dm" | "facebook_comment" | "call" | "sms" | "manual" | "csv_import";
  leadType: "buyer" | "seller" | "renter" | "investor" | "unknown";
  intent: "high" | "medium" | "low" | "spam" | "unknown";
  timeline: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  targetArea: string | null;
  financingStatus: "preapproved" | "cash" | "needs_lender" | "unknown";
  currentScore: number;
  currentStatus: "new" | "engaged" | "qualified" | "hot" | "assigned" | "nurture" | "appointment_booked" | "active_client" | "closed_won" | "closed_lost" | "archived";
  assignedAgentId: string | null;
  engagementCount: number;
  latestText: string | null;
};

export type WorkflowJobServices = {
  getLeadWorkflowContext(leadId: string): Promise<LeadWorkflowContext | null>;
  updateLeadWorkflowDecision(params: {
    leadId: string;
    score: number;
    intent: LeadWorkflowContext["intent"];
    status: LeadWorkflowContext["currentStatus"];
  }): Promise<void>;
  assignLead(params: {
    workspaceId: string;
    leadId: string;
  }): Promise<string | null>;
  createHandoffTask(params: {
    workspaceId: string;
    leadId: string;
    priority: "normal" | "high" | "urgent";
    title: string;
    description: string;
    assignedMemberId: string | null;
  }): Promise<void>;
  enqueueFubSync(params: {
    workspaceId: string;
    leadId: string;
  }): Promise<void>;
  enrollNurture(params: {
    workspaceId: string;
    leadId: string;
  }): Promise<void>;
  syncLeadToFub?(params: {
    workspaceId: string;
    leadId: string;
  }): Promise<string | null>;
  reconcileFubBacksyncEvent?(params: {
    workspaceId: string;
    backsyncEventId: string;
  }): Promise<void>;
  processNurtureDelivery?(params: {
    workspaceId: string;
    leadId: string;
    enrollmentId: string;
  }): Promise<string>;
  processListingRecheck?(params: {
    workspaceId: string;
    listingId: string;
  }): Promise<string>;
};

function toWorkflowJob(row: WorkerJobRow): WorkflowJob {
  const payload = row.payload && typeof row.payload === "object"
    ? row.payload as WorkflowJobPayload
    : {};

  return WorkflowJobSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    leadId: row.lead_id,
    leadEventId: row.lead_event_id,
    jobType: row.job_type,
    status: row.status,
    payload,
    idempotencyKey: row.idempotency_key,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    runAfter: row.run_after,
    lockedAt: row.locked_at,
    lockedBy: row.locked_by,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function parseWorkerJobRows(rows: WorkerJobRow[]): WorkflowJob[] {
  return rows.map((row) => toWorkflowJob(row));
}

export async function handleWorkflowJob(
  job: WorkflowJob,
  services?: WorkflowJobServices,
): Promise<WorkerJobResult> {
  switch (job.payload.jobType) {
    case "lead_intake":
      return {
        status: "completed",
        message: `accepted ${job.payload.source} intake for downstream qualification`,
      };
    case "lead_qualification":
      if (services === undefined || job.payload.leadId === undefined) {
        return {
          status: "skipped",
          message: "qualification skipped because lead services or lead id are missing",
        };
      }

      {
        const lead = await services.getLeadWorkflowContext(job.payload.leadId);
        if (lead === null) {
          return {
            status: "skipped",
            message: "qualification skipped because lead was not found",
          };
        }

        const decision = decideLeadWorkflow(lead);
        await services.updateLeadWorkflowDecision({
          leadId: lead.leadId,
          score: decision.score,
          intent: decision.intent,
          status: decision.status,
        });
        const assignedMemberId = decision.shouldAssign
          ? await services.assignLead({
              workspaceId: lead.workspaceId,
              leadId: lead.leadId,
            })
          : lead.assignedAgentId;

        if (decision.shouldCreateHandoffTask) {
          await services.createHandoffTask({
            workspaceId: lead.workspaceId,
            leadId: lead.leadId,
            priority: decision.status === "hot" ? "urgent" : "high",
            title: decision.status === "hot" ? "Hot lead needs follow-up" : "Qualified lead needs follow-up",
            description: decision.reasons.join("; "),
            assignedMemberId,
          });
        }

        if (decision.shouldSyncToFub) {
          await services.enqueueFubSync({
            workspaceId: lead.workspaceId,
            leadId: lead.leadId,
          });
        }

        if (decision.shouldEnrollNurture) {
          await services.enrollNurture({
            workspaceId: lead.workspaceId,
            leadId: lead.leadId,
          });
        }

        return {
          status: "completed",
          message: `qualified lead at ${decision.score} with status ${decision.status}`,
        };
      }
    case "lead_assignment":
      return {
        status: "completed",
        message: `assignment decision accepted for ${job.payload.reason}`,
      };
    case "fub_sync":
      if (services?.syncLeadToFub === undefined || job.payload.leadId === undefined) {
        return {
          status: "skipped",
          message: "Follow Up Boss client is not configured in the worker yet",
        };
      }

      {
        const providerContactId = await services.syncLeadToFub({
          workspaceId: job.payload.workspaceId,
          leadId: job.payload.leadId,
        });
        return {
          status: "completed",
          message: providerContactId === null
            ? "Follow Up Boss accepted the lead event without a response body"
            : `Follow Up Boss synced contact ${providerContactId}`,
        };
      }
    case "fub_backsync_reconcile":
      if (services?.reconcileFubBacksyncEvent === undefined) {
        return {
          status: "skipped",
          message: "Follow Up Boss backsync reconciliation is not configured in the worker yet",
        };
      }

      await services.reconcileFubBacksyncEvent({
        workspaceId: job.payload.workspaceId,
        backsyncEventId: job.payload.backsyncEventId,
      });
      return {
        status: "completed",
        message: `reconciled Follow Up Boss backsync event ${job.payload.backsyncEventId}`,
      };
    case "handoff_task":
      return {
        status: "completed",
        message: `handoff task accepted from ${job.payload.source}`,
      };
    case "listing_recheck":
      if (services?.processListingRecheck === undefined) {
        return {
          status: "skipped",
          message: "listing recheck skipped because listing services are missing",
        };
      }

      return {
        status: "completed",
        message: await services.processListingRecheck({
          workspaceId: job.payload.workspaceId,
          listingId: job.payload.listingId,
        }),
      };
    case "nurture_delivery":
      if (services?.processNurtureDelivery === undefined || job.payload.leadId === undefined) {
        return {
          status: "skipped",
          message: "nurture delivery skipped because services or lead id are missing",
        };
      }

      return {
        status: "completed",
        message: await services.processNurtureDelivery({
          workspaceId: job.payload.workspaceId,
          leadId: job.payload.leadId,
          enrollmentId: job.payload.enrollmentId,
        }),
      };
  }
}
