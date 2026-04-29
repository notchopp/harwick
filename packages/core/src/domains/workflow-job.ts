import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "./common.js";

export const WorkflowJobTypeSchema = z.enum([
  "lead_intake",
  "lead_qualification",
  "lead_assignment",
  "fub_sync",
  "fub_backsync_reconcile",
  "handoff_task",
]);

export const WorkflowJobStatusSchema = z.enum([
  "queued",
  "processing",
  "completed",
  "failed",
  "skipped",
]);

const WorkflowJobPayloadBaseSchema = z.object({
  workspaceId: UuidSchema,
  leadId: UuidSchema.optional(),
  leadEventId: UuidSchema.optional(),
});

export const LeadIntakeJobPayloadSchema = WorkflowJobPayloadBaseSchema.extend({
  jobType: z.literal("lead_intake"),
  source: z.enum(["instagram", "facebook", "retell", "sms", "manual"]),
});

export const LeadQualificationJobPayloadSchema = WorkflowJobPayloadBaseSchema.extend({
  jobType: z.literal("lead_qualification"),
  reason: z.enum(["new_event", "post_call_analysis", "manual_review", "crm_backsync_activity"]),
});

export const LeadAssignmentJobPayloadSchema = WorkflowJobPayloadBaseSchema.extend({
  jobType: z.literal("lead_assignment"),
  reason: z.enum(["qualified", "hot", "manual_rebalance"]),
});

export const FubSyncJobPayloadSchema = WorkflowJobPayloadBaseSchema.extend({
  jobType: z.literal("fub_sync"),
  qualifiedOnly: z.literal(true),
});

export const FubBacksyncReconcileJobPayloadSchema = WorkflowJobPayloadBaseSchema.extend({
  jobType: z.literal("fub_backsync_reconcile"),
  backsyncEventId: UuidSchema,
});

export const HandoffTaskJobPayloadSchema = WorkflowJobPayloadBaseSchema.extend({
  jobType: z.literal("handoff_task"),
  source: z.enum(["voice", "instagram", "facebook", "sms", "manual"]),
});

export const WorkflowJobPayloadSchema = z.discriminatedUnion("jobType", [
  LeadIntakeJobPayloadSchema,
  LeadQualificationJobPayloadSchema,
  LeadAssignmentJobPayloadSchema,
  FubSyncJobPayloadSchema,
  FubBacksyncReconcileJobPayloadSchema,
  HandoffTaskJobPayloadSchema,
]);

export const EnqueueWorkflowJobInputSchema = z.object({
  workspaceId: UuidSchema,
  leadId: UuidSchema.nullable().default(null),
  leadEventId: UuidSchema.nullable().default(null),
  jobType: WorkflowJobTypeSchema,
  payload: WorkflowJobPayloadSchema,
  idempotencyKey: z.string().trim().min(1).max(240),
  runAfter: IsoDateTimeSchema.optional(),
});

export const WorkflowJobSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  leadId: UuidSchema.nullable(),
  leadEventId: UuidSchema.nullable(),
  jobType: WorkflowJobTypeSchema,
  status: WorkflowJobStatusSchema,
  payload: WorkflowJobPayloadSchema,
  idempotencyKey: z.string().trim().min(1),
  attemptCount: z.number().int().min(0),
  maxAttempts: z.number().int().min(1),
  runAfter: IsoDateTimeSchema,
  lockedAt: IsoDateTimeSchema.nullable(),
  lockedBy: z.string().trim().min(1).nullable(),
  lastErrorCode: z.string().trim().min(1).nullable(),
  lastErrorMessage: z.string().trim().min(1).nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export type WorkflowJobType = z.infer<typeof WorkflowJobTypeSchema>;
export type WorkflowJobStatus = z.infer<typeof WorkflowJobStatusSchema>;
export type WorkflowJobPayload = z.infer<typeof WorkflowJobPayloadSchema>;
export type EnqueueWorkflowJobInput = z.infer<typeof EnqueueWorkflowJobInputSchema>;
export type WorkflowJob = z.infer<typeof WorkflowJobSchema>;
