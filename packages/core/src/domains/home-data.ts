import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "./common.js";
import {
  AgentRoutingProfileSchema,
  LeadRoutingDecisionSchema,
  LeadRoutingQualificationSchema,
} from "./lead-routing.js";
import {
  HarwickWorkItemPrioritySchema,
  HarwickWorkItemStatusSchema,
  HarwickWorkItemTypeSchema,
} from "./harwick-work-item.js";
import { WorkspaceRoleSchema } from "./workspace.js";

export const RecentLeadStageToneSchema = z.enum(["new", "qualified", "nurture", "lost", "review"]);

export const RecentLeadSourceSchema = z.enum([
  "instagram",
  "facebook",
  "voice",
  "sms",
  "manual",
]);

export const RecentLeadItemSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  name: z.string().trim().min(1).max(160),
  initials: z.string().trim().min(1).max(4),
  source: RecentLeadSourceSchema,
  sourceLabel: z.string().trim().min(1).max(60),
  channelLabel: z.string().trim().min(1).max(60),
  stage: RecentLeadStageToneSchema,
  stageLabel: z.string().trim().min(1).max(60),
  lastTouchAt: IsoDateTimeSchema.nullable(),
  lastTouchLabel: z.string().trim().min(1).max(60),
  assignedDisplayName: z.string().trim().min(1).max(120).nullable(),
});

export const RecentLeadsResponseSchema = z.object({
  workspaceId: UuidSchema,
  items: z.array(RecentLeadItemSchema),
});

export const RoutingDeskItemSchema = z.object({
  leadId: UuidSchema,
  workspaceId: UuidSchema,
  leadName: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(280),
  source: z.string().trim().min(1).max(80),
  sourceOwnerLabel: z.string().trim().min(1).max(120),
  qualification: LeadRoutingQualificationSchema,
  decision: LeadRoutingDecisionSchema,
});

export const RoutingDeskResponseSchema = z.object({
  workspaceId: UuidSchema,
  agents: z.array(AgentRoutingProfileSchema),
  items: z.array(RoutingDeskItemSchema),
});

export const HarwickHomeWorkItemSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  leadId: UuidSchema.nullable(),
  type: HarwickWorkItemTypeSchema,
  status: HarwickWorkItemStatusSchema,
  priority: HarwickWorkItemPrioritySchema,
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(1000),
  recommendedAction: z.string().trim().min(1).max(160),
  reason: z.string().trim().min(1).max(1000),
  targetMemberId: UuidSchema.nullable(),
  targetRole: WorkspaceRoleSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  dueAt: IsoDateTimeSchema.nullable(),
});

export const HarwickHomeWorkItemsResponseSchema = z.object({
  workspaceId: UuidSchema,
  items: z.array(HarwickHomeWorkItemSchema),
});

export type RecentLeadStageTone = z.infer<typeof RecentLeadStageToneSchema>;
export type RecentLeadSource = z.infer<typeof RecentLeadSourceSchema>;
export type RecentLeadItem = z.infer<typeof RecentLeadItemSchema>;
export type RecentLeadsResponse = z.infer<typeof RecentLeadsResponseSchema>;
export type RoutingDeskItem = z.infer<typeof RoutingDeskItemSchema>;
export type RoutingDeskResponse = z.infer<typeof RoutingDeskResponseSchema>;
export type HarwickHomeWorkItem = z.infer<typeof HarwickHomeWorkItemSchema>;
export type HarwickHomeWorkItemsResponse = z.infer<typeof HarwickHomeWorkItemsResponseSchema>;
