import { cache } from "react";

import type { Json } from "../../lib/supabase/database.types";
import { createServerSupabaseClient } from "../../lib/supabase/server-client";
import type { PublicListingCardData } from "./public-listings-page";

type PublicListingFactRow = {
  id: string;
  mls_number: string | null;
  address: string;
  status: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  has_pool: boolean | null;
  raw_facts: Json;
  verification_status: "unverified" | "verified" | "needs_recheck";
  updated_at: string;
};

export function formatWorkspaceName(workspaceSlug: string) {
  const teamName = workspaceSlug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  return teamName.length === 0 ? "Workspace" : teamName;
}

function rawRecord(rawFacts: Json): Record<string, Json | undefined> {
  return typeof rawFacts === "object" && rawFacts !== null && !Array.isArray(rawFacts)
    ? rawFacts
    : {};
}

function readRawString(rawFacts: Record<string, Json | undefined>, key: string): string | null {
  const value = rawFacts[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readRawNumber(rawFacts: Record<string, Json | undefined>, key: string): number | null {
  const value = rawFacts[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readRawStringArray(rawFacts: Record<string, Json | undefined>, key: string): string[] {
  const value = rawFacts[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return slug.length === 0 ? "listing" : slug;
}

function formatMoney(value: number | null) {
  if (value === null) {
    return "Price on request";
  }

  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function formatRelativeDate(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 60_000) return "now";
  if (diffMs < 60 * 60_000) return `${Math.max(1, Math.round(diffMs / 60_000))}m ago`;
  if (diffMs < 24 * 60 * 60_000) return `${Math.max(1, Math.round(diffMs / (60 * 60_000)))}h ago`;
  return `${Math.max(1, Math.round(diffMs / (24 * 60 * 60_000)))}d ago`;
}

function formatNumberLabel(value: number | null, suffix: string) {
  return value === null ? "-" : `${value.toLocaleString()}${suffix}`;
}

function mapPublicListing(row: PublicListingFactRow, workspaceName: string): PublicListingCardData {
  const rawFacts = rawRecord(row.raw_facts);
  const mediaUrls = readRawStringArray(rawFacts, "mediaUrls");
  const photoUrl = readRawString(rawFacts, "photoUrl");
  const photos = [photoUrl, ...mediaUrls].filter((url): url is string => url !== null);
  const uniquePhotos = [...new Set(photos)];
  const status = row.status?.toLowerCase() ?? "";
  const openHouse = readRawString(rawFacts, "openHouse");
  const incentives = readRawStringArray(rawFacts, "incentives");
  const neighborhood = readRawString(rawFacts, "neighborhood") ?? "Workspace listing";
  const propertyType = readRawString(rawFacts, "propertyType") ?? "home";
  const squareFeet = readRawNumber(rawFacts, "squareFeet");
  const yearBuilt = readRawString(rawFacts, "yearBuilt") ?? String(readRawNumber(rawFacts, "yearBuilt") ?? "unknown");
  const features = [
    ...incentives,
    propertyType,
    neighborhood,
    row.has_pool === true ? "pool" : null,
    status.length > 0 ? status : null,
  ].filter((feature): feature is string => feature !== null && feature.trim().length > 0).slice(0, 6);
  const isReduced = status.includes("reduced") || readRawString(rawFacts, "priceChange") === "reduced";
  const isWaterfront = features.some((feature) => feature.toLowerCase().includes("waterfront"));
  const isOpenHouse = openHouse !== null;
  const filter = isReduced ? "reduced" : isOpenHouse ? "open-house" : isWaterfront ? "waterfront" : "all";

  return {
    id: row.id,
    slug: `${slugify(row.address)}-${row.id.slice(0, 8)}`,
    label: isReduced
      ? "Price Reduced"
      : row.verification_status === "verified"
        ? "Verified"
        : status.includes("new")
          ? "New"
          : "Active",
    badgeTone: isReduced ? "reduced" : status.includes("new") ? "new" : "prime",
    filter,
    imageUrl: uniquePhotos[0] ?? "",
    photos: uniquePhotos.slice(0, 4),
    price: formatMoney(row.price),
    priceValue: row.price ?? 0,
    shortAddress: row.address.split(",")[0]?.trim() ?? row.address,
    address: row.address,
    neighborhood,
    mls: row.mls_number ?? "No MLS yet",
    beds: formatNumberLabel(row.beds, ""),
    baths: formatNumberLabel(row.baths, ""),
    area: squareFeet === null ? "sqft TBD" : `${Math.round(squareFeet).toLocaleString()} sqft`,
    type: propertyType,
    yearBuilt,
    lot: readRawString(rawFacts, "lot") ?? "lot TBD",
    features: features.length === 0 ? ["active listing"] : features,
    agent: readRawString(rawFacts, "agentName") ?? readRawString(rawFacts, "listingAgent") ?? workspaceName,
    updated: formatRelativeDate(row.updated_at),
    description: readRawString(rawFacts, "notes")
      ?? `${propertyType} in ${neighborhood}. Ask Harwick for current availability, showing windows, and agent follow-up.`,
    openHouse: openHouse ?? "By appointment",
    monthlyHoa: readRawNumber(rawFacts, "monthlyHoa") ?? readRawNumber(rawFacts, "hoa") ?? 0,
    annualTaxRate: readRawNumber(rawFacts, "annualTaxRate") ?? readRawNumber(rawFacts, "propertyTaxRate") ?? 1.1,
  };
}

export const loadPublicListings = cache(async (workspaceSlug: string): Promise<PublicListingCardData[]> => {
  const supabase = createServerSupabaseClient();
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id")
    .eq("slug", workspaceSlug)
    .maybeSingle<{ id: string }>();

  if (workspaceError !== null) {
    throw workspaceError;
  }
  if (workspace === null) {
    return [];
  }

  const { data, error } = await supabase
    .from("listing_facts")
    .select("id, mls_number, address, status, price, beds, baths, has_pool, raw_facts, verification_status, updated_at")
    .eq("workspace_id", workspace.id)
    .order("updated_at", { ascending: false })
    .limit(24)
    .returns<PublicListingFactRow[]>();

  if (error !== null) {
    throw error;
  }

  const workspaceName = formatWorkspaceName(workspaceSlug);
  return (data ?? []).map((row) => mapPublicListing(row, workspaceName));
});

export async function findPublicListingBySlug(params: {
  workspaceSlug: string;
  listingSlug: string;
}): Promise<PublicListingCardData | null> {
  const listings = await loadPublicListings(params.workspaceSlug);
  return listings.find((listing) => listing.slug === params.listingSlug || listing.id === params.listingSlug) ?? null;
}
