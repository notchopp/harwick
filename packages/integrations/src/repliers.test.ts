import { describe, expect, it, vi } from "vitest";
import { createRepliersListingClient } from "./repliers.js";
import { ListingProviderRequestError } from "./listing-provider.js";

function createResponse(params: {
  ok?: boolean;
  status?: number;
  body?: unknown;
  text?: string;
}) {
  return {
    ok: params.ok ?? true,
    status: params.status ?? 200,
    json: vi.fn().mockResolvedValue(params.body ?? {}),
    text: vi.fn().mockResolvedValue(params.text ?? ""),
  } as unknown as Response;
}

describe("createRepliersListingClient", () => {
  it("fetches listing details by MLS number and normalizes key facts", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(createResponse({
      body: {
        listingId: "listing-1",
        mlsNumber: "HAR-12345",
        listPrice: 525000,
        status: "Active",
        beds: 4,
        baths: 3.5,
        poolFeatures: ["In Ground Pool"],
        address: {
          streetNumber: "123",
          streetName: "Main St",
          city: "Houston",
          state: "TX",
          postalCode: "77001",
        },
      },
    }));
    const client = createRepliersListingClient({
      apiKey: "repliers-key",
      boardId: 101,
      fetchImpl,
    });

    const listing = await client.lookupListing({
      query: "HAR-12345",
      mlsNumber: "HAR-12345",
    });

    expect(listing).toMatchObject({
      source: "repliers",
      externalListingId: "listing-1",
      mlsNumber: "HAR-12345",
      address: "123 Main St, Houston, TX 77001",
      status: "Active",
      price: 525000,
      beds: 4,
      baths: 3.5,
      hasPool: true,
    });
    const firstCall = fetchImpl.mock.calls[0];
    const calledUrl = firstCall?.[0];
    expect(calledUrl instanceof URL ? calledUrl.toString() : calledUrl).toBe(
      "https://api.repliers.io/listings/HAR-12345?boardId=101",
    );
  });

  it("falls back to search lookup when no MLS number is provided", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(createResponse({
      body: {
        listings: [
          {
            id: "listing-2",
            address: {
              fullAddress: "456 Oak Ave, Cypress, TX 77429",
            },
            price: 390000,
            bedroomsTotal: 3,
            bathroomsFull: 2,
            bathroomsHalf: 1,
            hasPool: false,
            listingStatus: "Pending",
          },
        ],
      },
    }));
    const client = createRepliersListingClient({
      apiKey: "repliers-key",
      fetchImpl,
    });

    const listing = await client.lookupListing({
      query: "456 Oak Ave",
      address: "456 Oak Ave",
    });

    expect(listing).toMatchObject({
      source: "repliers",
      address: "456 Oak Ave, Cypress, TX 77429",
      price: 390000,
      beds: 3,
      baths: 2.5,
      hasPool: false,
      status: "Pending",
    });
  });

  it("throws a typed provider error when Repliers rejects the request", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(createResponse({
      ok: false,
      status: 401,
      text: "unauthorized",
    }));
    const client = createRepliersListingClient({
      apiKey: "repliers-key",
      fetchImpl,
    });

    await expect(client.lookupListing({
      query: "123 Main St",
    })).rejects.toBeInstanceOf(ListingProviderRequestError);
  });
});
