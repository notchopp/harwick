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

export const ConversationAiToolActivityStatusSchema = z.enum([
  "requested",
  "queued",
  "running",
  "executed",
  "queued_for_approval",
  "missing_handler",
  "failed",
]);

export const ConversationAiToolActivitySchema = z.object({
  id: z.string().trim().min(1).max(160),
  tool: z.string().trim().min(1).max(80),
  status: ConversationAiToolActivityStatusSchema,
  summary: z.string().trim().min(1).max(240),
  detail: z.string().trim().min(1).max(500).nullable(),
});

export const ConversationAiLiveFieldSchema = z.object({
  key: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(80),
  value: z.string().trim().min(1).max(240),
});

export const ConversationAiSynthesisSchema = z.object({
  turnId: UuidSchema,
  status: z.string().trim().min(1).max(80),
  intent: z.string().trim().min(1).max(120),
  nextAction: z.string().trim().min(1).max(120),
  confidence: z.number().min(0).max(1),
  missingFields: z.array(z.string().trim().min(1).max(80)).max(12),
  safetyFlags: z.array(z.string().trim().min(1).max(80)).max(12),
  handoffBrief: z.string().trim().max(1000).nullable(),
  documentUpdate: z.string().trim().max(2000).nullable(),
  liveFields: z.array(ConversationAiLiveFieldSchema).max(8).default([]),
  toolActivity: z.array(ConversationAiToolActivitySchema).max(12).default([]),
  updatedAt: IsoDateTimeSchema,
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
  aiSynthesis: ConversationAiSynthesisSchema.nullable().default(null),
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
export type ConversationAiToolActivityStatus = z.infer<typeof ConversationAiToolActivityStatusSchema>;
export type ConversationAiToolActivity = z.infer<typeof ConversationAiToolActivitySchema>;
export type ConversationAiLiveField = z.infer<typeof ConversationAiLiveFieldSchema>;
export type ConversationAiSynthesis = z.infer<typeof ConversationAiSynthesisSchema>;
export type ConversationInboxThread = z.infer<typeof ConversationInboxThreadSchema>;
export type ConversationsInboxResponse = z.infer<typeof ConversationsInboxResponseSchema>;
