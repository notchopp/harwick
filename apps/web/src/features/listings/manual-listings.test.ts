import { describe, expect, it, vi } from "vitest";
import type { ListingFactRow, ListingFactsRepository } from "../../lib/supabase/listings";
import {
  importManualListingCsv,
  quickUpdateManualListingFact,
  upsertManualListingFact,
  verifyManualListingFact,
} from "./manual-listings";

function buildListingRow(overrides: Partial<ListingFactRow> = {}): ListingFactRow {
  return {
    id: "listing-row-1",
    workspace_id: "workspace-1",
    source: "manual",
    external_listing_id: null,
    mls_number: null,
    address: "123 Main St, Houston, TX 77001",
    status: "Available",
    price: 339990,
    beds: 5,
    baths: 3,
    has_pool: false,
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

describe("upsertManualListingFact", () => {
  it("normalizes manual listing details into a listing fact", async () => {
    const saveListingFact = vi.fn<ListingFactsRepository["saveListingFact"]>()
      .mockResolvedValue(buildListingRow());

    await upsertManualListingFact({
      workspaceId: "workspace-1",
      request: {
        address: "123 Main St, Houston, TX 77001",
        status: "Available",
        price: 339990,
        beds: 5,
        baths: 3,
        hasPool: false,
        notes: "4.99% interest rate and closing cost assistance.",
        incentives: ["4.99% interest rate", "closing cost assistance"],
      },
      repository: {
        findCachedListing: vi.fn(),
        saveListingFact,
        listWorkspaceListings: vi.fn(),
        findListingById: vi.fn(),
        updateListingFact: vi.fn(),
      },
      now: () => new Date("2026-04-29T12:00:00.000Z"),
    });

    const payload = saveListingFact.mock.calls[0]?.[0];
    if (payload === undefined) {
      throw new Error("Expected manual listing save payload.");
    }
    expect(payload.workspaceId).toBe("workspace-1");
    expect(payload.listing.source).toBe("manual");
    expect(payload.listing.rawFacts).toMatchObject({
      notes: "4.99% interest rate and closing cost assistance.",
      incentives: ["4.99% interest rate", "closing cost assistance"],
    });
  });

  it("applies quick refresh updates and marks factual changes verified", async () => {
    const updateListingFact = vi.fn<ListingFactsRepository["updateListingFact"]>()
      .mockResolvedValue(buildListingRow({
        status: "Sold",
        price: 349990,
      }));

    await quickUpdateManualListingFact({
      workspaceId: "workspace-1",
      listingId: "listing-row-1",
      memberId: "member-1",
      request: {
        status: "Sold",
        price: 349990,
        hasPool: false,
      },
      repository: {
        findCachedListing: vi.fn(),
        saveListingFact: vi.fn(),
        listWorkspaceListings: vi.fn(),
        findListingById: vi.fn().mockResolvedValue(buildListingRow()),
        updateListingFact,
      },
      now: () => new Date("2026-04-29T13:00:00.000Z"),
    });

    const payload = updateListingFact.mock.calls[0]?.[0];
    if (payload === undefined) {
      throw new Error("Expected listing quick update payload.");
    }
    expect(payload.values).toMatchObject({
      source: "manual",
      status: "Sold",
      price: 349990,
      has_pool: false,
      verification_status: "verified",
      verified_by_member_id: "member-1",
      verified_at: "2026-04-29T13:00:00.000Z",
    });
  });

  it("marks a listing verified now with notes and a future recheck", async () => {
    const updateListingFact = vi.fn<ListingFactsRepository["updateListingFact"]>()
      .mockResolvedValue(buildListingRow());

    await verifyManualListingFact({
      workspaceId: "workspace-1",
      listingId: "listing-row-1",
      memberId: "member-1",
      request: {
        notes: "confirmed with builder rep",
        needsRecheckAt: "2026-04-30T12:00:00.000Z",
      },
      repository: {
        findCachedListing: vi.fn(),
        saveListingFact: vi.fn(),
        listWorkspaceListings: vi.fn(),
        findListingById: vi.fn().mockResolvedValue(buildListingRow()),
        updateListingFact,
      },
      now: () => new Date("2026-04-29T13:00:00.000Z"),
    });

    const payload = updateListingFact.mock.calls[0]?.[0];
    if (payload === undefined) {
      throw new Error("Expected listing verification payload.");
    }
    expect(payload.values).toMatchObject({
      source: "manual",
      verification_status: "verified",
      verified_by_member_id: "member-1",
      verified_at: "2026-04-29T13:00:00.000Z",
      needs_recheck_at: "2026-04-30T12:00:00.000Z",
      raw_facts: expect.objectContaining({
        notes: "confirmed with builder rep",
        lastManualRefreshSource: "verified_now",
      }) as Record<string, unknown>,
    });
  });

  it("imports CSV listing rows through the manual listing normalizer", async () => {
    const saveListingFact = vi.fn<ListingFactsRepository["saveListingFact"]>()
      .mockImplementation((params) => Promise.resolve(buildListingRow({
        address: params.listing.address,
        price: params.listing.price,
      })));
    const updateListingFact = vi.fn<ListingFactsRepository["updateListingFact"]>()
      .mockImplementation((params) => Promise.resolve(buildListingRow({
        id: params.listingId,
        verified_by_member_id: params.values.verified_by_member_id ?? null,
      })));

    const result = await importManualListingCsv({
      workspaceId: "workspace-1",
      memberId: "member-1",
      request: {
        csv: [
          "address,price,beds,baths,pool,notes,incentives",
          "\"123 Main St, Houston, TX\",339990,5,3,no,\"closing cost help\",\"4.99%;builder credits\"",
          ",450000,4,2,yes,missing address,",
        ].join("\n"),
      },
      repository: {
        findCachedListing: vi.fn().mockResolvedValue(null),
        saveListingFact,
        listWorkspaceListings: vi.fn(),
        findListingById: vi.fn(),
        updateListingFact,
      },
      now: () => new Date("2026-04-29T14:00:00.000Z"),
    });

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
    const savedPayload = saveListingFact.mock.calls[0]?.[0];
    if (savedPayload === undefined) {
      throw new Error("Expected CSV listing save payload.");
    }
    expect(savedPayload.listing).toMatchObject({
      address: "123 Main St, Houston, TX",
      price: 339990,
      beds: 5,
      baths: 3,
      hasPool: false,
    });
    expect(savedPayload.listing.rawFacts).toMatchObject({
      notes: "closing cost help",
      incentives: ["4.99%", "builder credits"],
    });
    expect(updateListingFact).toHaveBeenCalledWith(expect.objectContaining({
      values: expect.objectContaining({
        verified_by_member_id: "member-1",
      }) as Record<string, unknown>,
    }));
  });
});
