import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "./common.js";

export const HarwickLoopStatusSchema = z.enum(["active", "paused", "archived"]);
export const HarwickLoopTriggerTypeSchema = z.enum(["schedule", "event"]);
export const HarwickLoopApprovalModeSchema = z.enum([
  "suggest_only",
  "approval_required",
  "auto_execute",
]);
export const HarwickLoopOutputModeSchema = z.enum([
  "work_item",
  "draft",
  "agent_loop",
]);
export const HarwickLoopRunStatusSchema = z.enum(["running", "completed", "failed"]);

function validateLoopTrigger(
  value: { triggerType: HarwickLoopTriggerType; scheduleSpec: string | null; eventType: string | null },
  context: z.RefinementCtx,
) {
  if (value.triggerType === "schedule" && value.scheduleSpec === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["scheduleSpec"],
      message: "Scheduled Harwick loops require a scheduleSpec.",
    });
  }

  if (value.triggerType === "event" && value.eventType === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["eventType"],
      message: "Event-triggered Harwick loops require an eventType.",
    });
  }
}

const HarwickLoopBaseFieldsSchema = z.object({
  workspaceId: UuidSchema,
  createdByMemberId: UuidSchema.nullable(),
  ownerMemberId: UuidSchema.nullable().default(null),
  name: z.string().trim().min(1).max(120),
  instruction: z.string().trim().min(1).max(4000),
  triggerType: HarwickLoopTriggerTypeSchema,
  scheduleSpec: z.string().trim().min(1).max(240).nullable(),
  eventType: z.string().trim().min(1).max(120).nullable(),
  status: HarwickLoopStatusSchema,
  approvalMode: HarwickLoopApprovalModeSchema,
  outputMode: HarwickLoopOutputModeSchema,
  toolAllowlist: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  nextRunAt: IsoDateTimeSchema.nullable(),
  lastRunAt: IsoDateTimeSchema.nullable(),
  lastRunStatus: HarwickLoopRunStatusSchema.nullable(),
});

export const HarwickLoopSchema = HarwickLoopBaseFieldsSchema.extend({
  id: UuidSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
}).superRefine(validateLoopTrigger);

export const HarwickLoopCreateSchema = HarwickLoopBaseFieldsSchema.extend({
  status: HarwickLoopStatusSchema.default("active"),
  approvalMode: HarwickLoopApprovalModeSchema.default("approval_required"),
  outputMode: HarwickLoopOutputModeSchema.default("work_item"),
  toolAllowlist: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  nextRunAt: IsoDateTimeSchema.nullable().default(null),
  lastRunAt: IsoDateTimeSchema.nullable().default(null),
  lastRunStatus: HarwickLoopRunStatusSchema.nullable().default(null),
}).superRefine(validateLoopTrigger);

export const HarwickLoopCreateRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  instruction: z.string().trim().min(1).max(4000),
  ownerMemberId: UuidSchema.nullable().default(null),
  triggerType: HarwickLoopTriggerTypeSchema.default("schedule"),
  scheduleSpec: z.string().trim().min(1).max(240).nullable().default(null),
  eventType: z.string().trim().min(1).max(120).nullable().default(null),
  status: HarwickLoopStatusSchema.default("active"),
  approvalMode: HarwickLoopApprovalModeSchema.default("approval_required"),
  outputMode: HarwickLoopOutputModeSchema.default("work_item"),
  toolAllowlist: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  nextRunAt: IsoDateTimeSchema.nullable().default(null),
});

export const HarwickLoopUpdateRequestSchema = HarwickLoopCreateRequestSchema.partial().extend({
  status: HarwickLoopStatusSchema.optional(),
});

export const HarwickLoopListResponseSchema = z.object({
  loops: z.array(HarwickLoopSchema),
});

export const HarwickLoopRunSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  loopId: UuidSchema,
  status: HarwickLoopRunStatusSchema,
  startedAt: IsoDateTimeSchema,
  completedAt: IsoDateTimeSchema.nullable(),
  instructionSnapshot: z.string().trim().min(1).max(4000),
  resultSummary: z.string().trim().min(1).max(1000).nullable(),
  errorMessage: z.string().trim().min(1).max(1000).nullable(),
  workItemId: UuidSchema.nullable(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type HarwickLoopStatus = z.infer<typeof HarwickLoopStatusSchema>;
export type HarwickLoopTriggerType = z.infer<typeof HarwickLoopTriggerTypeSchema>;
export type HarwickLoopApprovalMode = z.infer<typeof HarwickLoopApprovalModeSchema>;
export type HarwickLoopOutputMode = z.infer<typeof HarwickLoopOutputModeSchema>;
export type HarwickLoopRunStatus = z.infer<typeof HarwickLoopRunStatusSchema>;
export type HarwickLoop = z.infer<typeof HarwickLoopSchema>;
export type HarwickLoopCreate = z.infer<typeof HarwickLoopCreateSchema>;
export type HarwickLoopCreateRequest = z.infer<typeof HarwickLoopCreateRequestSchema>;
export type HarwickLoopUpdateRequest = z.infer<typeof HarwickLoopUpdateRequestSchema>;
export type HarwickLoopRun = z.infer<typeof HarwickLoopRunSchema>;
