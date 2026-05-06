import { z } from "zod";
import { UuidSchema } from "./common.js";
import { HarwickAiToolNameSchema } from "./harwick-ai-runtime.js";
import { WorkspaceRoleSchema } from "./workspace.js";

export const HarwickWorkItemNotificationLevelSchema = z.enum([
  "quiet",
  "digest",
  "prompt",
  "interrupt",
]);

export const HarwickWorkItemNotificationModeSchema = z.enum([
  "feed_only",
  "feed_and_nudge",
  "interrupt_now",
]);

export const HarwickWorkItemAudienceDecisionSchema = z.object({
  targetRole: WorkspaceRoleSchema.nullable().default(null),
  targetMemberId: UuidSchema.nullable().default(null),
  reason: z.string().trim().min(1).max(500),
});

export const HarwickWorkItemProposedToolCallSchema = z.object({
  tool: HarwickAiToolNameSchema,
  reason: z.string().trim().min(1).max(240),
  requiresApproval: z.boolean().default(true),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export const HarwickWorkItemActionPlanSchema = z.object({
  executionBrief: z.string().trim().min(1).max(1000),
  requiresApproval: z.boolean().default(true),
  internalSafeOnly: z.boolean().default(false),
  proposedToolCalls: z.array(HarwickWorkItemProposedToolCallSchema).max(8).default([]),
});

export const HarwickWorkItemNotificationDecisionSchema = z.object({
  level: HarwickWorkItemNotificationLevelSchema,
  mode: HarwickWorkItemNotificationModeSchema,
  reason: z.string().trim().min(1).max(500),
});

export const HarwickWorkItemIntelligenceSchema = z.object({
  audience: HarwickWorkItemAudienceDecisionSchema,
  notification: HarwickWorkItemNotificationDecisionSchema,
  actionPlan: HarwickWorkItemActionPlanSchema.nullable().default(null),
  source: z.enum(["deterministic", "small_model"]).default("deterministic"),
});

export type HarwickWorkItemNotificationLevel = z.infer<typeof HarwickWorkItemNotificationLevelSchema>;
export type HarwickWorkItemNotificationMode = z.infer<typeof HarwickWorkItemNotificationModeSchema>;
export type HarwickWorkItemAudienceDecision = z.infer<typeof HarwickWorkItemAudienceDecisionSchema>;
export type HarwickWorkItemProposedToolCall = z.infer<typeof HarwickWorkItemProposedToolCallSchema>;
export type HarwickWorkItemActionPlan = z.infer<typeof HarwickWorkItemActionPlanSchema>;
export type HarwickWorkItemNotificationDecision = z.infer<typeof HarwickWorkItemNotificationDecisionSchema>;
export type HarwickWorkItemIntelligence = z.infer<typeof HarwickWorkItemIntelligenceSchema>;
