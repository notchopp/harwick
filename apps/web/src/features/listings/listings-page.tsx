"use client";

import { useState } from "react";
import { Plus, Upload } from "lucide-react";
import { cn } from "../../lib/utils";

type ListingStatus = "all" | "active" | "pending" | "sold" | "recheck";

type Listing = {
  id: string;
  address: string;
  price: number;
  status: Exclude<ListingStatus, "all">;
  beds: number;
  baths: number;
  sqft: number;
  verified: boolean;
  lead_count: number;
  emoji?: string;
};

const MOCK_LISTINGS: Listing[] = [
  {
    id: "lst_1",
    address: "4BR Coral Gables Estate",
    price: 1450000,
    status: "active",
    beds: 4,
    baths: 3,
    sqft: 2800,
    verified: true,
    lead_count: 12,
    emoji: "🏡",
  },
  {
    id: "lst_2",
    address: "2BR Downtown Miami Penthouse",
    price: 850000,
    status: "active",
    beds: 2,
    baths: 2,
    sqft: 1400,
    verified: true,
    lead_count: 8,
    emoji: "🏢",
  },
  {
    id: "lst_3",
    address: "3BR Wynwood Arts District",
    price: 625000,
    status: "pending",
    beds: 3,
    baths: 2,
    sqft: 1800,
    verified: false,
    lead_count: 3,
    emoji: "🎨",
  },
  {
    id: "lst_4",
    address: "5BR Brickell Waterfront",
    price: 2100000,
    status: "active",
    beds: 5,
    baths: 4,
    sqft: 3200,
    verified: true,
    lead_count: 15,
    emoji: "🌊",
  },
  {
    id: "lst_5",
    address: "Studio Allapattah Fixer-Upper",
    price: 185000,
    status: "sold",
    beds: 1,
    baths: 1,
    sqft: 600,
    verified: true,
    lead_count: 2,
    emoji: "🏗️",
  },
];

function ListingCard({ listing }: { listing: Listing }) {
  const statusColors: Record<Exclude<ListingStatus, "all">, string> = {
    active: "bg-green-100 text-green-700",
    pending: "bg-amber-100 text-amber-700",
    sold: "bg-gray-100 text-gray-700",
    recheck: "bg-orange-100 text-orange-700",
  };

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden hover:border-border-strong transition-colors">
      {/* Image Area */}
      <div className="relative h-40 bg-gradient-to-br from-parchment to-linen flex items-center justify-center text-4xl">
        {listing.emoji}
        <div className="absolute top-2 left-2">
          <span className={cn("inline-block rounded-full px-2 py-1 text-[9px] font-semibold", statusColors[listing.status])}>
            {listing.status === "active" ? "Active" : listing.status === "pending" ? "Pending" : listing.status === "sold" ? "Sold" : "Recheck"}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="p-3.5">
        {/* Price */}
        <div className="text-[20px] font-display font-medium text-foreground mb-0.5">
          ${(listing.price / 1000000).toFixed(2)}M
        </div>

        {/* Address */}
        <div className="text-[12.5px] font-semibold text-foreground mb-2 line-clamp-2">{listing.address}</div>

        {/* Stats */}
        <div className="flex gap-3 text-[11px] text-muted mb-2.5">
          <span>
            <strong>{listing.beds}</strong> bd
          </span>
          <span>
            <strong>{listing.baths}</strong> ba
          </span>
          <span>
            <strong>{listing.sqft.toLocaleString()}</strong> sqft
          </span>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          {listing.verified && <span className="text-[11px] text-green-600">✓ Verified</span>}
          {!listing.verified && <span className="text-[11px] text-muted">—</span>}
          <span className="text-[11px] font-semibold text-foreground">{listing.lead_count} leads</span>
        </div>
      </div>
    </div>
  );
}

export function ListingsPageContent() {
  const [statusFilter, setStatusFilter] = useState<ListingStatus>("all");
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const filteredListings = MOCK_LISTINGS.filter((listing) => {
    if (statusFilter !== "all" && listing.status !== statusFilter) return false;
    if (verifiedOnly && !listing.verified) return false;
    return true;
  });

  return (
    <div className="flex flex-col overflow-hidden bg-background">
      {/* Topbar */}
      <div className="h-[58px] border-b border-border bg-surface px-8 flex items-center gap-4 flex-shrink-0">
        <span className="font-display text-[19px] font-medium">Listings</span>
        <div className="ml-auto flex items-center gap-2">
          <button className="inline-flex items-center gap-2 rounded-lg border border-border bg-transparent px-3 py-1.5 text-[12px] font-semibold hover:border-border-strong">
            <Upload className="h-3 w-3" />
            Import CSV
          </button>
          <button className="inline-flex items-center gap-2 rounded-lg bg-harwick-ink text-white px-3 py-1.5 text-[12px] font-semibold hover:opacity-90">
            <Plus className="h-3 w-3" />
            Add Listing
          </button>
        </div>
      </div>

      {/* Filter Row */}
      <div className="flex items-center gap-4 border-b border-border bg-surface px-8 py-3 flex-shrink-0">
        <div className="flex gap-2">
          {(["all", "active", "pending", "sold", "recheck"] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={cn(
                "rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors",
                statusFilter === status ? "bg-foreground text-background" : "bg-transparent text-foreground hover:text-foreground"
              )}
            >
              {status === "all" ? "All" : status === "active" ? "Active" : status === "pending" ? "Pending" : status === "sold" ? "Sold" : "Needs Recheck"}
            </button>
          ))}
        </div>

        <div className="flex gap-2 ml-auto">
          <button
            onClick={() => setVerifiedOnly(!verifiedOnly)}
            className={cn(
              "rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors",
              verifiedOnly ? "bg-foreground text-background" : "bg-transparent text-foreground hover:text-foreground"
            )}
          >
            Verified Only
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="grid gap-4 auto-fill-[272px]" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(272px, 1fr))" }}>
          {filteredListings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      </div>
    </div>
  );
}
