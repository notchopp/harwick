import { z } from "zod";

export const ProductUpdateKindSchema = z.enum(["patch", "minor", "major"]);

export const ProductUpdateCategorySchema = z.enum([
  "feature",
  "improvement",
  "fix",
  "ai",
  "ops",
  "internal",
]);

export const ProductUpdateHighlightSchema = z.object({
  category: ProductUpdateCategorySchema.default("improvement"),
  text: z.string().trim().min(1).max(280),
  customerVisible: z.boolean().default(true),
});

export const ProductUpdateEntrySchema = z.object({
  version: z.string().trim().min(1).max(40),
  tagName: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1).max(160),
  kind: ProductUpdateKindSchema,
  publishedAt: z.string().datetime(),
  summary: z.string().trim().min(1).max(2000),
  highlights: z.array(ProductUpdateHighlightSchema).max(20).default([]),
  compareUrl: z.string().trim().url().nullable().default(null),
  htmlUrl: z.string().trim().url().nullable().default(null),
  commitCount: z.number().int().nonnegative().default(0),
  commitRange: z.string().trim().max(120).nullable().default(null),
});

export const ProductUpdateFeedSchema = z.object({
  repository: z.string().trim().min(1).max(120),
  generatedAt: z.string().datetime(),
  updates: z.array(ProductUpdateEntrySchema).max(50).default([]),
});

export type ProductUpdateKind = z.infer<typeof ProductUpdateKindSchema>;
export type ProductUpdateCategory = z.infer<typeof ProductUpdateCategorySchema>;
export type ProductUpdateHighlight = z.infer<typeof ProductUpdateHighlightSchema>;
export type ProductUpdateEntry = z.infer<typeof ProductUpdateEntrySchema>;
export type ProductUpdateFeed = z.infer<typeof ProductUpdateFeedSchema>;
