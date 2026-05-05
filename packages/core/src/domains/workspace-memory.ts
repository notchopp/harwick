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

export const WorkspaceMemoryReviewStatusSchema = z.enum(["pending", "approved", "dismissed"]);

const WorkspaceMemoryReviewNoteSchema = z.string().trim().min(1).max(1000);

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
  reviewStatus: WorkspaceMemoryReviewStatusSchema.default("pending"),
  reviewedByMemberId: UuidSchema.nullable().default(null),
  reviewedAt: IsoDateTimeSchema.nullable().default(null),
  reviewNote: WorkspaceMemoryReviewNoteSchema.nullable().default(null),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export const WorkspaceMemoryDocumentCreateSchema = WorkspaceMemoryDocumentSchema.omit({
  id: true,
  reviewStatus: true,
  reviewedByMemberId: true,
  reviewedAt: true,
  reviewNote: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  evidence: z.record(z.string(), z.unknown()).default({}),
});

export const WorkspaceMemoryReviewQuerySchema = z.object({
  reviewStatus: WorkspaceMemoryReviewStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const WorkspaceMemoryReviewUpdateRequestSchema = z.object({
  memoryId: UuidSchema,
  reviewStatus: WorkspaceMemoryReviewStatusSchema,
  reviewNote: WorkspaceMemoryReviewNoteSchema.nullable().optional(),
});

export const WorkspaceMemoryReviewListResponseSchema = z.object({
  workspaceId: UuidSchema,
  memories: z.array(WorkspaceMemoryDocumentSchema),
});

export const WorkspaceMemoryReviewUpdateResponseSchema = z.object({
  memory: WorkspaceMemoryDocumentSchema,
});

export type WorkspaceMemoryType = z.infer<typeof WorkspaceMemoryTypeSchema>;
export type WorkspaceMemorySource = z.infer<typeof WorkspaceMemorySourceSchema>;
export type WorkspaceMemoryReviewStatus = z.infer<typeof WorkspaceMemoryReviewStatusSchema>;
export type WorkspaceMemoryDocument = z.infer<typeof WorkspaceMemoryDocumentSchema>;
export type WorkspaceMemoryDocumentCreate = z.infer<typeof WorkspaceMemoryDocumentCreateSchema>;
export type WorkspaceMemoryReviewQuery = z.infer<typeof WorkspaceMemoryReviewQuerySchema>;
export type WorkspaceMemoryReviewUpdateRequest = z.infer<typeof WorkspaceMemoryReviewUpdateRequestSchema>;
export type WorkspaceMemoryReviewListResponse = z.infer<typeof WorkspaceMemoryReviewListResponseSchema>;
export type WorkspaceMemoryReviewUpdateResponse = z.infer<typeof WorkspaceMemoryReviewUpdateResponseSchema>;
