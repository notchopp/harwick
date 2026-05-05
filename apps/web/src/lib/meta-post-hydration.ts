import type { Logger, SocialPostContext } from "@realty-ops/core";
import { SocialPostContextSchema } from "@realty-ops/core";
import { createMetaGraphClient, type VisionClient } from "@realty-ops/integrations";
import { z } from "zod";
import { hydratePostVisualDescription } from "../features/lead-intake/post-vision-hydrator";
import { decryptCredential } from "./credentials";
import type { ConnectedMetaCredentialRecord } from "./supabase/integration-accounts";

const MetaCredentialSchema = z.object({
  userAccessToken: z.string().trim().min(1),
  pageAccessToken: z.string().trim().min(1),
  pageId: z.string().trim().min(1),
  instagramBusinessAccountId: z.string().trim().min(1),
});

type MetaCredentialRepository = {
  findConnectedCredential(params: {
    workspaceId: string;
    providerAccountId: string;
  }): Promise<ConnectedMetaCredentialRecord | null>;
};

function mergeUnique(items: readonly string[], otherItems: readonly string[]): string[] {
  return [...new Set([...items, ...otherItems])];
}

function mergeContexts(base: SocialPostContext, fetched: SocialPostContext): SocialPostContext {
  return SocialPostContextSchema.parse({
    ...base,
    caption: fetched.caption ?? base.caption,
    permalink: fetched.permalink ?? base.permalink,
    mediaType: fetched.mediaType ?? base.mediaType,
    ctaLabel: fetched.ctaLabel ?? base.ctaLabel,
    areasMentioned: mergeUnique(base.areasMentioned, fetched.areasMentioned),
    listingHints: mergeUnique(base.listingHints, fetched.listingHints),
    fetchedAt: fetched.fetchedAt,
    rawPayload: fetched.rawPayload,
  });
}

export function isSocialPostContextThin(context: {
  caption: string | null;
  permalink: string | null;
  mediaType: string | null;
  ctaLabel: string | null;
  areasMentioned: readonly string[];
  listingHints: readonly string[];
}): boolean {
  return context.caption === null
    || context.permalink === null
    || context.mediaType === null
    || (context.ctaLabel === null && context.areasMentioned.length === 0 && context.listingHints.length === 0);
}

export async function hydrateMetaSocialPostContext(params: {
  workspaceId: string;
  providerAccountId: string;
  sourcePostId: string;
  sourceChannel: "instagram_comment" | "facebook_comment";
  credentialSecret: string;
  integrationRepository: MetaCredentialRepository;
  existingContext?: SocialPostContext | null;
  fetchImpl?: typeof fetch;
}): Promise<SocialPostContext | null> {
  const credentialRecord = await params.integrationRepository.findConnectedCredential({
    workspaceId: params.workspaceId,
    providerAccountId: params.providerAccountId,
  });

  if (credentialRecord === null) {
    return params.existingContext ?? null;
  }

  const credential = MetaCredentialSchema.parse(
    decryptCredential<unknown>(credentialRecord.encryptedCredentialRef, params.credentialSecret),
  );
  const fetched = await createMetaGraphClient({
    ...(params.fetchImpl === undefined ? {} : { fetchImpl: params.fetchImpl }),
  }).fetchPostContext({
    workspaceId: params.workspaceId,
    providerAccountId: params.providerAccountId,
    sourcePostId: params.sourcePostId,
    sourceChannel: params.sourceChannel,
    accessToken: credential.pageAccessToken,
  });

  return params.existingContext === undefined || params.existingContext === null
    ? fetched
    : mergeContexts(params.existingContext, fetched);
}

export function createMetaSocialPostContextHydrator(params: {
  credentialSecret: string;
  integrationRepository: MetaCredentialRepository;
  fetchImpl?: typeof fetch;
  vision?: VisionClient;
  logger?: Logger;
}) {
  return async function hydrate(contexts: SocialPostContext[]): Promise<SocialPostContext[]> {
    return Promise.all(
      contexts.map(async (context) => {
        let next = context;
        if (isSocialPostContextThin(context)) {
          const hydratedContext = await hydrateMetaSocialPostContext({
            workspaceId: context.workspaceId,
            providerAccountId: context.providerAccountId,
            sourcePostId: context.sourcePostId,
            sourceChannel: context.sourceChannel,
            credentialSecret: params.credentialSecret,
            integrationRepository: params.integrationRepository,
            existingContext: context,
            ...(params.fetchImpl === undefined ? {} : { fetchImpl: params.fetchImpl }),
          });
          next = hydratedContext ?? context;
        }

        if (params.vision !== undefined && params.logger !== undefined) {
          next = await hydratePostVisualDescription(
            { vision: params.vision, logger: params.logger },
            next,
          );
        }

        return next;
      }),
    );
  };
}
