import { createLogger, type ListingFact } from "@realty-ops/core";
import { describe, expect, it, vi } from "vitest";
import { encryptCredential } from "../../lib/credentials";
import type { ListingFactRow, ListingFactsRepository } from "../../lib/supabase/listings";
import { createWorkspaceScopedListingLookupRepository } from "./workspace-listing-lookup";

const baseEnvironment = {
  APP_ENV: "development",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  META_APP_ID: "meta-app",
  META_APP_SECRET: "meta-secret",
  META_WEBHOOK_VERIFY_TOKEN: "verify-token-123456789",
  RETELL_API_KEY: "retell-key",
  OPENAI_REPLY_MODEL: "gpt-5.2",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
} as const;

function buildListingFact(overrides: Partial<ListingFact> = {}): ListingFact {
  return {
    source: "repliers",
    externalListingId: "listing-1",
    mlsNumber: "HAR-12345",
    address: "123 Main St, Houston, TX 77001",
    status: "Active",
    price: 450000,
    beds: 4,
    baths: 3,
    hasPool: true,
    rawFacts: {},
    verifiedAt: "2026-04-29T12:00:00.000Z",
    ...overrides,
  };
}

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
    baths: 3,
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

describe("createWorkspaceScopedListingLookupRepository", () => {
  it("uses the workspace Repliers credential before env fallback", async () => {
    const saveListingFact = vi.fn<ListingFactsRepository["saveListingFact"]>()
      .mockImplementation((params) => Promise.resolve(buildListingRow({
        price: params.listing.price,
      })));
    const repository = buildRepository({
      findCachedListing: vi.fn().mockResolvedValue(buildListingRow({
        verified_at: null,
      })),
      saveListingFact,
    });

    const lookupRepository = createWorkspaceScopedListingLookupRepository({
      repository,
      credentialRepository: {
        findConnectedCredential: vi.fn().mockResolvedValue({
          integrationAccountId: "integration-1",
          workspaceId: "workspace-1",
          providerAccountId: "board:321",
          providerAccountName: "Repliers board 321",
          encryptedCredentialRef: encryptCredential({
            apiKey: "workspace-key",
            boardId: 321,
          }, "credential-secret-value"),
        }),
      },
      credentialSecret: "credential-secret-value",
      environment: {
        ...baseEnvironment,
        CREDENTIAL_ENCRYPTION_KEY: "credential-secret-value",
        LISTING_PROVIDER: "repliers",
        REPLIERS_API_KEY: "env-key",
        REPLIERS_BOARD_ID: 111,
      },
      logger: createLogger({
        service: "test",
        environment: "development",
        write: () => {},
      }),
      createProvider: (options) => ({
        provider: "repliers",
        lookupListing: vi.fn().mockImplementation(() => {
          expect(options.apiKey).toBe("workspace-key");
          expect(options.boardId).toBe(321);
          return Promise.resolve(buildListingFact({ price: 470000 }));
        }),
      }),
    });

    const result = await lookupRepository.lookupListing({
      workspaceId: "workspace-1",
      query: "123 Main St",
    });

    expect(result?.price).toBe(470000);
  });
});
