import type { MetaAccountFoundation } from "@realty-ops/core";
import type { RealtyOpsSupabaseClient } from "./server-client";

export type MetaAccountFoundationRecentPostRow = {
  source_post_id: string;
  caption: string | null;
  permalink: string | null;
  media_type: string | null;
  published_at: string | null;
};

export type MetaAccountFoundationRow = {
  id: string;
  workspace_id: string;
  integration_account_id: string;
  account_scope: "workspace" | "member";
  owner_member_id: string | null;
  provider: "meta";
  provider_account_id: string;
  page_id: string;
  page_name: string;
  page_category: string | null;
  page_link_url: string | null;
  instagram_business_account_id: string;
  instagram_username: string | null;
  instagram_display_name: string | null;
  biography: string | null;
  website_url: string | null;
  profile_photo_url: string | null;
  follower_count: number | null;
  follows_count: number | null;
  media_count: number | null;
  areas_mentioned: string[];
  listing_hints: string[];
  recent_posts: MetaAccountFoundationRecentPostRow[];
  last_fetched_at: string;
  created_at: string;
  updated_at: string;
};

export type MetaAccountFoundationInsertRow = Omit<MetaAccountFoundationRow, "id" | "created_at" | "updated_at"> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type MetaAccountFoundationRepository = {
  upsertFoundation(foundation: MetaAccountFoundation): Promise<void>;
  findFoundation(params: {
    workspaceId: string;
    integrationAccountId: string;
  }): Promise<MetaAccountFoundationRow | null>;
};

function mapFoundationToRow(foundation: MetaAccountFoundation): MetaAccountFoundationInsertRow {
  return {
    workspace_id: foundation.workspaceId,
    integration_account_id: foundation.integrationAccountId,
    account_scope: foundation.accountScope,
    owner_member_id: foundation.ownerMemberId,
    provider: foundation.provider,
    provider_account_id: foundation.providerAccountId,
    page_id: foundation.pageId,
    page_name: foundation.pageName,
    page_category: foundation.pageCategory,
    page_link_url: foundation.pageLinkUrl,
    instagram_business_account_id: foundation.instagramBusinessAccountId,
    instagram_username: foundation.instagramUsername,
    instagram_display_name: foundation.instagramDisplayName,
    biography: foundation.biography,
    website_url: foundation.websiteUrl,
    profile_photo_url: foundation.profilePhotoUrl,
    follower_count: foundation.followerCount,
    follows_count: foundation.followsCount,
    media_count: foundation.mediaCount,
    areas_mentioned: foundation.areasMentioned,
    listing_hints: foundation.listingHints,
    recent_posts: foundation.recentPosts.map((post) => ({
      source_post_id: post.sourcePostId,
      caption: post.caption,
      permalink: post.permalink,
      media_type: post.mediaType,
      published_at: post.publishedAt,
    })),
    last_fetched_at: foundation.lastFetchedAt,
  };
}

export function createSupabaseMetaAccountFoundationRepository(
  supabase: RealtyOpsSupabaseClient,
): MetaAccountFoundationRepository {
  return {
    async upsertFoundation(foundation) {
      const { error } = await supabase
        .from("meta_account_foundations")
        .upsert(mapFoundationToRow(foundation), {
          onConflict: "workspace_id,integration_account_id",
        });

      if (error !== null) {
        throw error;
      }
    },

    async findFoundation(params) {
      const { data, error } = await supabase
        .from("meta_account_foundations")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .eq("integration_account_id", params.integrationAccountId)
        .maybeSingle<MetaAccountFoundationRow>();

      if (error !== null) {
        throw error;
      }

      return data ?? null;
    },
  };
}
