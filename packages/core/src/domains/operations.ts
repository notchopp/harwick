import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "./common.js";

export const WorkspaceReadinessStatusSchema = z.enum(["ready", "needs_setup", "degraded"]);

export const WorkspaceReadinessItemSchema = z.object({
  key: z.enum(["meta", "follow_up_boss", "voice", "listings", "worker"]),
  status: WorkspaceReadinessStatusSchema,
  label: z.string().trim().min(1),
  detail: z.string().trim().min(1),
  updatedAt: IsoDateTimeSchema.nullable(),
});

export const WorkspaceReadinessSummarySchema = z.object({
  workspaceId: UuidSchema,
  status: WorkspaceReadinessStatusSchema,
  items: z.array(WorkspaceReadinessItemSchema),
});

export const OperationsQueueSummarySchema = z.object({
  workspaceId: UuidSchema,
  openTasks: z.number().int().nonnegative(),
  urgentTasks: z.number().int().nonnegative(),
  failedJobs: z.number().int().nonnegative(),
  stuckJobs: z.number().int().nonnegative(),
  failedCrmSyncs: z.number().int().nonnegative(),
  providerErrors24h: z.number().int().nonnegative(),
  lastWorkerSeenAt: IsoDateTimeSchema.nullable(),
});

export const LeadTimelineItemSchema = z.object({
  id: z.string().trim().min(1),
  workspaceId: UuidSchema,
  leadId: UuidSchema,
  itemType: z.enum(["lead_event", "task", "voice_handoff", "crm_sync", "crm_backsync", "nurture_message"]),
  title: z.string().trim().min(1),
  detail: z.string().trim().min(1).nullable(),
  occurredAt: IsoDateTimeSchema,
  source: z.string().trim().min(1),
  status: z.string().trim().min(1).nullable(),
});

export const LeadTimelineResponseSchema = z.object({
  workspaceId: UuidSchema,
  leadId: UuidSchema,
  items: z.array(LeadTimelineItemSchema),
});

export const OperationsFailureItemSchema = z.object({
  id: z.string().trim().min(1),
  workspaceId: UuidSchema.nullable(),
  itemType: z.enum(["workflow_job", "crm_sync", "provider_error"]),
  title: z.string().trim().min(1),
  detail: z.string().trim().min(1).nullable(),
  status: z.string().trim().min(1),
  retryable: z.boolean(),
  occurredAt: IsoDateTimeSchema,
  provider: z.string().trim().min(1).nullable(),
  operation: z.string().trim().min(1).nullable(),
});

export const OperationsFailureQueueResponseSchema = z.object({
  workspaceId: UuidSchema,
  items: z.array(OperationsFailureItemSchema),
});

export const WorkflowJobActionRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("retry_now") }),
  z.object({ action: z.literal("dismiss") }),
]);

export const CrmSyncActionRequestSchema = z.object({
  action: z.literal("retry_now"),
});

export const FollowUpBossConflictItemSchema = z.object({
  id: z.string().trim().min(1),
  workspaceId: UuidSchema,
  leadId: UuidSchema,
  followUpBossContactId: z.string().trim().min(1),
  assignedAgentId: UuidSchema.nullable(),
  eventType: z.string().trim().min(1),
  status: z.string().trim().min(1),
  detail: z.string().trim().min(1).nullable(),
  occurredAt: IsoDateTimeSchema,
});

export const FollowUpBossConflictQueueResponseSchema = z.object({
  workspaceId: UuidSchema,
  items: z.array(FollowUpBossConflictItemSchema),
});

export type WorkspaceReadinessStatus = z.infer<typeof WorkspaceReadinessStatusSchema>;
export type WorkspaceReadinessItem = z.infer<typeof WorkspaceReadinessItemSchema>;
export type WorkspaceReadinessSummary = z.infer<typeof WorkspaceReadinessSummarySchema>;
export type OperationsQueueSummary = z.infer<typeof OperationsQueueSummarySchema>;
export type LeadTimelineItem = z.infer<typeof LeadTimelineItemSchema>;
export type LeadTimelineResponse = z.infer<typeof LeadTimelineResponseSchema>;
export type OperationsFailureItem = z.infer<typeof OperationsFailureItemSchema>;
export type OperationsFailureQueueResponse = z.infer<typeof OperationsFailureQueueResponseSchema>;
export type WorkflowJobActionRequest = z.infer<typeof WorkflowJobActionRequestSchema>;
export type CrmSyncActionRequest = z.infer<typeof CrmSyncActionRequestSchema>;
export type FollowUpBossConflictItem = z.infer<typeof FollowUpBossConflictItemSchema>;
export type FollowUpBossConflictQueueResponse = z.infer<typeof FollowUpBossConflictQueueResponseSchema>;
