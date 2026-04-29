import {
  MetaAccountFoundationSchema,
  normalizeFreeformText,
  type Logger,
  type MetaAccountFoundation,
  type MetaConnectedCredential,
  type MetaOAuthCredentialAccount,
} from "@realty-ops/core";
import {
  extractMetaAreas,
  extractMetaListingHints,
  type MetaGraphAccountFoundation,
} from "@realty-ops/integrations";
import type { ConnectedMetaIntegrationRecord } from "../../lib/supabase/integration-accounts";
import type { MetaAccountFoundationRepository } from "../../lib/supabase/meta-foundations";

export type MetaFoundationGraphClient = {
  fetchAccountFoundation(params: {
    pageId: string;
    instagramBusinessAccountId: string;
    accessToken: string;
    recentPostLimit?: number;
  }): Promise<MetaGraphAccountFoundation>;
};

function buildFoundationSignals(params: {
  biography: string | null;
  recentCaptions: Array<string | null>;
}): {
  areasMentioned: string[];
  listingHints: string[];
} {
  const signalText = normalizeFreeformText([
    params.biography,
    ...params.recentCaptions,
  ].filter((value): value is string => value !== null).join("\n"));

  return {
    areasMentioned: extractMetaAreas(signalText),
    listingHints: extractMetaListingHints(signalText),
  };
}

function buildFallbackFoundation(params: {
  connectedIntegration: ConnectedMetaIntegrationRecord;
  connectedAccount: MetaOAuthCredentialAccount;
  fetchedAt: string;
}): MetaAccountFoundation {
  return MetaAccountFoundationSchema.parse({
    workspaceId: params.connectedIntegration.workspaceId,
    integrationAccountId: params.connectedIntegration.integrationAccountId,
    accountScope: params.connectedIntegration.accountScope,
    ownerMemberId: params.connectedIntegration.ownerMemberId,
    provider: "meta",
    providerAccountId: params.connectedIntegration.providerAccountId,
    pageId: params.connectedAccount.pageId,
    pageName: params.connectedAccount.pageName,
    pageCategory: null,
    pageLinkUrl: null,
    instagramBusinessAccountId: params.connectedAccount.instagramBusinessAccountId,
    instagramUsername: params.connectedAccount.instagramUsername,
    instagramDisplayName: null,
    biography: null,
    websiteUrl: null,
    profilePhotoUrl: null,
    followerCount: null,
    followsCount: null,
    mediaCount: null,
    areasMentioned: [],
    listingHints: [],
    recentPosts: [],
    lastFetchedAt: params.fetchedAt,
  });
}

function buildEnrichedFoundation(params: {
  connectedIntegration: ConnectedMetaIntegrationRecord;
  graphFoundation: MetaGraphAccountFoundation;
  fetchedAt: string;
}): MetaAccountFoundation {
  const signals = buildFoundationSignals({
    biography: params.graphFoundation.biography,
    recentCaptions: params.graphFoundation.recentPosts.map((post) => post.caption),
  });

  return MetaAccountFoundationSchema.parse({
    workspaceId: params.connectedIntegration.workspaceId,
    integrationAccountId: params.connectedIntegration.integrationAccountId,
    accountScope: params.connectedIntegration.accountScope,
    ownerMemberId: params.connectedIntegration.ownerMemberId,
    provider: "meta",
    providerAccountId: params.connectedIntegration.providerAccountId,
    pageId: params.graphFoundation.pageId,
    pageName: params.graphFoundation.pageName,
    pageCategory: params.graphFoundation.pageCategory,
    pageLinkUrl: params.graphFoundation.pageLinkUrl,
    instagramBusinessAccountId: params.graphFoundation.instagramBusinessAccountId,
    instagramUsername: params.graphFoundation.instagramUsername,
    instagramDisplayName: params.graphFoundation.instagramDisplayName,
    biography: params.graphFoundation.biography,
    websiteUrl: params.graphFoundation.websiteUrl,
    profilePhotoUrl: params.graphFoundation.profilePhotoUrl,
    followerCount: params.graphFoundation.followerCount,
    followsCount: params.graphFoundation.followsCount,
    mediaCount: params.graphFoundation.mediaCount,
    areasMentioned: signals.areasMentioned,
    listingHints: signals.listingHints,
    recentPosts: params.graphFoundation.recentPosts,
    lastFetchedAt: params.fetchedAt,
  });
}

export async function bootstrapMetaAccountFoundation(params: {
  connectedIntegration: ConnectedMetaIntegrationRecord;
  connectedAccount: MetaOAuthCredentialAccount;
  connectedCredential: MetaConnectedCredential;
  graphClient: MetaFoundationGraphClient;
  repository: MetaAccountFoundationRepository;
  logger: Logger;
  now?: Date;
}): Promise<MetaAccountFoundation> {
  const fetchedAt = (params.now ?? new Date()).toISOString();
  const fallbackFoundation = buildFallbackFoundation({
    connectedIntegration: params.connectedIntegration,
    connectedAccount: params.connectedAccount,
    fetchedAt,
  });

  let foundation = fallbackFoundation;

  try {
    const graphFoundation = await params.graphClient.fetchAccountFoundation({
      pageId: params.connectedCredential.pageId,
      instagramBusinessAccountId: params.connectedCredential.instagramBusinessAccountId,
      accessToken: params.connectedCredential.pageAccessToken,
    });
    foundation = buildEnrichedFoundation({
      connectedIntegration: params.connectedIntegration,
      graphFoundation,
      fetchedAt,
    });
  } catch (error) {
    params.logger.warn("meta foundation bootstrap fell back to oauth snapshot", {
      workspaceId: params.connectedIntegration.workspaceId,
      integrationAccountId: params.connectedIntegration.integrationAccountId,
      providerAccountId: params.connectedIntegration.providerAccountId,
      pageId: params.connectedCredential.pageId,
      instagramBusinessAccountId: params.connectedCredential.instagramBusinessAccountId,
      error,
    });
  }

  await params.repository.upsertFoundation(foundation);
  return foundation;
}
