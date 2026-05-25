import { z } from "zod";
import { ConversationAutomationModeSchema } from "./conversation-automation.js";
import { HarwickAiDecisionSchema } from "./harwick-ai.js";
import { IsoDateTimeSchema, ProviderIdSchema, UuidSchema } from "./common.js";
import { LeadSourceChannelSchema } from "./lead.js";

export const SocialReplyReviewStatusSchema = z.enum(["pending", "approved", "sent", "dismissed", "failed"]);
export const VoiceHandoffReviewStatusSchema = z.enum(["pending", "callback_created", "reviewed", "dismissed"]);

export const SocialReplyQueueItemSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  leadId: UuidSchema.nullable(),
  leadEventId: UuidSchema,
  providerAccountId: ProviderIdSchema,
  recipientUserId: ProviderIdSchema.nullable(),
  channel: z.enum(["instagram_dm", "instagram_comment", "facebook_dm", "facebook_comment"]),
  sourcePostId: ProviderIdSchema.nullable(),
  sourceCommentId: ProviderIdSchema.nullable(),
  inboundText: z.string().trim().min(1).nullable(),
  suggestedReply: z.string().trim().min(1).max(1000).nullable(),
  status: SocialReplyReviewStatusSchema,
  automationMode: ConversationAutomationModeSchema,
  automationReason: z.string().trim().min(1).max(240).nullable(),
  aiDecision: HarwickAiDecisionSchema.nullable(),
  providerEventId: ProviderIdSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export const SocialReplyQueueActionRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    reply: z.string().trim().min(1).max(1000),
  }),
  z.object({
    action: z.literal("send"),
    reply: z.string().trim().min(1).max(1000),
  }),
  z.object({
    action: z.literal("dismiss"),
    reason: z.string().trim().min(1).max(500).nullable().optional(),
  }),
]);

export const SocialReplyAutomationControlRequestSchema = z.object({
  mode: ConversationAutomationModeSchema,
  reason: z.string().trim().min(1).max(240).nullable().optional(),
});

export const VoiceHandoffQueueItemSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  leadId: UuidSchema.nullable(),
  callId: ProviderIdSchema.nullable(),
  phone: z.string().trim().min(1).nullable(),
  callerName: z.string().trim().min(1).nullable(),
  urgency: z.enum(["routine", "hot", "needs_handoff"]),
  summary: z.string().trim().min(1),
  status: z.enum(["captured", "queued", "synced", "failed"]),
  reviewStatus: VoiceHandoffReviewStatusSchema,
  callbackTaskId: UuidSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export const VoiceHandoffQueueActionRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create_callback_task"),
    title: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().min(1).max(2000).optional(),
    priority: z.enum(["normal", "high", "urgent"]).optional(),
    dueAt: IsoDateTimeSchema.optional(),
  }),
  z.object({
    action: z.literal("mark_reviewed"),
  }),
  z.object({
    action: z.literal("dismiss"),
    reason: z.string().trim().min(1).max(500).nullable().optional(),
  }),
]);

export const SocialReplyQueueResponseSchema = z.object({
  workspaceId: UuidSchema,
  items: z.array(SocialReplyQueueItemSchema),
});

export const VoiceHandoffQueueResponseSchema = z.object({
  workspaceId: UuidSchema,
  items: z.array(VoiceHandoffQueueItemSchema),
});

export const SocialConversationThreadItemSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  leadId: UuidSchema.nullable(),
  provider: z.enum(["meta", "twilio", "retell", "follow_up_boss", "manual"]),
  eventType: z.string().trim().min(1),
  channel: LeadSourceChannelSchema,
  text: z.string().trim().min(1).nullable(),
  occurredAt: IsoDateTimeSchema,
});

export const SocialConversationThreadResponseSchema = z.object({
  workspaceId: UuidSchema,
  reviewId: UuidSchema,
  leadId: UuidSchema.nullable(),
  items: z.array(SocialConversationThreadItemSchema),
});

export type SocialReplyReviewStatus = z.infer<typeof SocialReplyReviewStatusSchema>;
export type VoiceHandoffReviewStatus = z.infer<typeof VoiceHandoffReviewStatusSchema>;
export type SocialReplyQueueItem = z.infer<typeof SocialReplyQueueItemSchema>;
export type SocialReplyQueueActionRequest = z.infer<typeof SocialReplyQueueActionRequestSchema>;
export type SocialReplyAutomationControlRequest = z.infer<typeof SocialReplyAutomationControlRequestSchema>;
export type VoiceHandoffQueueItem = z.infer<typeof VoiceHandoffQueueItemSchema>;
export type VoiceHandoffQueueActionRequest = z.infer<typeof VoiceHandoffQueueActionRequestSchema>;
export type SocialReplyQueueResponse = z.infer<typeof SocialReplyQueueResponseSchema>;
export type VoiceHandoffQueueResponse = z.infer<typeof VoiceHandoffQueueResponseSchema>;
export type SocialConversationThreadItem = z.infer<typeof SocialConversationThreadItemSchema>;
export type SocialConversationThreadResponse = z.infer<typeof SocialConversationThreadResponseSchema>;

export function isSocialReplyChannel(channel: string): channel is Extract<
  z.infer<typeof LeadSourceChannelSchema>,
  "instagram_dm" | "instagram_comment" | "facebook_dm" | "facebook_comment"
> {
  return channel === "instagram_dm"
    || channel === "instagram_comment"
    || channel === "facebook_dm"
    || channel === "facebook_comment";
}
