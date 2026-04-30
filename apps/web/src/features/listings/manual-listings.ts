import {
  ListingFactSchema,
  ManualListingCsvImportRequestSchema,
  ManualListingFactRequestSchema,
  ManualListingQuickUpdateRequestSchema,
  ManualListingVerifyRequestSchema,
  type ListingFact,
} from "@realty-ops/core";
import type {
  ListingFactRow,
  ListingFactUpdateValues,
  ListingFactsRepository,
} from "../../lib/supabase/listings";

export type ManualListingFactsRepository = ListingFactsRepository & {
  listWorkspaceListings(params: {
    workspaceId: string;
    limit?: number;
  }): Promise<ListingFactRow[]>;
};

function buildManualRawFacts(params: {
  notes?: string | null;
  publicUrl?: string | null;
  incentives?: string[];
}): Record<string, unknown> {
  return {
    entryMode: "manual",
    ...(params.notes === undefined || params.notes === null ? {} : { notes: params.notes }),
    ...(params.publicUrl === undefined || params.publicUrl === null ? {} : { publicUrl: params.publicUrl }),
    ...(params.incentives === undefined ? {} : { incentives: params.incentives }),
  };
}

function mergeManualRawFacts(params: {
  existing: Record<string, unknown>;
  notes?: string | null;
  publicUrl?: string | null;
  incentives?: string[];
  refreshSource: string;
  refreshedAt: string;
}): Record<string, unknown> {
  return {
    ...params.existing,
    entryMode: "manual",
    lastManualRefreshSource: params.refreshSource,
    lastManualRefreshAt: params.refreshedAt,
    ...(params.notes === undefined ? {} : { notes: params.notes }),
    ...(params.publicUrl === undefined ? {} : { publicUrl: params.publicUrl }),
    ...(params.incentives === undefined ? {} : { incentives: params.incentives }),
  };
}

function hasFactFieldUpdate(values: ListingFactUpdateValues): boolean {
  return [
    "external_listing_id",
    "mls_number",
    "address",
    "status",
    "price",
    "beds",
    "baths",
    "has_pool",
    "raw_facts",
  ].some((key) => key in values);
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const nextChar = csv[index + 1];

    if (char === "\"" && inQuotes && nextChar === "\"") {
      field += "\"";
      index += 1;
      continue;
    }

    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field.trim());
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      row.push(field.trim());
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(field.trim());
  if (row.some((value) => value.length > 0)) {
    rows.push(row);
  }

  return rows;
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function readCsvValue(row: Record<string, string>, aliases: string[]): string | null {
  for (const alias of aliases) {
    const value = row[alias];
    if (value !== undefined && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function parseNullableNumber(value: string | null): number | null {
  if (value === null) {
    return null;
  }

  const parsed = Number(value.replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNullableBoolean(value: string | null): boolean | null {
  if (value === null) {
    return null;
  }

  if (/^(true|yes|y|1|pool)$/i.test(value)) {
    return true;
  }
  if (/^(false|no|n|0|none|no pool)$/i.test(value)) {
    return false;
  }

  return null;
}

function mapCsvRowToManualRequest(row: Record<string, string>) {
  const address = readCsvValue(row, ["address", "fulladdress", "streetaddress", "propertyaddress"]);
  if (address === null) {
    return null;
  }

  const incentives = readCsvValue(row, ["incentives", "builderincentives", "offer"]);
  return {
    externalListingId: readCsvValue(row, ["externallistingid", "listingid", "id"]),
    mlsNumber: readCsvValue(row, ["mlsnumber", "mls", "mlsid"]),
    address,
    status: readCsvValue(row, ["status", "listingstatus"]),
    price: parseNullableNumber(readCsvValue(row, ["price", "listprice", "currentprice"])),
    beds: parseNullableNumber(readCsvValue(row, ["beds", "bedrooms"])),
    baths: parseNullableNumber(readCsvValue(row, ["baths", "bathrooms"])),
    hasPool: parseNullableBoolean(readCsvValue(row, ["haspool", "pool"])),
    notes: readCsvValue(row, ["notes", "remarks", "description"]),
    publicUrl: readCsvValue(row, ["publicurl", "url", "link", "listinglink"]),
    incentives: incentives === null
      ? []
      : incentives.split(/[;|]/).map((value) => value.trim()).filter((value) => value.length > 0),
  };
}

export async function upsertManualListingFact(params: {
  workspaceId: string;
  request: unknown;
  repository: ListingFactsRepository;
  verifiedByMemberId?: string;
  now?: () => Date;
}): Promise<ListingFactRow> {
  const parsed = ManualListingFactRequestSchema.parse(params.request);
  const listing = ListingFactSchema.parse({
    source: "manual",
    externalListingId: parsed.externalListingId ?? null,
    mlsNumber: parsed.mlsNumber ?? null,
    address: parsed.address,
    status: parsed.status ?? null,
    price: parsed.price ?? null,
    beds: parsed.beds ?? null,
    baths: parsed.baths ?? null,
    hasPool: parsed.hasPool ?? null,
    rawFacts: buildManualRawFacts({
      notes: parsed.notes ?? null,
      publicUrl: parsed.publicUrl ?? null,
      incentives: parsed.incentives ?? [],
    }),
    verifiedAt: (params.now?.() ?? new Date()).toISOString(),
  }) satisfies ListingFact;

  const row = await params.repository.saveListingFact({
    workspaceId: params.workspaceId,
    listing,
  });

  if (params.verifiedByMemberId === undefined) {
    return row;
  }

  return params.repository.updateListingFact({
    workspaceId: params.workspaceId,
    listingId: row.id,
    values: {
      verification_status: "verified",
      verified_by_member_id: params.verifiedByMemberId,
      verified_at: listing.verifiedAt,
      needs_recheck_at: null,
    },
  }).then((updated) => updated ?? row);
}

export async function listManualListingFacts(params: {
  workspaceId: string;
  repository: ManualListingFactsRepository;
  limit?: number;
}): Promise<ListingFactRow[]> {
  return params.repository.listWorkspaceListings({
    workspaceId: params.workspaceId,
    ...(params.limit === undefined ? {} : { limit: params.limit }),
  });
}

export async function quickUpdateManualListingFact(params: {
  workspaceId: string;
  listingId: string;
  memberId: string;
  request: unknown;
  repository: ListingFactsRepository;
  now?: () => Date;
}): Promise<ListingFactRow | null> {
  const parsed = ManualListingQuickUpdateRequestSchema.parse(params.request);
  const existing = await params.repository.findListingById({
    workspaceId: params.workspaceId,
    listingId: params.listingId,
  });

  if (existing === null) {
    return null;
  }

  const refreshedAt = (params.now?.() ?? new Date()).toISOString();
  const values: ListingFactUpdateValues = {
    source: "manual",
  };

  if (parsed.externalListingId !== undefined) {
    values.external_listing_id = parsed.externalListingId;
  }
  if (parsed.mlsNumber !== undefined) {
    values.mls_number = parsed.mlsNumber;
  }
  if (parsed.address !== undefined) {
    values.address = parsed.address;
  }
  if (parsed.status !== undefined) {
    values.status = parsed.status;
  }
  if (parsed.price !== undefined) {
    values.price = parsed.price;
  }
  if (parsed.beds !== undefined) {
    values.beds = parsed.beds;
  }
  if (parsed.baths !== undefined) {
    values.baths = parsed.baths;
  }
  if (parsed.hasPool !== undefined) {
    values.has_pool = parsed.hasPool;
  }
  if (parsed.notes !== undefined || parsed.publicUrl !== undefined || parsed.incentives !== undefined) {
    values.raw_facts = mergeManualRawFacts({
      existing: existing.raw_facts,
      refreshSource: "quick_update",
      refreshedAt,
      ...(parsed.notes === undefined ? {} : { notes: parsed.notes }),
      ...(parsed.publicUrl === undefined ? {} : { publicUrl: parsed.publicUrl }),
      ...(parsed.incentives === undefined ? {} : { incentives: parsed.incentives }),
    });
  }

  const requestedVerificationStatus = parsed.verificationStatus;
  if (requestedVerificationStatus === "needs_recheck") {
    values.verification_status = "needs_recheck";
    values.needs_recheck_at = parsed.needsRecheckAt ?? refreshedAt;
  } else if (requestedVerificationStatus === "unverified") {
    values.verification_status = "unverified";
    values.needs_recheck_at = parsed.needsRecheckAt ?? null;
  } else if (requestedVerificationStatus === "verified" || hasFactFieldUpdate(values)) {
    values.verification_status = "verified";
    values.verified_by_member_id = params.memberId;
    values.verified_at = refreshedAt;
    values.needs_recheck_at = parsed.needsRecheckAt ?? null;
  }

  const updated = await params.repository.updateListingFact({
    workspaceId: params.workspaceId,
    listingId: params.listingId,
    values,
  });
  if (updated !== null && values.verification_status === "verified") {
    await params.repository.completeVerifyListingTasks({
      workspaceId: params.workspaceId,
      listing: updated,
    });
  }
  if (updated !== null && updated.needs_recheck_at !== null) {
    await params.repository.enqueueListingRecheck({
      workspaceId: params.workspaceId,
      listingId: updated.id,
      runAfter: updated.needs_recheck_at,
    });
  }

  return updated;
}

export async function verifyManualListingFact(params: {
  workspaceId: string;
  listingId: string;
  memberId: string;
  request: unknown;
  repository: ListingFactsRepository;
  now?: () => Date;
}): Promise<ListingFactRow | null> {
  const parsed = ManualListingVerifyRequestSchema.parse(params.request);
  const existing = await params.repository.findListingById({
    workspaceId: params.workspaceId,
    listingId: params.listingId,
  });

  if (existing === null) {
    return null;
  }

  const verifiedAt = (params.now?.() ?? new Date()).toISOString();
  const updated = await params.repository.updateListingFact({
    workspaceId: params.workspaceId,
    listingId: params.listingId,
    values: {
      source: "manual",
      raw_facts: mergeManualRawFacts({
        existing: existing.raw_facts,
        refreshSource: "verified_now",
        refreshedAt: verifiedAt,
        ...(parsed.notes === undefined ? {} : { notes: parsed.notes }),
      }),
      verification_status: "verified",
      verified_by_member_id: params.memberId,
      verified_at: verifiedAt,
      needs_recheck_at: parsed.needsRecheckAt ?? null,
    },
  });
  if (updated === null) {
    return null;
  }

  await params.repository.completeVerifyListingTasks({
    workspaceId: params.workspaceId,
    listing: updated,
  });
  if (updated.needs_recheck_at !== null) {
    await params.repository.enqueueListingRecheck({
      workspaceId: params.workspaceId,
      listingId: updated.id,
      runAfter: updated.needs_recheck_at,
    });
  }

  return updated;
}

export async function importManualListingCsv(params: {
  workspaceId: string;
  memberId: string;
  request: unknown;
  repository: ListingFactsRepository;
  now?: () => Date;
}): Promise<{
  imported: number;
  skipped: number;
  listings: ListingFactRow[];
}> {
  const parsed = ManualListingCsvImportRequestSchema.parse(params.request);
  const rows = parseCsvRows(parsed.csv);
  const [headers, ...dataRows] = rows;
  if (headers === undefined || dataRows.length === 0) {
    return {
      imported: 0,
      skipped: rows.length,
      listings: [],
    };
  }

  const normalizedHeaders = headers.map(normalizeHeader);
  const listings: ListingFactRow[] = [];
  let skipped = 0;

  for (const dataRow of dataRows.slice(0, 500)) {
    const row = Object.fromEntries(normalizedHeaders.map((header, index) => [
      header,
      dataRow[index] ?? "",
    ]));
    const manualRequest = mapCsvRowToManualRequest(row);
    if (manualRequest === null) {
      skipped += 1;
      continue;
    }

    const listing = await upsertManualListingFact({
      workspaceId: params.workspaceId,
      request: manualRequest,
      repository: params.repository,
      verifiedByMemberId: params.memberId,
      ...(params.now === undefined ? {} : { now: params.now }),
    });
    listings.push(listing);
  }

  skipped += Math.max(0, dataRows.length - 500);

  return {
    imported: listings.length,
    skipped,
    listings,
  };
}
