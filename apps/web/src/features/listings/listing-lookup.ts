import { ListingProviderLookupInputSchema, type Logger } from "@realty-ops/core";
import { ListingProviderRequestError, type ListingProviderClient } from "@realty-ops/integrations";
import type { ListingFactsRepository, ListingLookupRepository } from "../../lib/supabase/listings";

export const DEFAULT_LISTING_STALE_AFTER_MS = 15 * 60 * 1000;

export function isListingFactFresh(params: {
  verifiedAt: string | null;
  now: Date;
  staleAfterMs: number;
}): boolean {
  if (params.verifiedAt === null) {
    return false;
  }

  const verifiedAt = Date.parse(params.verifiedAt);
  if (Number.isNaN(verifiedAt)) {
    return false;
  }

  return params.now.getTime() - verifiedAt <= params.staleAfterMs;
}

export function createListingLookupRepository(params: {
  repository: ListingFactsRepository;
  logger: Logger;
  provider?: ListingProviderClient;
  staleAfterMs?: number;
  now?: () => Date;
}): ListingLookupRepository {
  return {
    async lookupListing(input) {
      const lookupInput = ListingProviderLookupInputSchema.parse(input);
      const cachedListing = await params.repository.findCachedListing({
        workspaceId: input.workspaceId,
        query: lookupInput.query,
        ...(lookupInput.mlsNumber === undefined ? {} : { mlsNumber: lookupInput.mlsNumber }),
        ...(lookupInput.address === undefined ? {} : { address: lookupInput.address }),
      });
      const now = params.now?.() ?? new Date();
      const staleAfterMs = params.staleAfterMs ?? DEFAULT_LISTING_STALE_AFTER_MS;

      if (params.provider === undefined || isListingFactFresh({
        verifiedAt: cachedListing?.verified_at ?? null,
        now,
        staleAfterMs,
      })) {
        return cachedListing;
      }

      try {
        const liveListing = await params.provider.lookupListing(lookupInput);
        if (liveListing === null) {
          return null;
        }

        return params.repository.saveListingFact({
          workspaceId: input.workspaceId,
          listing: liveListing,
        });
      } catch (error) {
        if (error instanceof ListingProviderRequestError) {
          params.logger.warn("listing provider lookup fell back to cached data", {
            workspaceId: input.workspaceId,
            provider: error.provider,
            query: lookupInput.query,
            mlsNumber: lookupInput.mlsNumber,
            address: lookupInput.address,
            error,
          });
          return cachedListing;
        }

        throw error;
      }
    },
  };
}
