import { z } from "zod";
import { IsoDateTimeSchema, ProviderIdSchema, UuidSchema } from "./common.js";
import { IntegrationAccountScopeSchema } from "./integration.js";

export const MetaFoundationRecentPostSchema = z.object({
  sourcePostId: ProviderIdSchema,
  caption: z.string().trim().max(8000).nullable(),
  permalink: z.string().trim().url().nullable(),
  mediaType: z.string().trim().max(80).nullable(),
  publishedAt: IsoDateTimeSchema.nullable(),
});

export const MetaAccountFoundationSchema = z.object({
  workspaceId: UuidSchema,
  integrationAccountId: UuidSchema,
  accountScope: IntegrationAccountScopeSchema,
  ownerMemberId: UuidSchema.nullable(),
  provider: z.literal("meta"),
  providerAccountId: ProviderIdSchema,
  pageId: ProviderIdSchema,
  pageName: z.string().trim().min(1).max(160),
  pageCategory: z.string().trim().max(160).nullable(),
  pageLinkUrl: z.string().trim().url().nullable(),
  instagramBusinessAccountId: ProviderIdSchema,
  instagramUsername: z.string().trim().min(1).max(160).nullable(),
  instagramDisplayName: z.string().trim().max(160).nullable(),
  biography: z.string().trim().max(5000).nullable(),
  websiteUrl: z.string().trim().url().nullable(),
  profilePhotoUrl: z.string().trim().url().nullable(),
  followerCount: z.number().int().min(0).nullable(),
  followsCount: z.number().int().min(0).nullable(),
  mediaCount: z.number().int().min(0).nullable(),
  areasMentioned: z.array(z.string().trim().min(1).max(120)).max(20),
  listingHints: z.array(z.string().trim().min(1).max(240)).max(30),
  recentPosts: z.array(MetaFoundationRecentPostSchema).max(12),
  lastFetchedAt: IsoDateTimeSchema,
}).refine((value) => {
  return (value.accountScope === "workspace" && value.ownerMemberId === null)
    || (value.accountScope === "member" && value.ownerMemberId !== null);
}, {
  message: "Member-scoped Meta foundations require ownerMemberId.",
});

export type MetaFoundationRecentPost = z.infer<typeof MetaFoundationRecentPostSchema>;
export type MetaAccountFoundation = z.infer<typeof MetaAccountFoundationSchema>;
