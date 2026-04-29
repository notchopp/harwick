import {
  ListingFactSchema,
  ListingProviderLookupInputSchema,
  type ListingFact,
} from "@realty-ops/core";
import { ListingProviderRequestError, type ListingProviderClient } from "./listing-provider.js";

const REPLIERS_API_BASE_URL = "https://api.repliers.io";

type RepliersListingClientOptions = {
  apiKey: string;
  boardId?: number;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getNestedValue(record: Record<string, unknown>, path: string): unknown {
  let current: unknown = record;
  for (const segment of path.split(".")) {
    if (!isRecord(current) || !(segment in current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function readFirstString(record: Record<string, unknown>, paths: readonly string[]): string | null {
  for (const path of paths) {
    const value = getNestedValue(record, path);
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function readFirstNumber(record: Record<string, unknown>, paths: readonly string[]): number | null {
  for (const path of paths) {
    const value = getNestedValue(record, path);
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const normalized = Number(value.replace(/[$,]/g, ""));
      if (Number.isFinite(normalized)) {
        return normalized;
      }
    }
  }

  return null;
}

function readFirstBoolean(record: Record<string, unknown>, paths: readonly string[]): boolean | null {
  for (const path of paths) {
    const value = getNestedValue(record, path);
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "string") {
      if (/^(true|yes|y)$/i.test(value.trim())) {
        return true;
      }
      if (/^(false|no|n)$/i.test(value.trim())) {
        return false;
      }
    }
  }

  return null;
}

function readTextFragments(value: unknown): string[] {
  if (typeof value === "string" && value.trim().length > 0) {
    return [value.trim()];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => readTextFragments(entry));
  }
  if (isRecord(value)) {
    return Object.values(value).flatMap((entry) => readTextFragments(entry));
  }

  return [];
}

function readPoolSignal(record: Record<string, unknown>): boolean | null {
  const explicitBoolean = readFirstBoolean(record, [
    "hasPool",
    "details.hasPool",
    "pool",
    "details.pool",
  ]);
  if (explicitBoolean !== null) {
    return explicitBoolean;
  }

  const poolText = [
    ...readTextFragments(getNestedValue(record, "poolFeatures")),
    ...readTextFragments(getNestedValue(record, "details.poolFeatures")),
    ...readTextFragments(getNestedValue(record, "amenities")),
    ...readTextFragments(getNestedValue(record, "propertyFeatures")),
  ].join(" ");
  if (poolText.length === 0) {
    return null;
  }

  return /\bpool\b/i.test(poolText);
}

function buildAddress(record: Record<string, unknown>): string | null {
  const directAddress = readFirstString(record, [
    "address.full",
    "address.fullAddress",
    "address.streetAddress",
    "address.addr1",
    "address.unparsedAddress",
    "address",
  ]);
  if (directAddress !== null) {
    return directAddress;
  }

  const streetNumber = readFirstString(record, ["address.streetNumber"]);
  const streetName = readFirstString(record, ["address.streetName"]);
  const city = readFirstString(record, ["address.city"]);
  const state = readFirstString(record, ["address.state", "address.province"]);
  const postalCode = readFirstString(record, ["address.postalCode", "address.zip"]);

  const lineOne = [streetNumber, streetName].filter((value): value is string => value !== null).join(" ");
  const locality = [city, state].filter((value): value is string => value !== null).join(", ");
  const lineTwo = postalCode === null || locality.length === 0 ? [locality, postalCode].filter((value): value is string => value !== null).join(" ") : `${locality} ${postalCode}`;
  const fullAddress = [lineOne, lineTwo].filter((value) => value.length > 0).join(", ");
  return fullAddress.length > 0 ? fullAddress : null;
}

function readListingCandidates(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((entry): entry is Record<string, unknown> => isRecord(entry));
  }

  if (!isRecord(payload)) {
    return [];
  }

  for (const key of ["listings", "results", "data"]) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value.filter((entry): entry is Record<string, unknown> => isRecord(entry));
    }
  }

  return [payload];
}

function normalizeListing(params: {
  listing: Record<string, unknown>;
  fallbackAddress: string | null;
  fetchedAt: string;
}): ListingFact | null {
  const bathsTotal = readFirstNumber(params.listing, [
    "baths",
    "bathroomsTotal",
    "numBathrooms",
    "details.numBathrooms",
  ]);
  const fullBaths = readFirstNumber(params.listing, ["bathroomsFull", "details.numBathroomsFull"]);
  const halfBaths = readFirstNumber(params.listing, ["bathroomsHalf", "details.numBathroomsHalf"]);
  const normalizedBaths = bathsTotal ?? (fullBaths === null && halfBaths === null ? null : (fullBaths ?? 0) + ((halfBaths ?? 0) * 0.5));

  const address = buildAddress(params.listing) ?? params.fallbackAddress;
  if (address === null) {
    return null;
  }

  return ListingFactSchema.parse({
    source: "repliers",
    externalListingId: readFirstString(params.listing, ["id", "listingId", "listing_id"]),
    mlsNumber: readFirstString(params.listing, ["mlsNumber", "mls_id", "listingKey"]),
    address,
    status: readFirstString(params.listing, ["status", "listingStatus", "lastStatus"]),
    price: readFirstNumber(params.listing, ["listPrice", "price", "currentPrice"]),
    beds: readFirstNumber(params.listing, [
      "beds",
      "bedroomsTotal",
      "numBedrooms",
      "details.numBedrooms",
      "details.numBedroomsTotal",
    ]),
    baths: normalizedBaths,
    hasPool: readPoolSignal(params.listing),
    rawFacts: params.listing,
    verifiedAt: params.fetchedAt,
  });
}

export function createRepliersListingClient(options: RepliersListingClientOptions): ListingProviderClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl ?? REPLIERS_API_BASE_URL;

  async function request(pathname: string, searchParams: Record<string, string>): Promise<unknown> {
    const url = new URL(pathname, baseUrl);
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value);
    }

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "REPLIERS-API-KEY": options.apiKey,
        },
      });
    } catch (error) {
      throw new ListingProviderRequestError({
        provider: "repliers",
        message: "Repliers listing request failed before receiving a response",
        cause: error,
      });
    }

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new ListingProviderRequestError({
        provider: "repliers",
        message: `Repliers listing request failed (${response.status}): ${text}`,
      });
    }

    return response.json();
  }

  return {
    provider: "repliers",
    async lookupListing(input) {
      const parsed = ListingProviderLookupInputSchema.parse(input);
      const fetchedAt = new Date().toISOString();
      const commonSearchParams = options.boardId === undefined ? {} : {
        boardId: String(options.boardId),
      };

      if (parsed.mlsNumber !== undefined && parsed.mlsNumber !== null) {
        const detailPayload = await request(`/listings/${encodeURIComponent(parsed.mlsNumber)}`, commonSearchParams);
        if (detailPayload !== null) {
          const normalized = normalizeListing({
            listing: readListingCandidates(detailPayload)[0] ?? {},
            fallbackAddress: parsed.address ?? null,
            fetchedAt,
          });
          if (normalized !== null) {
            return normalized;
          }
        }
      }

      const searchPayload = await request("/listings", {
        ...commonSearchParams,
        search: parsed.address ?? parsed.query,
        searchFields: "address.streetNumber,address.streetName,address.city,mlsNumber",
      });
      if (searchPayload === null) {
        return null;
      }

      const firstCandidate = readListingCandidates(searchPayload)[0];
      if (firstCandidate === undefined) {
        return null;
      }

      return normalizeListing({
        listing: firstCandidate,
        fallbackAddress: parsed.address ?? parsed.query,
        fetchedAt,
      });
    },
  };
}
