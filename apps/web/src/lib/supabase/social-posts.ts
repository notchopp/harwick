import type { SocialPostContext } from "@realty-ops/core";
import type { RealtyOpsSupabaseClient } from "./server-client";

export type SocialPostRow = {
  id: string;
  workspace_id: string;
  provider: "meta";
  provider_account_id: string;
  source_post_id: string;
  source_channel: "instagram_comment" | "facebook_comment";
  caption: string | null;
  permalink: string | null;
  media_type: string | null;
  cta_label: string | null;
  areas_mentioned: string[];
  listing_hints: string[];
  fetched_at: string;
  created_at: string;
  updated_at: string;
};

export type SocialPostInsertRow = Omit<SocialPostRow, "id" | "created_at" | "updated_at"> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type SocialPostRepository = {
  upsertPostContexts(contexts: SocialPostContext[]): Promise<number>;
  findPostContext(params: {
    workspaceId: string;
    provider: "meta";
    sourcePostId: string;
  }): Promise<SocialPostRow | null>;
};

function mapContextToRow(context: SocialPostContext): SocialPostInsertRow {
  return {
    workspace_id: context.workspaceId,
    provider: context.provider,
    provider_account_id: context.providerAccountId,
    source_post_id: context.sourcePostId,
    source_channel: context.sourceChannel,
    caption: context.caption,
    permalink: context.permalink,
    media_type: context.mediaType,
    cta_label: context.ctaLabel,
    areas_mentioned: context.areasMentioned,
    listing_hints: context.listingHints,
    fetched_at: context.fetchedAt,
  };
}

export function createSupabaseSocialPostRepository(
  supabase: RealtyOpsSupabaseClient,
): SocialPostRepository {
  return {
    async upsertPostContexts(contexts) {
      if (contexts.length === 0) {
        return 0;
      }

      const { data, error } = await supabase
        .from("social_posts")
        .upsert(contexts.map(mapContextToRow), {
          onConflict: "workspace_id,provider,source_post_id",
        })
        .select("id");

      if (error !== null) {
        throw error;
      }

      return data?.length ?? contexts.length;
    },

    async findPostContext(params) {
      const { data, error } = await supabase
        .from("social_posts")
        .select("id,workspace_id,provider,provider_account_id,source_post_id,source_channel,caption,permalink,media_type,cta_label,areas_mentioned,listing_hints,fetched_at,created_at,updated_at")
        .eq("workspace_id", params.workspaceId)
        .eq("provider", params.provider)
        .eq("source_post_id", params.sourcePostId)
        .maybeSingle<SocialPostRow>();

      if (error !== null) {
        throw error;
      }

      return data ?? null;
    },
  };
}
