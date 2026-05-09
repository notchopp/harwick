import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "./common.js";

export const OwnerHomeQueueKindSchema = z.enum([
  "harwick",
  "routing",
  "inbox",
  "operations",
  "crm",
]);

export const OwnerHomeQueuePrioritySchema = z.enum(["normal", "high", "urgent"]);

export const OwnerHomeQueueItemSchema = z.object({
  id: z.string().trim().min(1).max(160),
  workspaceId: UuidSchema,
  leadId: UuidSchema.nullable(),
  kind: OwnerHomeQueueKindSchema,
  priority: OwnerHomeQueuePrioritySchema,
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(500),
  reason: z.string().trim().min(1).max(500),
  actionLabel: z.string().trim().min(1).max(80),
  href: z.string().trim().min(1).max(500),
  createdAt: IsoDateTimeSchema,
  dueAt: IsoDateTimeSchema.nullable(),
});

export const OwnerHomeQueueResponseSchema = z.object({
  workspaceId: UuidSchema,
  items: z.array(OwnerHomeQueueItemSchema),
});

export type OwnerHomeQueueKind = z.infer<typeof OwnerHomeQueueKindSchema>;
export type OwnerHomeQueuePriority = z.infer<typeof OwnerHomeQueuePrioritySchema>;
export type OwnerHomeQueueItem = z.infer<typeof OwnerHomeQueueItemSchema>;
export type OwnerHomeQueueResponse = z.infer<typeof OwnerHomeQueueResponseSchema>;
