import { describe, expect, it } from "vitest";
import {
  ListingFactSchema,
  ListingProviderLookupInputSchema,
  ManualListingFactRequestSchema,
  ManualListingCsvImportRequestSchema,
  ManualListingQuickUpdateRequestSchema,
  ManualListingVerifyRequestSchema,
} from "./listing.js";

describe("ListingFactSchema", () => {
  it("parses normalized provider-backed listing facts", () => {
    expect(ListingFactSchema.parse({
      source: "repliers",
      externalListingId: "listing-123",
      mlsNumber: "HAR-12345",
      address: "123 Main St, Houston, TX 77001",
      status: "Active",
      price: 450000,
      beds: 4,
      baths: 3.5,
      hasPool: true,
      rawFacts: {
        listingId: "listing-123",
      },
      verifiedAt: "2026-04-29T12:00:00.000Z",
    })).toMatchObject({
      source: "repliers",
      mlsNumber: "HAR-12345",
      price: 450000,
      hasPool: true,
    });
  });

  it("rejects missing addresses", () => {
    expect(() => ListingFactSchema.parse({
      source: "repliers",
      externalListingId: null,
      mlsNumber: "HAR-12345",
      address: "",
      status: "Active",
      price: 450000,
      beds: 4,
      baths: 3.5,
      hasPool: true,
      rawFacts: {},
      verifiedAt: "2026-04-29T12:00:00.000Z",
    })).toThrow();
  });
});

describe("ListingProviderLookupInputSchema", () => {
  it("parses listing lookup input with optional MLS number and address", () => {
    expect(ListingProviderLookupInputSchema.parse({
      query: "123 Main St",
      mlsNumber: "HAR-12345",
      address: "123 Main St",
    })).toEqual({
      query: "123 Main St",
      mlsNumber: "HAR-12345",
      address: "123 Main St",
    });
  });
});

describe("ManualListingFactRequestSchema", () => {
  it("accepts manually entered workspace listing facts", () => {
    expect(ManualListingFactRequestSchema.parse({
      address: "123 Main St, Houston, TX 77001",
      status: "Available",
      price: 339990,
      beds: 5,
      baths: 3,
      hasPool: false,
      notes: "4.99% interest rate and closing cost assistance.",
      incentives: ["4.99% interest rate", "closing cost assistance"],
    })).toMatchObject({
      address: "123 Main St, Houston, TX 77001",
      price: 339990,
      hasPool: false,
    });
  });
});

describe("ManualListingQuickUpdateRequestSchema", () => {
  it("accepts focused quick-refresh listing updates", () => {
    expect(ManualListingQuickUpdateRequestSchema.parse({
      status: "Sold",
      price: 349990,
      hasPool: false,
      verificationStatus: "verified",
    })).toMatchObject({
      status: "Sold",
      verificationStatus: "verified",
    });
  });

  it("rejects empty quick-refresh updates", () => {
    expect(() => ManualListingQuickUpdateRequestSchema.parse({})).toThrow();
  });
});

describe("ManualListingVerifyRequestSchema", () => {
  it("accepts verification notes and a next recheck timestamp", () => {
    expect(ManualListingVerifyRequestSchema.parse({
      notes: "Agent confirmed with builder rep.",
      needsRecheckAt: "2026-04-30T12:00:00.000Z",
    })).toMatchObject({
      notes: "Agent confirmed with builder rep.",
    });
  });
});

describe("ManualListingCsvImportRequestSchema", () => {
  it("accepts a csv import payload", () => {
    expect(ManualListingCsvImportRequestSchema.parse({
      csv: "address,price\n123 Main St,339990",
    }).csv).toContain("address");
  });
});
