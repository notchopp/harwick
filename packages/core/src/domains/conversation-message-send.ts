import { z } from "zod";
import { IsoDateTimeSchema, ProviderIdSchema, UuidSchema } from "./common.js";
import { LeadSourceChannelSchema } from "./lead.js";

export const ConversationMessageSendRequestSchema = z.object({
  conversationId: UuidSchema,
  workspaceId: UuidSchema,
  reply: z.string().trim().min(1).max(1000),
});

export const ConversationMessageSendResponseSchema = z.object({
  status: z.literal("sent"),
  providerEventId: ProviderIdSchema,
  occurredAt: IsoDateTimeSchema,
  channel: LeadSourceChannelSchema,
});

export type ConversationMessageSendRequest = z.infer<typeof ConversationMessageSendRequestSchema>;
export type ConversationMessageSendResponse = z.infer<typeof ConversationMessageSendResponseSchema>;
