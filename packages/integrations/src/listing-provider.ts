import type { ListingFact, ListingProviderLookupInput } from "@realty-ops/core";

export class ListingProviderRequestError extends Error {
  provider: string;

  constructor(params: {
    provider: string;
    message: string;
    cause?: unknown;
  }) {
    super(params.message);
    this.name = "ListingProviderRequestError";
    this.provider = params.provider;

    if (params.cause !== undefined) {
      const errorWithCause = this as Error & { cause?: unknown };
      errorWithCause["cause"] = params.cause;
    }
  }
}

export type ListingProviderClient = {
  provider: string;
  lookupListing(params: ListingProviderLookupInput): Promise<ListingFact | null>;
};
