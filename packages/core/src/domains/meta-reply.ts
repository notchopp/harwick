import { z } from "zod";
import { IsoDateTimeSchema, ProviderIdSchema, UuidSchema } from "./common.js";
import { LeadSourceChannelSchema } from "./lead.js";

const MetaReplyChannelSchema = z.enum([
  "instagram_dm",
  "instagram_comment",
  "facebook_dm",
  "facebook_comment",
]);

export const SendMetaReplyRequestSchema = z.object({
  workspaceId: UuidSchema,
  leadId: UuidSchema.nullable().default(null),
  providerAccountId: ProviderIdSchema,
  channel: MetaReplyChannelSchema,
  recipientUserId: ProviderIdSchema.nullable().default(null),
  sourceCommentId: ProviderIdSchema.nullable().default(null),
  sourcePostId: ProviderIdSchema.nullable().default(null),
  reply: z.string().trim().min(1).max(1000),
}).superRefine((value, context) => {
  if ((value.channel === "instagram_dm" || value.channel === "facebook_dm") && value.recipientUserId === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Direct message replies require recipientUserId.",
      path: ["recipientUserId"],
    });
  }

  if (
    (value.channel === "instagram_comment" || value.channel === "facebook_comment")
    && value.sourceCommentId === null
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Comment replies require sourceCommentId.",
      path: ["sourceCommentId"],
    });
  }
});

export const SendMetaReplyResponseSchema = z.object({
  status: z.literal("sent"),
  providerEventId: ProviderIdSchema,
  occurredAt: IsoDateTimeSchema,
  channel: LeadSourceChannelSchema,
});

export type SendMetaReplyRequest = z.infer<typeof SendMetaReplyRequestSchema>;
export type SendMetaReplyResponse = z.infer<typeof SendMetaReplyResponseSchema>;
