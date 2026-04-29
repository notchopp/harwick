import { ListingFactSchema, type ListingFact, type ListingVerificationStatus } from "@realty-ops/core";
import type { RealtyOpsSupabaseClient } from "./server-client";

export type ListingFactRow = {
  id: string;
  workspace_id: string;
  source: "manual" | "idx" | "repliers" | "mls_grid" | "fub" | "website";
  external_listing_id: string | null;
  mls_number: string | null;
  address: string;
  status: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  has_pool: boolean | null;
  raw_facts: Record<string, unknown>;
  verification_status: ListingVerificationStatus;
  verified_by_member_id: string | null;
  verified_at: string | null;
  needs_recheck_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ListingFactUpdateValues = {
  source?: ListingFactRow["source"];
  external_listing_id?: string | null;
  mls_number?: string | null;
  address?: string;
  status?: string | null;
  price?: number | null;
  beds?: number | null;
  baths?: number | null;
  has_pool?: boolean | null;
  raw_facts?: Record<string, unknown>;
  verification_status?: ListingVerificationStatus;
  verified_by_member_id?: string | null;
  verified_at?: string | null;
  needs_recheck_at?: string | null;
};

export type ListingLookupRepository = {
  lookupListing(params: {
    workspaceId: string;
    query: string;
    mlsNumber?: string | null;
    address?: string | null;
  }): Promise<ListingFactRow | null>;
};

export type ListingFactsRepository = {
  findCachedListing(params: {
    workspaceId: string;
    query: string;
    mlsNumber?: string | null;
    address?: string | null;
  }): Promise<ListingFactRow | null>;
  saveListingFact(params: {
    workspaceId: string;
    listing: ListingFact;
  }): Promise<ListingFactRow>;
  listWorkspaceListings(params: {
    workspaceId: string;
    limit?: number;
  }): Promise<ListingFactRow[]>;
  findListingById(params: {
    workspaceId: string;
    listingId: string;
  }): Promise<ListingFactRow | null>;
  updateListingFact(params: {
    workspaceId: string;
    listingId: string;
    values: ListingFactUpdateValues;
  }): Promise<ListingFactRow | null>;
};

function buildLookupQuery(params: {
  supabase: RealtyOpsSupabaseClient;
  workspaceId: string;
  query: string;
  mlsNumber?: string | null;
  address?: string | null;
}) {
  let query = params.supabase
    .from("listing_facts")
    .select("*")
    .eq("workspace_id", params.workspaceId)
    .limit(1);

  if (params.mlsNumber !== undefined && params.mlsNumber !== null) {
    query = query.eq("mls_number", params.mlsNumber);
  } else if (params.address !== undefined && params.address !== null) {
    query = query.ilike("address", `%${params.address}%`);
  } else {
    query = query.or(`address.ilike.%${params.query}%,mls_number.ilike.%${params.query}%`);
  }

  return query;
}

function mapListingFactToRow(params: {
  existingId?: string;
  workspaceId: string;
  listing: ListingFact;
}) {
  const parsed = ListingFactSchema.parse(params.listing);

  return {
    ...(params.existingId === undefined ? {} : { id: params.existingId }),
    workspace_id: params.workspaceId,
    source: parsed.source,
    external_listing_id: parsed.externalListingId,
    mls_number: parsed.mlsNumber,
    address: parsed.address,
    status: parsed.status,
    price: parsed.price,
    beds: parsed.beds,
    baths: parsed.baths,
    has_pool: parsed.hasPool,
    raw_facts: parsed.rawFacts,
    verification_status: "verified" as const,
    verified_by_member_id: null,
    verified_at: parsed.verifiedAt,
    needs_recheck_at: null,
  };
}

export function createSupabaseListingFactsRepository(
  supabase: RealtyOpsSupabaseClient,
): ListingFactsRepository {
  const repository: ListingFactsRepository = {
    async findCachedListing(params) {
      const { data, error } = await buildLookupQuery({
        supabase,
        workspaceId: params.workspaceId,
        query: params.query,
        ...(params.mlsNumber === undefined ? {} : { mlsNumber: params.mlsNumber }),
        ...(params.address === undefined ? {} : { address: params.address }),
      }).maybeSingle<ListingFactRow>();
      if (error !== null) {
        throw error;
      }

      return data ?? null;
    },

    async saveListingFact(params) {
      const existing = await repository.findCachedListing({
        workspaceId: params.workspaceId,
        query: params.listing.address,
        mlsNumber: params.listing.mlsNumber,
        address: params.listing.address,
      });
      const row = mapListingFactToRow({
        ...(existing === null ? {} : { existingId: existing.id }),
        workspaceId: params.workspaceId,
        listing: params.listing,
      });

      const response = existing === null
        ? await supabase
            .from("listing_facts")
            .insert(row)
            .select("*")
            .single<ListingFactRow>()
        : await supabase
            .from("listing_facts")
            .update(row)
            .eq("id", existing.id)
            .select("*")
            .single<ListingFactRow>();

      if (response.error !== null) {
        throw response.error;
      }

      return response.data;
    },

    async listWorkspaceListings(params) {
      const { data, error } = await supabase
        .from("listing_facts")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .order("updated_at", { ascending: false })
        .limit(params.limit ?? 50)
        .returns<ListingFactRow[]>();

      if (error !== null) {
        throw error;
      }

      return data ?? [];
    },

    async findListingById(params) {
      const { data, error } = await supabase
        .from("listing_facts")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.listingId)
        .maybeSingle<ListingFactRow>();

      if (error !== null) {
        throw error;
      }

      return data ?? null;
    },

    async updateListingFact(params) {
      const { data, error } = await supabase
        .from("listing_facts")
        .update({
          ...params.values,
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.listingId)
        .select("*")
        .maybeSingle<ListingFactRow>();

      if (error !== null) {
        throw error;
      }

      return data ?? null;
    },
  };

  return repository;
}

export function createSupabaseListingLookupRepository(
  supabase: RealtyOpsSupabaseClient,
): ListingLookupRepository {
  const repository = createSupabaseListingFactsRepository(supabase);

  return {
    async lookupListing(params) {
      return repository.findCachedListing(params);
    },
  };
}
