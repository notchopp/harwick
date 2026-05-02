import { describe, expect, it } from "vitest";
import {
  filterListingsCards,
  mapListingFactRowToCard,
} from "./listings-data";
import type { ListingFactRow } from "../../lib/supabase/listings";

function buildListingRow(overrides: Partial<ListingFactRow> = {}): ListingFactRow {
  return {
    id: "listing-1",
    workspace_id: "workspace-1",
    source: "manual",
    external_listing_id: null,
    mls_number: "MLS-101",
    address: "123 Main St, Houston, TX 77001",
    status: "Active",
    price: 450000,
    beds: 4,
    baths: 3,
    has_pool: true,
    raw_facts: {
      neighborhood: "River Oaks",
      propertyType: "single family",
      squareFeet: 2820,
      photoUrl: "https://example.com/photo.jpg",
      notes: "Builder incentive still active.",
      incentives: ["4.99%", "closing costs"],
      publicUrl: "https://example.com/listing",
    },
    verification_status: "verified",
    verified_by_member_id: null,
    verified_at: "2026-04-29T12:00:00.000Z",
    needs_recheck_at: null,
    created_at: "2026-04-29T12:00:00.000Z",
    updated_at: "2026-04-30T12:00:00.000Z",
    ...overrides,
  };
}

describe("mapListingFactRowToCard", () => {
  it("maps listing facts into card-ready data", () => {
    const card = mapListingFactRowToCard(buildListingRow());

    expect(card).toMatchObject({
      marketStatus: "active",
      verificationLabel: "Verified",
      priceLabel: "$450,000",
      mlsLabel: "MLS-101",
      propertyTypeLabel: "single family",
      neighborhoodLabel: "River Oaks",
      squareFeetLabel: "2,820 sqft",
      publicUrl: "https://example.com/listing",
      photoUrl: "https://example.com/photo.jpg",
    });
  });

  it("treats sold rows as sold and recheck rows as recheck-filterable", () => {
    const soldCard = mapListingFactRowToCard(buildListingRow({
      status: "Sold",
    }));
    const recheckCard = mapListingFactRowToCard(buildListingRow({
      id: "listing-2",
      status: "Active",
      verification_status: "needs_recheck",
      needs_recheck_at: "2026-05-01T12:00:00.000Z",
    }));

    expect(soldCard.marketStatus).toBe("sold");
    expect(recheckCard.verificationLabel).toBe("Needs recheck");
    expect(filterListingsCards([soldCard, recheckCard], "recheck", false)).toEqual([recheckCard]);
  });
});
