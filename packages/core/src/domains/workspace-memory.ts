import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "./common.js";

export const WorkspaceMemoryTypeSchema = z.enum([
  "pattern",
  "routing",
  "objection",
  "market",
  "policy_signal",
]);

export const WorkspaceMemorySourceSchema = z.enum([
  "distillation_worker",
  "operator_note",
  "import",
  "system",
]);

export const WorkspaceMemoryDocumentSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  memoryType: WorkspaceMemoryTypeSchema,
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(4000),
  source: WorkspaceMemorySourceSchema,
  confidence: z.number().min(0).max(1),
  evidence: z.record(z.string(), z.unknown()).default({}),
  lastObservedAt: IsoDateTimeSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export const WorkspaceMemoryDocumentCreateSchema = WorkspaceMemoryDocumentSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  evidence: z.record(z.string(), z.unknown()).default({}),
});

export type WorkspaceMemoryType = z.infer<typeof WorkspaceMemoryTypeSchema>;
export type WorkspaceMemorySource = z.infer<typeof WorkspaceMemorySourceSchema>;
export type WorkspaceMemoryDocument = z.infer<typeof WorkspaceMemoryDocumentSchema>;
export type WorkspaceMemoryDocumentCreate = z.infer<typeof WorkspaceMemoryDocumentCreateSchema>;
