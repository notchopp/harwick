import { createLogger, type ListingFact } from "@realty-ops/core";
import { describe, expect, it, vi } from "vitest";
import { ListingProviderRequestError, type ListingProviderClient } from "@realty-ops/integrations";
import type { ListingFactRow, ListingFactsRepository } from "../../lib/supabase/listings";
import { createListingLookupRepository } from "./listing-lookup";

function buildListingRow(overrides: Partial<ListingFactRow> = {}): ListingFactRow {
  return {
    id: "listing-row-1",
    workspace_id: "workspace-1",
    source: "repliers",
    external_listing_id: "listing-1",
    mls_number: "HAR-12345",
    address: "123 Main St, Houston, TX 77001",
    status: "Active",
    price: 450000,
    beds: 4,
    baths: 3.5,
    has_pool: true,
    raw_facts: {},
    verification_status: "verified",
    verified_by_member_id: null,
    verified_at: "2026-04-29T12:00:00.000Z",
    needs_recheck_at: null,
    created_at: "2026-04-29T12:00:00.000Z",
    updated_at: "2026-04-29T12:00:00.000Z",
    ...overrides,
  };
}

function buildListingFact(overrides: Partial<ListingFact> = {}): ListingFact {
  return {
    source: "repliers",
    externalListingId: "listing-1",
    mlsNumber: "HAR-12345",
    address: "123 Main St, Houston, TX 77001",
    status: "Active",
    price: 450000,
    beds: 4,
    baths: 3.5,
    hasPool: true,
    rawFacts: {},
    verifiedAt: "2026-04-29T12:05:00.000Z",
    ...overrides,
  };
}

function buildRepository(overrides: Partial<ListingFactsRepository>): ListingFactsRepository {
  return {
    findCachedListing: vi.fn(),
    saveListingFact: vi.fn(),
    listWorkspaceListings: vi.fn(),
    findListingById: vi.fn(),
    updateListingFact: vi.fn(),
    completeVerifyListingTasks: vi.fn().mockResolvedValue(0),
    enqueueListingRecheck: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("createListingLookupRepository", () => {
  it("returns a fresh cached listing without calling the provider", async () => {
    const findCachedListing = vi.fn<ListingFactsRepository["findCachedListing"]>()
      .mockResolvedValue(buildListingRow());
    const saveListingFact = vi.fn<ListingFactsRepository["saveListingFact"]>();
    const repository = buildRepository({
      findCachedListing,
      saveListingFact,
    });
    const lookupListing = vi.fn<ListingProviderClient["lookupListing"]>();
    const provider: ListingProviderClient = {
      provider: "repliers",
      lookupListing,
    };
    const listingRepository = createListingLookupRepository({
      repository,
      provider,
      logger: createLogger({
        service: "test",
        environment: "development",
        write: () => {},
      }),
      now: () => new Date("2026-04-29T12:10:00.000Z"),
    });

    const result = await listingRepository.lookupListing({
      workspaceId: "workspace-1",
      query: "123 Main St",
      address: "123 Main St",
    });

    expect(result?.address).toBe("123 Main St, Houston, TX 77001");
    expect(lookupListing).not.toHaveBeenCalled();
  });

  it("refreshes a stale listing from the provider and persists the updated facts", async () => {
    const findCachedListing = vi.fn<ListingFactsRepository["findCachedListing"]>()
      .mockResolvedValue(buildListingRow({
        verified_at: "2026-04-29T11:00:00.000Z",
      }));
    const saveListingFact = vi.fn<ListingFactsRepository["saveListingFact"]>()
      .mockResolvedValue(buildListingRow({
        price: 470000,
        verified_at: "2026-04-29T12:05:00.000Z",
      }));
    const repository = buildRepository({
      findCachedListing,
      saveListingFact,
    });
    const lookupListing = vi.fn<ListingProviderClient["lookupListing"]>()
      .mockResolvedValue(buildListingFact({
        price: 470000,
      }));
    const provider: ListingProviderClient = {
      provider: "repliers",
      lookupListing,
    };
    const listingRepository = createListingLookupRepository({
      repository,
      provider,
      logger: createLogger({
        service: "test",
        environment: "development",
        write: () => {},
      }),
      now: () => new Date("2026-04-29T12:10:00.000Z"),
    });

    const result = await listingRepository.lookupListing({
      workspaceId: "workspace-1",
      query: "123 Main St",
      address: "123 Main St",
    });

    expect(lookupListing).toHaveBeenCalledWith({
      query: "123 Main St",
      address: "123 Main St",
    });
    expect(saveListingFact).toHaveBeenCalledTimes(1);
    const savedCall = saveListingFact.mock.calls[0]?.[0];
    if (savedCall === undefined) {
      throw new Error("Expected saveListingFact payload.");
    }
    expect(savedCall.workspaceId).toBe("workspace-1");
    expect(savedCall.listing.price).toBe(470000);
    expect(result?.price).toBe(470000);
  });

  it("falls back to cached data when the provider is unavailable", async () => {
    const cachedListing = buildListingRow({
      verified_at: "2026-04-29T11:00:00.000Z",
    });
    const findCachedListing = vi.fn<ListingFactsRepository["findCachedListing"]>()
      .mockResolvedValue(cachedListing);
    const saveListingFact = vi.fn<ListingFactsRepository["saveListingFact"]>();
    const repository = buildRepository({
      findCachedListing,
      saveListingFact,
    });
    const writes: string[] = [];
    const lookupListing = vi.fn<ListingProviderClient["lookupListing"]>()
      .mockRejectedValue(new ListingProviderRequestError({
        provider: "repliers",
        message: "upstream unavailable",
      }));
    const provider: ListingProviderClient = {
      provider: "repliers",
      lookupListing,
    };
    const listingRepository = createListingLookupRepository({
      repository,
      provider,
      logger: createLogger({
        service: "test",
        environment: "development",
        write: (_level, line) => {
          writes.push(line);
        },
      }),
      now: () => new Date("2026-04-29T12:10:00.000Z"),
    });

    const result = await listingRepository.lookupListing({
      workspaceId: "workspace-1",
      query: "123 Main St",
      address: "123 Main St",
    });

    expect(result?.address).toBe(cachedListing.address);
    expect(writes[0]).toContain("listing provider lookup fell back to cached data");
  });

  it("does not return stale cached data when the provider reports no match", async () => {
    const findCachedListing = vi.fn<ListingFactsRepository["findCachedListing"]>()
      .mockResolvedValue(buildListingRow({
        verified_at: "2026-04-29T11:00:00.000Z",
      }));
    const saveListingFact = vi.fn<ListingFactsRepository["saveListingFact"]>();
    const repository = buildRepository({
      findCachedListing,
      saveListingFact,
    });
    const lookupListing = vi.fn<ListingProviderClient["lookupListing"]>()
      .mockResolvedValue(null);
    const provider: ListingProviderClient = {
      provider: "repliers",
      lookupListing,
    };
    const listingRepository = createListingLookupRepository({
      repository,
      provider,
      logger: createLogger({
        service: "test",
        environment: "development",
        write: () => {},
      }),
      now: () => new Date("2026-04-29T12:10:00.000Z"),
    });

    await expect(listingRepository.lookupListing({
      workspaceId: "workspace-1",
      query: "123 Main St",
      address: "123 Main St",
    })).resolves.toBeNull();
  });
});
