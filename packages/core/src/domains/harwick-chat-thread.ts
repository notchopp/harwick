import { z } from "zod";
import { UuidSchema } from "./common.js";

export const HarwickChatThreadSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  createdByMemberId: UuidSchema.nullable(),
  title: z.string().trim().min(1).max(120),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  lastMessageAt: z.string().datetime({ offset: true }).nullable(),
  archivedAt: z.string().datetime({ offset: true }).nullable(),
});

export const HarwickChatThreadCreateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
});

export const HarwickChatThreadUpdateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  archived: z.boolean().optional(),
});

export type HarwickChatThread = z.infer<typeof HarwickChatThreadSchema>;
export type HarwickChatThreadCreate = z.infer<typeof HarwickChatThreadCreateSchema>;
export type HarwickChatThreadUpdate = z.infer<typeof HarwickChatThreadUpdateSchema>;

export const HarwickChannelKindSchema = z.enum(["channel", "dm", "group"]);

export const HarwickChannelSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  kind: HarwickChannelKindSchema,
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable(),
  createdByMemberId: UuidSchema.nullable(),
  createdByKind: z.enum(["member", "harwick"]),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  lastMessageAt: z.string().datetime({ offset: true }).nullable(),
  archivedAt: z.string().datetime({ offset: true }).nullable(),
});

export const HarwickChannelCreateSchema = z.object({
  kind: HarwickChannelKindSchema.default("channel"),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  memberIds: z.array(UuidSchema).max(40).default([]),
});

export type HarwickChannel = z.infer<typeof HarwickChannelSchema>;
export type HarwickChannelCreate = z.infer<typeof HarwickChannelCreateSchema>;

export const HarwickChannelMessageAuthorKindSchema = z.enum(["member", "harwick", "system"]);

export const HarwickChannelMessageSchema = z.object({
  id: UuidSchema,
  channelId: UuidSchema,
  workspaceId: UuidSchema,
  authorKind: HarwickChannelMessageAuthorKindSchema,
  authorMemberId: UuidSchema.nullable(),
  body: z.string().trim().min(1).max(8000),
  metadata: z.record(z.string(), z.unknown()).default({}),
  mentionsHarwick: z.boolean(),
  createdAt: z.string().datetime({ offset: true }),
  editedAt: z.string().datetime({ offset: true }).nullable(),
});

export const HarwickChannelMessageCreateSchema = z.object({
  body: z.string().trim().min(1).max(8000),
});

export type HarwickChannelMessage = z.infer<typeof HarwickChannelMessageSchema>;
export type HarwickChannelMessageCreate = z.infer<typeof HarwickChannelMessageCreateSchema>;

const HARWICK_MENTION = /@harwick\b/i;

export function detectHarwickMention(body: string): boolean {
  return HARWICK_MENTION.test(body);
}
