import { normalizeFreeformText, type MetaFoundationRecentPost, type SocialPostContext } from "@realty-ops/core";
import { z } from "zod";
import { buildMetaSocialPostContext } from "./meta.js";

const GRAPH_API_BASE_URL = "https://graph.facebook.com/v20.0";

const MetaGraphInstagramMediaSchema = z.object({
  id: z.string().trim().min(1),
  caption: z.string().optional(),
  permalink: z.string().trim().url().optional(),
  media_type: z.string().trim().min(1).optional(),
}).passthrough();

const MetaGraphAttachmentSchema = z.object({
  media_type: z.string().trim().min(1).optional(),
}).passthrough();

const MetaGraphFacebookPostSchema = z.object({
  id: z.string().trim().min(1),
  message: z.string().optional(),
  permalink_url: z.string().trim().url().optional(),
  attachments: z.object({
    data: z.array(MetaGraphAttachmentSchema).optional(),
  }).optional(),
}).passthrough();

const MetaGraphInstagramAccountSchema = z.object({
  id: z.string().trim().min(1),
  username: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  biography: z.string().optional(),
  website: z.string().trim().min(1).optional(),
  profile_picture_url: z.string().trim().min(1).optional(),
  followers_count: z.number().int().nonnegative().optional(),
  follows_count: z.number().int().nonnegative().optional(),
  media_count: z.number().int().nonnegative().optional(),
}).passthrough();

const MetaGraphPageSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  category: z.string().trim().min(1).optional(),
  link: z.string().trim().min(1).optional(),
}).passthrough();

const MetaGraphInstagramMediaListSchema = z.object({
  data: z.array(z.object({
    id: z.string().trim().min(1),
    caption: z.string().optional(),
    permalink: z.string().trim().min(1).optional(),
    media_type: z.string().trim().min(1).optional(),
    timestamp: z.string().trim().min(1).optional(),
  }).passthrough()),
}).passthrough();

export type MetaGraphClientOptions = {
  fetchImpl?: typeof fetch;
};

export type MetaGraphPostLookup = {
  workspaceId: string;
  providerAccountId: string;
  sourcePostId: string;
  sourceChannel: "instagram_comment" | "facebook_comment";
  accessToken: string;
};

export type MetaGraphAccountFoundation = {
  pageId: string;
  pageName: string;
  pageCategory: string | null;
  pageLinkUrl: string | null;
  instagramBusinessAccountId: string;
  instagramUsername: string | null;
  instagramDisplayName: string | null;
  biography: string | null;
  websiteUrl: string | null;
  profilePhotoUrl: string | null;
  followerCount: number | null;
  followsCount: number | null;
  mediaCount: number | null;
  recentPosts: MetaFoundationRecentPost[];
};

function normalizeOptionalUrl(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

function normalizePublishedAt(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

export function createMetaGraphClient(options: MetaGraphClientOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;

  async function request(url: URL): Promise<unknown> {
    const response = await fetchImpl(url);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Meta Graph request failed (${response.status}): ${text}`);
    }

    return response.json();
  }

  return {
    async fetchAccountFoundation(params: {
      pageId: string;
      instagramBusinessAccountId: string;
      accessToken: string;
      recentPostLimit?: number;
    }): Promise<MetaGraphAccountFoundation> {
      const pageUrl = new URL(`${GRAPH_API_BASE_URL}/${params.pageId}`);
      pageUrl.searchParams.set("access_token", params.accessToken);
      pageUrl.searchParams.set("fields", "id,name,category,link");

      const instagramUrl = new URL(`${GRAPH_API_BASE_URL}/${params.instagramBusinessAccountId}`);
      instagramUrl.searchParams.set("access_token", params.accessToken);
      instagramUrl.searchParams.set(
        "fields",
        "id,username,name,biography,website,profile_picture_url,followers_count,follows_count,media_count",
      );

      const mediaUrl = new URL(`${GRAPH_API_BASE_URL}/${params.instagramBusinessAccountId}/media`);
      mediaUrl.searchParams.set("access_token", params.accessToken);
      mediaUrl.searchParams.set("fields", "id,caption,permalink,media_type,timestamp");
      mediaUrl.searchParams.set("limit", String(params.recentPostLimit ?? 6));

      const [page, instagramAccount, recentMedia] = await Promise.all([
        request(pageUrl),
        request(instagramUrl),
        request(mediaUrl),
      ]);
      const parsedPage = MetaGraphPageSchema.parse(page);
      const parsedInstagramAccount = MetaGraphInstagramAccountSchema.parse(instagramAccount);
      const parsedRecentMedia = MetaGraphInstagramMediaListSchema.parse(recentMedia);

      return {
        pageId: parsedPage.id,
        pageName: parsedPage.name,
        pageCategory: parsedPage.category ?? null,
        pageLinkUrl: normalizeOptionalUrl(parsedPage.link),
        instagramBusinessAccountId: parsedInstagramAccount.id,
        instagramUsername: parsedInstagramAccount.username ?? null,
        instagramDisplayName: normalizeFreeformText(parsedInstagramAccount.name),
        biography: normalizeFreeformText(parsedInstagramAccount.biography),
        websiteUrl: normalizeOptionalUrl(parsedInstagramAccount.website),
        profilePhotoUrl: normalizeOptionalUrl(parsedInstagramAccount.profile_picture_url),
        followerCount: parsedInstagramAccount.followers_count ?? null,
        followsCount: parsedInstagramAccount.follows_count ?? null,
        mediaCount: parsedInstagramAccount.media_count ?? null,
        recentPosts: parsedRecentMedia.data.map((post) => ({
          sourcePostId: post.id,
          caption: normalizeFreeformText(post.caption),
          permalink: normalizeOptionalUrl(post.permalink),
          mediaType: post.media_type ?? null,
          publishedAt: normalizePublishedAt(post.timestamp),
        })),
      };
    },

    async fetchPostContext(params: MetaGraphPostLookup): Promise<SocialPostContext> {
      const url = new URL(`${GRAPH_API_BASE_URL}/${params.sourcePostId}`);
      url.searchParams.set("access_token", params.accessToken);

      if (params.sourceChannel === "instagram_comment") {
        url.searchParams.set("fields", "id,caption,permalink,media_type");
        const media = MetaGraphInstagramMediaSchema.parse(await request(url));

        return buildMetaSocialPostContext({
          workspaceId: params.workspaceId,
          providerAccountId: params.providerAccountId,
          sourcePostId: params.sourcePostId,
          sourceChannel: params.sourceChannel,
          caption: media.caption ?? null,
          text: null,
          permalink: media.permalink ?? null,
          mediaType: media.media_type ?? null,
          rawPayload: media,
        });
      }

      url.searchParams.set("fields", "id,message,permalink_url,attachments{media_type}");
      const post = MetaGraphFacebookPostSchema.parse(await request(url));

      return buildMetaSocialPostContext({
        workspaceId: params.workspaceId,
        providerAccountId: params.providerAccountId,
        sourcePostId: params.sourcePostId,
        sourceChannel: params.sourceChannel,
        caption: post.message ?? null,
        text: null,
        permalink: post.permalink_url ?? null,
        mediaType: post.attachments?.data?.[0]?.media_type ?? null,
        rawPayload: post,
      });
    },
  };
}
