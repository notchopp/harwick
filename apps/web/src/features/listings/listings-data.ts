import type { ListingFactRow } from "../../lib/supabase/listings";

export type ListingsStatusFilter = "all" | "active" | "pending" | "sold" | "recheck";

export type ListingsPageCard = {
  id: string;
  address: string;
  marketStatus: "active" | "pending" | "sold";
  marketStatusLabel: string;
  verificationStatus: ListingFactRow["verification_status"];
  verificationLabel: string;
  verificationDateLabel: string;
  priceLabel: string;
  sourceLabel: string;
  mlsLabel: string;
  bedsLabel: string;
  bathsLabel: string;
  squareFeetLabel: string;
  propertyTypeLabel: string;
  neighborhoodLabel: string;
  updatedLabel: string;
  notes: string | null;
  incentives: string[];
  publicUrl: string | null;
  photoUrl: string | null;
  hasPool: boolean | null;
  needsRecheckAt: string | null;
};

function humanizeSource(source: ListingFactRow["source"]): string {
  return source
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function readRawString(rawFacts: Record<string, unknown>, key: string): string | null {
  const value = rawFacts[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readRawNumber(rawFacts: Record<string, unknown>, key: string): number | null {
  const value = rawFacts[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readRawStringArray(rawFacts: Record<string, unknown>, key: string): string[] {
  const value = rawFacts[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim())
    : [];
}

export function deriveListingsMarketStatus(status: string | null): ListingsPageCard["marketStatus"] {
  const normalized = status?.trim().toLowerCase() ?? "";
  if (/(sold|closed|off market)/.test(normalized)) {
    return "sold";
  }
  if (/(pending|under contract|contingent)/.test(normalized)) {
    return "pending";
  }
  return "active";
}

function formatMoney(value: number | null): string {
  if (value === null) {
    return "Price on request";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatRelativeDate(iso: string | null): string {
  if (iso === null) {
    return "not verified";
  }

  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 60_000) return "now";
  if (diffMs < 60 * 60_000) return `${Math.max(1, Math.round(diffMs / 60_000))}m ago`;
  if (diffMs < 24 * 60 * 60_000) return `${Math.max(1, Math.round(diffMs / (60 * 60_000)))}h ago`;
  return `${Math.max(1, Math.round(diffMs / (24 * 60 * 60_000)))}d ago`;
}

export function mapListingFactRowToCard(row: ListingFactRow): ListingsPageCard {
  const marketStatus = deriveListingsMarketStatus(row.status);
  const squareFeet = readRawNumber(row.raw_facts, "squareFeet");
  const neighborhood = readRawString(row.raw_facts, "neighborhood");
  const propertyType = readRawString(row.raw_facts, "propertyType");
  const notes = readRawString(row.raw_facts, "notes");
  const incentives = readRawStringArray(row.raw_facts, "incentives");
  const publicUrl = readRawString(row.raw_facts, "publicUrl");
  const photoUrl = readRawString(row.raw_facts, "photoUrl");

  return {
    id: row.id,
    address: row.address,
    marketStatus,
    marketStatusLabel: row.status ?? (marketStatus === "active" ? "Active" : marketStatus === "pending" ? "Pending" : "Sold"),
    verificationStatus: row.verification_status,
    verificationLabel: row.verification_status === "verified"
      ? "Verified"
      : row.verification_status === "needs_recheck"
        ? "Needs recheck"
        : "Unverified",
    verificationDateLabel: row.verification_status === "verified"
      ? `verified ${formatRelativeDate(row.verified_at)}`
      : row.needs_recheck_at === null
        ? "awaiting verification"
        : `recheck ${formatRelativeDate(row.needs_recheck_at)}`,
    priceLabel: formatMoney(row.price),
    sourceLabel: humanizeSource(row.source),
    mlsLabel: row.mls_number ?? "No MLS yet",
    bedsLabel: row.beds === null ? "— beds" : `${row.beds} bd`,
    bathsLabel: row.baths === null ? "— baths" : `${row.baths} ba`,
    squareFeetLabel: squareFeet === null ? "— sqft" : `${Math.round(squareFeet).toLocaleString()} sqft`,
    propertyTypeLabel: propertyType ?? "Listing",
    neighborhoodLabel: neighborhood ?? "Workspace listing",
    updatedLabel: `updated ${formatRelativeDate(row.updated_at)}`,
    notes,
    incentives,
    publicUrl,
    photoUrl,
    hasPool: row.has_pool,
    needsRecheckAt: row.needs_recheck_at,
  };
}

export function filterListingsCards(cards: ListingsPageCard[], filter: ListingsStatusFilter, verifiedOnly: boolean) {
  return cards.filter((card) => {
    if (verifiedOnly && card.verificationStatus !== "verified") {
      return false;
    }

    if (filter === "recheck") {
      return card.verificationStatus === "needs_recheck";
    }
    if (filter === "all") {
      return true;
    }

    return card.marketStatus === filter;
  });
}
