import { describe, expect, it } from "vitest";
import {
  ListingFactSchema,
  ListingMemorySchema,
  ListingMemoryUpsertRequestSchema,
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
      neighborhood: "River Oaks",
      propertyType: "single family",
      status: "Available",
      price: 339990,
      beds: 5,
      baths: 3,
      squareFeet: 2820,
      hasPool: false,
      photoUrl: "https://example.com/listing.jpg",
      videoUrl: "https://example.com/tour.mp4",
      mediaUrls: ["https://example.com/listing.jpg", "https://example.com/detail.webp"],
      notes: "4.99% interest rate and closing cost assistance.",
      incentives: ["4.99% interest rate", "closing cost assistance"],
    })).toMatchObject({
      address: "123 Main St, Houston, TX 77001",
      neighborhood: "River Oaks",
      propertyType: "single family",
      price: 339990,
      squareFeet: 2820,
      hasPool: false,
      videoUrl: "https://example.com/tour.mp4",
      mediaUrls: ["https://example.com/listing.jpg", "https://example.com/detail.webp"],
    });
  });
});

describe("ManualListingQuickUpdateRequestSchema", () => {
  it("accepts focused quick-refresh listing updates", () => {
    expect(ManualListingQuickUpdateRequestSchema.parse({
      status: "Sold",
      price: 349990,
      squareFeet: 2910,
      hasPool: false,
      verificationStatus: "verified",
    })).toMatchObject({
      status: "Sold",
      squareFeet: 2910,
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

describe("ListingMemorySchema", () => {
  it("accepts an operator-authored public smart prompt with content", () => {
    const parsed = ListingMemorySchema.parse({
      id: "11111111-1111-1111-1111-111111111111",
      workspaceId: "22222222-2222-2222-2222-222222222222",
      listingId: "33333333-3333-3333-3333-333333333333",
      kind: "common_question",
      visibility: "public",
      prompt: "Most buyers ask about schools near this one.",
      content: "Katy ISD, Cinco Ranch HS, ranked 9/10 on niche.com.",
      source: "operator",
      displayOrder: 0,
      createdByMemberId: "44444444-4444-4444-4444-444444444444",
      createdAt: "2026-05-25T12:00:00.000Z",
      updatedAt: "2026-05-25T12:00:00.000Z",
    });
    expect(parsed.visibility).toBe("public");
    expect(parsed.prompt).toContain("schools");
  });

  it("allows internal context notes with no visitor-facing prompt", () => {
    const parsed = ListingMemorySchema.parse({
      id: "11111111-1111-1111-1111-111111111111",
      workspaceId: "22222222-2222-2222-2222-222222222222",
      listingId: "33333333-3333-3333-3333-333333333333",
      kind: "context_note",
      visibility: "internal",
      prompt: null,
      content: "Seller is firm on price until July 1, then 5% reduction expected.",
      source: "operator",
      displayOrder: 0,
      createdByMemberId: null,
      createdAt: "2026-05-25T12:00:00.000Z",
      updatedAt: "2026-05-25T12:00:00.000Z",
    });
    expect(parsed.visibility).toBe("internal");
    expect(parsed.prompt).toBeNull();
  });
});

describe("ListingMemoryUpsertRequestSchema", () => {
  it("requires a prompt when visibility is public", () => {
    const result = ListingMemoryUpsertRequestSchema.safeParse({
      listingId: "33333333-3333-3333-3333-333333333333",
      kind: "common_question",
      visibility: "public",
      content: "Katy ISD — Cinco Ranch HS",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["prompt"]);
    }
  });

  it("accepts an internal note without a prompt", () => {
    const result = ListingMemoryUpsertRequestSchema.safeParse({
      listingId: "33333333-3333-3333-3333-333333333333",
      kind: "context_note",
      content: "Builder closes 30 days after contract.",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.visibility).toBe("internal");
      expect(result.data.displayOrder).toBe(0);
    }
  });
});
