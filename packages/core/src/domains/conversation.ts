import { z } from "zod";
import { ConversationAutomationModeSchema } from "./conversation-automation.js";
import { IsoDateTimeSchema, ProviderIdSchema, UuidSchema } from "./common.js";

export const ConversationInboxSourceSchema = z.enum(["instagram", "facebook", "voice", "sms", "manual"]);
export const ConversationInboxBucketSchema = z.enum(["dms", "comments"]);
export const ConversationInboxStageToneSchema = z.enum(["new", "qualified", "nurture", "review", "lost"]);
export const ConversationInboxMessageKindSchema = z.enum(["lead", "sent", "ai_action", "system"]);

export const ConversationInboxMessageSchema = z.object({
  id: z.string().trim().min(1),
  kind: ConversationInboxMessageKindSchema,
  body: z.string().trim().min(1),
  meta: z.string().trim().min(1),
  occurredAt: IsoDateTimeSchema,
  /** Trajectory that produced this message; non-null only for AI-sent messages. */
  agentTrajectoryId: UuidSchema.nullish(),
  /** Specific agent step that produced this message — required for inline operator tags. */
  agentStepId: UuidSchema.nullish(),
});

export const ConversationInboxThreadSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  leadId: UuidSchema,
  reviewId: UuidSchema.nullable(),
  name: z.string().trim().min(1),
  initials: z.string().trim().min(1).max(3),
  lastTouchLabel: z.string().trim().min(1),
  unread: z.boolean(),
  preview: z.string().trim().min(1),
  source: ConversationInboxSourceSchema,
  sourceLabel: z.string().trim().min(1),
  channelLabel: z.string().trim().min(1),
  sourceContext: z.string().trim().min(1),
  bucket: ConversationInboxBucketSchema,
  assignedTo: z.string().trim().min(1),
  stageLabel: z.string().trim().min(1),
  stageTone: ConversationInboxStageToneSchema,
  score: z.number().int().min(0).max(100),
  scoreLabel: z.string().trim().min(1),
  followUpBossContactId: ProviderIdSchema.nullable(),
  intentType: z.string().trim().min(1),
  area: z.string().trim().min(1),
  timeline: z.string().trim().min(1),
  budget: z.string().trim().min(1),
  listingTitle: z.string().trim().min(1),
  listingDetails: z.string().trim().min(1),
  listingStatus: z.string().trim().min(1),
  automationMode: ConversationAutomationModeSchema.nullable(),
  automationReason: z.string().trim().min(1).nullable(),
  messages: z.array(ConversationInboxMessageSchema),
});

export const ConversationsInboxResponseSchema = z.object({
  workspaceId: UuidSchema,
  threads: z.array(ConversationInboxThreadSchema),
});

export type ConversationInboxSource = z.infer<typeof ConversationInboxSourceSchema>;
export type ConversationInboxBucket = z.infer<typeof ConversationInboxBucketSchema>;
export type ConversationInboxStageTone = z.infer<typeof ConversationInboxStageToneSchema>;
export type ConversationInboxMessageKind = z.infer<typeof ConversationInboxMessageKindSchema>;
export type ConversationInboxMessage = z.infer<typeof ConversationInboxMessageSchema>;
export type ConversationInboxThread = z.infer<typeof ConversationInboxThreadSchema>;
export type ConversationsInboxResponse = z.infer<typeof ConversationsInboxResponseSchema>;
