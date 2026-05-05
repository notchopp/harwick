import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "./common.js";
import { WorkspaceRoleSchema } from "./workspace.js";

export const HarwickWorkItemTypeSchema = z.enum([
  "work_item",
  "approval",
  "alert",
  "insight",
  "status",
]);

export const HarwickWorkItemStatusSchema = z.enum([
  "pending",
  "surfaced",
  "seen",
  "approved",
  "reassigned",
  "dismissed",
  "completed",
  "expired",
]);

export const HarwickWorkItemPrioritySchema = z.enum([
  "low",
  "normal",
  "high",
  "urgent",
]);

export const HarwickRoutingDecisionStatusSchema = z.enum([
  "suggested",
  "approved",
  "overridden",
  "assigned",
  "dismissed",
]);

export const HarwickWorkItemSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  leadId: UuidSchema.nullable(),
  routingDecisionId: UuidSchema.nullable(),
  trajectoryId: UuidSchema.nullable(),
  stepId: UuidSchema.nullable(),
  type: HarwickWorkItemTypeSchema,
  status: HarwickWorkItemStatusSchema,
  targetMemberId: UuidSchema.nullable(),
  targetRole: WorkspaceRoleSchema.nullable(),
  priority: HarwickWorkItemPrioritySchema,
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(1000),
  recommendedAction: z.string().trim().min(1).max(160),
  reason: z.string().trim().min(1).max(1000),
  payload: z.record(z.string(), z.unknown()).default({}),
  dueAt: IsoDateTimeSchema.nullable(),
  surfacedAt: IsoDateTimeSchema.nullable(),
  seenAt: IsoDateTimeSchema.nullable(),
  completedAt: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export const HarwickRoutingDecisionSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  leadId: UuidSchema,
  trajectoryId: UuidSchema.nullable(),
  stepId: UuidSchema.nullable(),
  suggestedMemberId: UuidSchema.nullable(),
  finalMemberId: UuidSchema.nullable(),
  status: HarwickRoutingDecisionStatusSchema,
  confidence: z.number().min(0).max(1).nullable(),
  reason: z.string().trim().min(1).max(1000),
  evidence: z.record(z.string(), z.unknown()).default({}),
  createdByActorType: z.enum(["ai", "member", "system"]),
  decidedByMemberId: UuidSchema.nullable(),
  decidedAt: IsoDateTimeSchema.nullable(),
  overrideReason: z.string().trim().min(1).max(1000).nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export const HarwickWorkItemCreateSchema = HarwickWorkItemSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  surfacedAt: true,
  seenAt: true,
  completedAt: true,
}).extend({
  status: HarwickWorkItemStatusSchema.default("pending"),
  payload: z.record(z.string(), z.unknown()).default({}),
  dueAt: IsoDateTimeSchema.nullable().default(null),
});

export const HarwickRoutingDecisionCreateSchema = HarwickRoutingDecisionSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  decidedAt: true,
}).extend({
  status: HarwickRoutingDecisionStatusSchema.default("suggested"),
  evidence: z.record(z.string(), z.unknown()).default({}),
});

export type HarwickWorkItemType = z.infer<typeof HarwickWorkItemTypeSchema>;
export type HarwickWorkItemStatus = z.infer<typeof HarwickWorkItemStatusSchema>;
export type HarwickWorkItemPriority = z.infer<typeof HarwickWorkItemPrioritySchema>;
export type HarwickRoutingDecisionStatus = z.infer<typeof HarwickRoutingDecisionStatusSchema>;
export type HarwickWorkItem = z.infer<typeof HarwickWorkItemSchema>;
export type HarwickRoutingDecision = z.infer<typeof HarwickRoutingDecisionSchema>;
export type HarwickWorkItemCreate = z.infer<typeof HarwickWorkItemCreateSchema>;
export type HarwickRoutingDecisionCreate = z.infer<typeof HarwickRoutingDecisionCreateSchema>;
