"use client";

import {
  ArrowUpRight,
  Bath,
  BedDouble,
  Building2,
  Calendar,
  ChevronLeft,
  Grid2X2,
  Heart,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Ruler,
  Search,
  Send,
  SlidersHorizontal,
  Star,
  User,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { cn } from "../../lib/utils";

type Listing = {
  slug: string;
  label: string;
  badgeTone: "prime" | "new" | "reduced";
  filter: ListingFilter;
  imageUrl: string;
  photos: string[];
  price: string;
  priceValue: number;
  shortAddress: string;
  address: string;
  neighborhood: string;
  mls: string;
  beds: string;
  baths: string;
  area: string;
  type: string;
  yearBuilt: string;
  lot: string;
  features: string[];
  agent: string;
  updated: string;
  description: string;
  openHouse: string;
  monthlyHoa: number;
  annualTaxRate: number;
};

type ListingFilter = "all" | "new" | "reduced" | "open-house" | "waterfront";

type PublicListingsCopy = {
  phone: string;
  activeListingsLabel: string;
  headline: string;
  subheadline: string;
};

type InquiryIntent = "general" | "question" | "showing";

const pageCopy: PublicListingsCopy = {
  phone: "(949) 555-0187",
  activeListingsLabel: "all listings",
  headline: "listings ready to send.",
  subheadline: "A live inventory surface for buyers who want the right listing link, current availability, and a fast answer from Harwick.",
};

const listings: Listing[] = [
  {
    slug: "coral-gables-villa",
    label: "Prime Pick",
    badgeTone: "prime",
    filter: "all",
    imageUrl: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1100&q=88",
    photos: [
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1400&q=90",
      "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=900&q=86",
      "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=900&q=86",
      "https://images.unsplash.com/photo-1600566752355-35792bedcfea?auto=format&fit=crop&w=900&q=86",
    ],
    price: "$2,450,000",
    priceValue: 2450000,
    shortAddress: "1234 Ocean View Dr",
    address: "Coral Gables, FL 33134",
    neighborhood: "Coral Gables",
    mls: "MLS OC25123456",
    beds: "4",
    baths: "3.5",
    area: "2,820 sqft",
    type: "single family",
    yearBuilt: "2019",
    lot: "0.34 acres",
    features: ["garden courtyard", "pool-ready yard", "chef kitchen", "covered terrace"],
    agent: "Sarah K.",
    updated: "2h ago",
    description:
      "Mediterranean-inspired home with layered garden views, generous entertaining space, and a quiet outdoor setting minutes from Coral Gables dining.",
    openHouse: "Sunday, 1-4 PM",
    monthlyHoa: 450,
    annualTaxRate: 1.12,
  },
  {
    slug: "brickell-glass-house",
    label: "New",
    badgeTone: "new",
    filter: "new",
    imageUrl: "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1100&q=88",
    photos: [
      "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1400&q=90",
      "https://images.unsplash.com/photo-1600210491369-e753d80a41f3?auto=format&fit=crop&w=900&q=86",
      "https://images.unsplash.com/photo-1600566752229-250ed79470f8?auto=format&fit=crop&w=900&q=86",
      "https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=900&q=86",
    ],
    price: "$1,895,000",
    priceValue: 1895000,
    shortAddress: "5678 Maple St",
    address: "Brickell, FL 33131",
    neighborhood: "Brickell",
    mls: "MLS NP25098765",
    beds: "3",
    baths: "2.5",
    area: "1,650 sqft",
    type: "modern villa",
    yearBuilt: "2022",
    lot: "0.21 acres",
    features: ["pool", "floor-to-ceiling glass", "smart home", "two-car garage"],
    agent: "Diana R.",
    updated: "today",
    description:
      "Clean modern residence with glassy living areas, pool-facing entertaining spaces, and quick access to Brickell offices and waterfront dining.",
    openHouse: "By appointment",
    monthlyHoa: 620,
    annualTaxRate: 1.05,
  },
  {
    slug: "sunset-harbor",
    label: "Price Reduced",
    badgeTone: "reduced",
    filter: "reduced",
    imageUrl: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1100&q=88",
    photos: [
      "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1400&q=90",
      "https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=900&q=86",
      "https://images.unsplash.com/photo-1600607687644-c7171b42498b?auto=format&fit=crop&w=900&q=86",
      "https://images.unsplash.com/photo-1600566752734-0f0b7a0e160f?auto=format&fit=crop&w=900&q=86",
    ],
    price: "$3,250,000",
    priceValue: 3250000,
    shortAddress: "910 Sunset Blvd",
    address: "Miami Beach, FL 33139",
    neighborhood: "Miami Beach",
    mls: "MLS LG25076543",
    beds: "5",
    baths: "4",
    area: "3,450 sqft",
    type: "waterfront",
    yearBuilt: "2020",
    lot: "0.42 acres",
    features: ["waterfront", "private terrace", "chef kitchen", "sunset views"],
    agent: "Marcus T.",
    updated: "1d ago",
    description:
      "Architectural waterfront home with private outdoor terraces, open chef's kitchen, and strong sunset views from the main living level.",
    openHouse: "Saturday, 12-3 PM",
    monthlyHoa: 820,
    annualTaxRate: 1.18,
  },
  {
    slug: "coconut-grove-cottage",
    label: "Open House",
    badgeTone: "prime",
    filter: "open-house",
    imageUrl: "https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=1100&q=88",
    photos: [
      "https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=1400&q=90",
      "https://images.unsplash.com/photo-1600566753104-685f4f24cb4d?auto=format&fit=crop&w=900&q=86",
      "https://images.unsplash.com/photo-1600566752547-33f5c2b63eea?auto=format&fit=crop&w=900&q=86",
      "https://images.unsplash.com/photo-1600585152915-d208bec867a1?auto=format&fit=crop&w=900&q=86",
    ],
    price: "$875,000",
    priceValue: 875000,
    shortAddress: "246 Palm Ave",
    address: "Coconut Grove, FL 33133",
    neighborhood: "Coconut Grove",
    mls: "MLS OC25111223",
    beds: "2",
    baths: "1",
    area: "980 sqft",
    type: "bungalow",
    yearBuilt: "1948",
    lot: "0.12 acres",
    features: ["open house", "renovated kitchen", "shaded lot", "walkable village"],
    agent: "Keisha B.",
    updated: "3d ago",
    description:
      "Charming Grove bungalow with a practical single-level plan, renovated interiors, and a shaded lot near neighborhood cafes.",
    openHouse: "Sunday, 2-5 PM",
    monthlyHoa: 180,
    annualTaxRate: 1.03,
  },
  {
    slug: "key-biscayne-retreat",
    label: "Waterfront",
    badgeTone: "prime",
    filter: "waterfront",
    imageUrl: "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1100&q=88",
    photos: [
      "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1400&q=90",
      "https://images.unsplash.com/photo-1600566752447-f4c9f32bfa67?auto=format&fit=crop&w=900&q=86",
      "https://images.unsplash.com/photo-1600607688066-890987f18a86?auto=format&fit=crop&w=900&q=86",
      "https://images.unsplash.com/photo-1600566753151-384129cf4e3e?auto=format&fit=crop&w=900&q=86",
    ],
    price: "$4,100,000",
    priceValue: 4100000,
    shortAddress: "44 Harbor Point",
    address: "Key Biscayne, FL 33149",
    neighborhood: "Key Biscayne",
    mls: "MLS KB44001992",
    beds: "5",
    baths: "5.5",
    area: "4,120 sqft",
    type: "waterfront estate",
    yearBuilt: "2021",
    lot: "0.51 acres",
    features: ["dock access", "summer kitchen", "guest suite", "pool"],
    agent: "Sarah K.",
    updated: "4d ago",
    description:
      "Private waterfront retreat with open entertaining spaces, a resort-style pool, and calm bay access minutes from village amenities.",
    openHouse: "Private tours only",
    monthlyHoa: 950,
    annualTaxRate: 1.2,
  },
  {
    slug: "south-miami-townhome",
    label: "New",
    badgeTone: "new",
    filter: "new",
    imageUrl: "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1100&q=88",
    photos: [
      "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1400&q=90",
      "https://images.unsplash.com/photo-1600210492493-0946911123ea?auto=format&fit=crop&w=900&q=86",
      "https://images.unsplash.com/photo-1600566752355-35792bedcfea?auto=format&fit=crop&w=900&q=86",
      "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=900&q=86",
    ],
    price: "$1,150,000",
    priceValue: 1150000,
    shortAddress: "78 Banyan Row",
    address: "South Miami, FL 33143",
    neighborhood: "South Miami",
    mls: "MLS SM78123411",
    beds: "3",
    baths: "3",
    area: "2,020 sqft",
    type: "townhome",
    yearBuilt: "2018",
    lot: "0.08 acres",
    features: ["private patio", "garage", "walkable shops", "updated interiors"],
    agent: "Diana R.",
    updated: "5d ago",
    description:
      "Low-maintenance townhome near South Miami shops with a private patio, flexible guest room, and bright open-plan living.",
    openHouse: "Saturday, 11 AM-1 PM",
    monthlyHoa: 390,
    annualTaxRate: 1.08,
  },
];

const filters: Array<{ key: ListingFilter; label: string }> = [
  { key: "all", label: "all listings" },
  { key: "new", label: "new this week" },
  { key: "reduced", label: "price reduced" },
  { key: "open-house", label: "open house" },
  { key: "waterfront", label: "waterfront" },
];

function formatWorkspaceName(workspaceSlug: string) {
  const name = workspaceSlug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  return name.length === 0 ? "Prestige Realty" : name;
}

function ListingBadge(props: { listing: Listing }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-semibold shadow-[0_12px_28px_rgba(14,18,15,0.14)] backdrop-blur-md",
        props.listing.badgeTone === "new" && "bg-[#2fbf74] text-white",
        props.listing.badgeTone === "reduced" && "bg-white/90 text-qualified",
        props.listing.badgeTone === "prime" && "bg-white/92 text-[#181814]",
      )}
    >
      {props.listing.badgeTone === "prime" ? (
        <Star aria-hidden="true" className="h-3.5 w-3.5 fill-harwick-brass text-harwick-brass" />
      ) : null}
      {props.listing.label}
    </div>
  );
}

function Stat(props: { icon: typeof BedDouble; value: string; label: string }) {
  const Icon = props.icon;

  return (
    <div className="flex min-w-0 items-center gap-1.5 text-white/82">
      <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-white/66" strokeWidth={1.7} />
      <span className="truncate text-[13px] font-semibold">{props.value}</span>
      <span className="truncate text-[12px] text-white/54">{props.label}</span>
    </div>
  );
}

function ListingCard(props: {
  isFavorite: boolean;
  listing: Listing;
  onOpen: (listing: Listing) => void;
  onToggleFavorite: (listing: Listing) => void;
  priority?: boolean;
}) {
  return (
    <article
      className="group relative min-h-[430px] cursor-pointer overflow-hidden rounded-[30px] bg-harwick-ink text-left shadow-[0_34px_92px_rgba(18,26,20,0.18)] ring-1 ring-black/[0.05] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_38px_88px_rgba(18,26,20,0.22)]"
      onClick={() => props.onOpen(props.listing)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          props.onOpen(props.listing);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <img
        alt={`${props.listing.shortAddress} exterior`}
        className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]"
        loading={props.priority === true ? "eager" : "lazy"}
        src={props.listing.imageUrl}
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,15,10,0.02)_0%,rgba(7,15,10,0.06)_38%,rgba(7,15,10,0.74)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-[58%] backdrop-blur-[1px] [mask-image:linear-gradient(180deg,transparent_0%,black_58%)]" />
      <div className="absolute left-5 top-5">
        <ListingBadge listing={props.listing} />
      </div>
      <button
        onClick={(event) => {
          event.stopPropagation();
          props.onToggleFavorite(props.listing);
        }}
        aria-label={`save ${props.listing.shortAddress}`}
        aria-pressed={props.isFavorite}
        className={cn(
          "absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-white/88 text-harwick-ink shadow-[0_14px_32px_rgba(14,18,15,0.16)] backdrop-blur-md transition hover:bg-white",
          props.isFavorite && "bg-harwick-brass-soft text-harwick-ink ring-1 ring-harwick-brass/35",
        )}
        type="button"
      >
        <Heart
          aria-hidden="true"
          className={cn("h-5 w-5", props.isFavorite && "fill-harwick-brass text-harwick-brass")}
          strokeWidth={1.8}
        />
      </button>
      <div className="absolute inset-x-0 bottom-0 p-6 text-white">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-[radial-gradient(circle_at_30%_70%,rgba(86,112,45,0.34),transparent_42%),linear-gradient(180deg,transparent_0%,rgba(8,17,10,0.82)_100%)]" />
        <div className="relative rounded-[24px] border border-white/10 bg-white/[0.055] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_-24px_70px_rgba(6,12,8,0.15)] backdrop-blur-[10px]">
          <div className="mb-2 flex items-end gap-2">
            <div className="text-[30px] font-semibold leading-none tracking-[-0.01em]">{props.listing.price}</div>
            <div className="pb-0.5 text-[12px] text-white/54">list price</div>
          </div>
          <div className="max-w-[82%] truncate text-[16px] font-medium text-white/86">{props.listing.shortAddress}</div>
          <div className="mt-1 flex items-center gap-1.5 text-[13px] text-white/58">
            <MapPin aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.7} />
            <span className="truncate">{props.listing.address}</span>
          </div>
          <div className="my-4 h-px bg-white/16" />
          <div className="grid grid-cols-3 gap-3">
            <Stat icon={BedDouble} label="beds" value={props.listing.beds} />
            <Stat icon={Bath} label="baths" value={props.listing.baths} />
            <Stat icon={Ruler} label="" value={props.listing.area} />
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/16 pt-4 text-[12px] text-white/56">
            <span className="truncate">
              by <span className="font-semibold text-white/88">{props.listing.agent}</span>
            </span>
            <span className="shrink-0">{props.listing.updated}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
    style: "currency",
    currency: "USD",
  }).format(value);
}

function CostCalculator(props: { listing: Listing }) {
  const downPayment = Math.round(props.listing.priceValue * 0.2);
  const loanAmount = props.listing.priceValue - downPayment;
  const monthlyPrincipal = Math.round((loanAmount * 0.0675) / 12);
  const monthlyTaxes = Math.round((props.listing.priceValue * (props.listing.annualTaxRate / 100)) / 12);
  const monthlyInsurance = Math.round(props.listing.priceValue * 0.00035);
  const monthlyEstimate = monthlyPrincipal + monthlyTaxes + monthlyInsurance + props.listing.monthlyHoa;

  return (
    <div className="rounded-[26px] border border-border bg-surface-muted p-5">
      <div className="text-[13px] font-semibold">estimated monthly</div>
      <div className="mt-2 font-display text-[33px] font-medium leading-none">
        {formatMoney(monthlyEstimate)}
      </div>
      <div className="mt-1 text-[11px] text-muted-subtle">20% down, 6.75% illustrative rate</div>
      <div className="mt-5 space-y-2.5 text-[12px] text-muted">
        {[
          ["down payment", formatMoney(downPayment)],
          ["loan amount", formatMoney(loanAmount)],
          ["taxes", `${formatMoney(monthlyTaxes)}/mo`],
          ["insurance", `${formatMoney(monthlyInsurance)}/mo`],
          ["hoa", `${formatMoney(props.listing.monthlyHoa)}/mo`],
        ].map(([label, value]) => (
          <div className="flex justify-between gap-4 border-b border-border pb-2 last:border-b-0 last:pb-0" key={label}>
            <span>{label}</span>
            <span className="font-semibold text-foreground">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InquiryDialog(props: {
  intent: InquiryIntent;
  listing: Listing | null;
  onClose: () => void;
  workspaceName: string;
}) {
  const { intent, listing, onClose, workspaceName } = props;
  const listingLabel = listing?.shortAddress ?? "the inventory";
  const messageSeed = intent === "showing"
    ? `I would like to schedule a showing for ${listingLabel}.`
    : intent === "question"
      ? `I have a question about ${listingLabel}.`
      : "I would like help with the current listings.";
  const [message, setMessage] = useState(messageSeed);

  useEffect(() => {
    setMessage(messageSeed);
  }, [messageSeed]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      aria-labelledby="public-listing-inquiry-title"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-harwick-ink/48 p-4 backdrop-blur-md"
      role="dialog"
    >
      <div className="w-full max-w-[520px] overflow-hidden rounded-[28px] border border-white/20 bg-harwick-paper shadow-[0_36px_120px_rgba(8,15,10,0.36)]">
        <div className="flex items-start justify-between gap-4 border-b border-border bg-surface px-6 py-5">
          <div>
            <h2 className="font-display text-[30px] font-medium leading-none" id="public-listing-inquiry-title">
              let&apos;s connect.
            </h2>
            <p className="mt-2 text-[13px] leading-6 text-muted">
              Harwick will attach {listing === null ? "your request" : listingLabel}, route it to {listing?.agent ?? workspaceName}, and follow up with the next best step.
            </p>
          </div>
          <button
            aria-label="close inquiry form"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted transition hover:border-border-strong hover:text-foreground"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        <form
          className="space-y-4 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            onClose();
          }}
        >
          <label className="block text-[12px] font-semibold text-foreground" htmlFor="inquiry-name">
            name
            <span className="mt-2 flex items-center gap-2 rounded-2xl border border-border bg-surface px-3 py-2.5 focus-within:border-border-strong focus-within:ring-2 focus-within:ring-harwick-brass/20">
              <User aria-hidden="true" className="h-4 w-4 text-muted-subtle" />
              <input
                className="min-w-0 flex-1 bg-transparent text-[14px] font-normal outline-none placeholder:text-muted-subtle"
                id="inquiry-name"
                name="name"
                placeholder="your name"
                required
              />
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-[12px] font-semibold text-foreground" htmlFor="inquiry-phone">
              phone
              <span className="mt-2 flex items-center gap-2 rounded-2xl border border-border bg-surface px-3 py-2.5 focus-within:border-border-strong focus-within:ring-2 focus-within:ring-harwick-brass/20">
                <Phone aria-hidden="true" className="h-4 w-4 text-muted-subtle" />
                <input
                  className="min-w-0 flex-1 bg-transparent text-[14px] font-normal outline-none placeholder:text-muted-subtle"
                  id="inquiry-phone"
                  name="phone"
                  placeholder="(555) 000-0000"
                  type="tel"
                />
              </span>
            </label>

            <label className="block text-[12px] font-semibold text-foreground" htmlFor="inquiry-email">
              email
              <span className="mt-2 flex items-center gap-2 rounded-2xl border border-border bg-surface px-3 py-2.5 focus-within:border-border-strong focus-within:ring-2 focus-within:ring-harwick-brass/20">
                <Mail aria-hidden="true" className="h-4 w-4 text-muted-subtle" />
                <input
                  className="min-w-0 flex-1 bg-transparent text-[14px] font-normal outline-none placeholder:text-muted-subtle"
                  id="inquiry-email"
                  name="email"
                  placeholder="you@example.com"
                  type="email"
                />
              </span>
            </label>
          </div>

          <label className="block text-[12px] font-semibold text-foreground" htmlFor="inquiry-message">
            message
            <span className="mt-2 block rounded-2xl border border-border bg-surface px-3 py-3 focus-within:border-border-strong focus-within:ring-2 focus-within:ring-harwick-brass/20">
              <textarea
                className="min-h-[116px] w-full resize-none bg-transparent text-[14px] font-normal leading-6 outline-none placeholder:text-muted-subtle"
                id="inquiry-message"
                name="message"
                onChange={(event) => setMessage(event.target.value)}
                value={message}
              />
            </span>
          </label>

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <button
              className="rounded-2xl border border-border bg-surface px-4 py-2.5 text-[13px] font-semibold text-muted transition hover:border-border-strong hover:text-foreground"
              onClick={onClose}
              type="button"
            >
              cancel
            </button>
            <button className="inline-flex items-center justify-center gap-2 rounded-2xl bg-harwick-ink px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-harwick-ink-soft" type="submit">
              <Send aria-hidden="true" className="h-4 w-4" />
              send to Harwick
            </button>
          </div>

          <div className="flex items-center justify-center gap-2 border-t border-border pt-4 text-[11px] text-muted-subtle">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-harwick-ink font-display text-[11px] text-harwick-brass">H</span>
            powered by Harwick - responses in minutes
          </div>
        </form>
      </div>
    </div>
  );
}

function ListingViewer(props: {
  listing: Listing | null;
  onClose: () => void;
  onInquire: (intent: InquiryIntent, listing: Listing) => void;
}) {
  const { listing, onClose, onInquire } = props;

  useEffect(() => {
    if (listing === null) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [listing, onClose]);

  if (listing === null) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-harwick-ink/42 p-4 backdrop-blur-sm">
      <div className="mx-auto min-h-full max-w-[1180px] py-6">
        <div className="overflow-hidden rounded-[34px] border border-border bg-harwick-parchment shadow-[0_40px_120px_rgba(8,15,10,0.34)]">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-surface/92 px-5 py-4 backdrop-blur-xl">
            <button className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-2 text-[12px] font-semibold transition hover:border-border-strong" onClick={onClose} type="button">
              <ChevronLeft aria-hidden="true" className="h-4 w-4" />
              all listings
            </button>
            <div className="flex items-center gap-2">
              <a className="hidden rounded-full border border-border px-3.5 py-2 text-[12px] font-semibold transition hover:border-border-strong sm:inline-flex" href="tel:+19495550187">
                call agent
              </a>
              <button className="rounded-full bg-harwick-ink px-3.5 py-2 text-[12px] font-semibold text-white transition hover:bg-harwick-ink-soft" onClick={() => onInquire("question", listing)} type="button">
                inquire
              </button>
              <button aria-label="close listing viewer" className="flex h-9 w-9 items-center justify-center rounded-full border border-border transition hover:border-border-strong" onClick={onClose} type="button">
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <section>
              <div className="grid gap-3 md:grid-cols-[1.35fr_0.65fr]">
                <div className="relative min-h-[460px] overflow-hidden rounded-[30px] bg-harwick-ink">
                  <img alt={`${listing.shortAddress} main view`} className="h-full min-h-[460px] w-full object-cover" src={listing.photos[0]} />
                  <div className="absolute left-5 top-5">
                    <ListingBadge listing={listing} />
                  </div>
                  <div className="absolute bottom-5 left-5 rounded-full bg-white/86 px-3 py-2 text-[12px] font-semibold backdrop-blur-md">
                    <Grid2X2 aria-hidden="true" className="mr-1.5 inline h-4 w-4" />
                    {listing.photos.length} photos
                  </div>
                </div>
                <div className="grid gap-3">
                  {listing.photos.slice(1).map((photo, index) => (
                    <img
                      alt={`${listing.shortAddress} detail ${index + 1}`}
                      className="h-[145px] w-full rounded-[22px] object-cover"
                      key={photo}
                      src={photo}
                    />
                  ))}
                </div>
              </div>

              <div className="mt-6 rounded-[30px] border border-border bg-surface p-6">
                <div className="flex flex-wrap items-start justify-between gap-5">
                  <div>
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-surface-muted px-3 py-1.5 text-[11px] font-semibold text-muted">
                      <span className="h-1.5 w-1.5 rounded-full bg-sage" />
                      active listing - {listing.updated}
                    </div>
                    <div className="font-display text-[42px] font-medium leading-none">{listing.price}</div>
                    <div className="mt-3 text-[18px] font-semibold">{listing.shortAddress}</div>
                    <div className="mt-1 flex items-center gap-1.5 text-[13px] text-muted">
                      <MapPin aria-hidden="true" className="h-4 w-4" />
                      {listing.address}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-surface-muted px-4 py-3 text-[12px] text-muted">
                    <div className="font-semibold text-foreground">{listing.agent}</div>
                    listing agent
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-4">
                  {[
                    [BedDouble, `${listing.beds} beds`],
                    [Bath, `${listing.baths} baths`],
                    [Ruler, listing.area],
                    [Building2, listing.type],
                  ].map(([Icon, label]) => {
                    const DetailIcon = Icon as typeof BedDouble;
                    return (
                      <div className="rounded-[22px] border border-border bg-surface-muted p-4" key={label as string}>
                        <DetailIcon aria-hidden="true" className="mb-3 h-5 w-5 text-muted" />
                        <div className="text-[13px] font-semibold">{label as string}</div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-6 border-t border-border pt-5">
                  <div className="flex items-center gap-2 text-[13px] font-semibold">
                    <MessageSquare aria-hidden="true" className="h-4 w-4 text-muted" />
                    listing notes
                  </div>
                  <p className="mt-2 max-w-[760px] text-[14px] leading-7 text-muted">{listing.description}</p>
                </div>

                <div className="mt-6 grid gap-3 border-t border-border pt-5 sm:grid-cols-2">
                  <div className="rounded-[22px] bg-surface-muted p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-subtle">mls</div>
                    <div className="mt-2 text-[13px] font-semibold">{listing.mls}</div>
                  </div>
                  <div className="rounded-[22px] bg-surface-muted p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-subtle">built / lot</div>
                    <div className="mt-2 text-[13px] font-semibold">{listing.yearBuilt} / {listing.lot}</div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {listing.features.map((feature) => (
                    <span className="rounded-full border border-border bg-surface px-3 py-2 text-[11px] font-medium text-muted" key={feature}>
                      {feature}
                    </span>
                  ))}
                </div>
              </div>
            </section>

            <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
              <div className="rounded-[30px] border border-border bg-surface p-5 shadow-[0_18px_60px_rgba(24,30,24,0.08)]">
                <div className="text-[13px] font-semibold">inquire about this listing</div>
                <div className="mt-1 text-[12px] text-muted">Harwick will send the listing, summarize your request, and route it to {listing.agent}.</div>
                <div className="mt-5 space-y-2">
                  <button className="w-full rounded-2xl bg-harwick-ink px-4 py-3 text-[13px] font-semibold text-white transition hover:bg-harwick-ink-soft" onClick={() => onInquire("question", listing)} type="button">
                    ask a question
                  </button>
                  <button className="w-full rounded-2xl border border-border px-4 py-3 text-[13px] font-semibold transition hover:border-border-strong hover:bg-surface-muted" onClick={() => onInquire("showing", listing)} type="button">
                    request showing
                  </button>
                </div>
              </div>

              <div className="rounded-[26px] border border-border bg-surface p-5">
                <div className="text-[13px] font-semibold">open house</div>
                <div className="mt-2 flex items-center gap-2 text-[14px] text-muted">
                  <Calendar aria-hidden="true" className="h-4 w-4" />
                  {listing.openHouse}
                </div>
              </div>

              <CostCalculator listing={listing} />
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PublicListingsPage(props: { workspaceSlug: string }) {
  const workspaceName = formatWorkspaceName(props.workspaceSlug);
  const [selectedListingSlug, setSelectedListingSlug] = useState<string | null>(null);
  const [inquiryState, setInquiryState] = useState<{ intent: InquiryIntent; listing: Listing | null } | null>(null);
  const [favoriteSlugs, setFavoriteSlugs] = useState<string[]>([]);
  const [activeFilter, setActiveFilter] = useState<ListingFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const selectedListing = useMemo(
    () => listings.find((listing) => listing.slug === selectedListingSlug) ?? null,
    [selectedListingSlug],
  );
  const visibleListings = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return listings.filter((listing) => {
      const matchesFilter = activeFilter === "all" || listing.filter === activeFilter;
      const matchesQuery = normalizedQuery.length === 0
        || [
          listing.shortAddress,
          listing.address,
          listing.neighborhood,
          listing.mls,
          listing.type,
          listing.agent,
          ...listing.features,
        ].some((value) => value.toLowerCase().includes(normalizedQuery));

      return matchesFilter && matchesQuery;
    });
  }, [activeFilter, searchQuery]);
  const featuredListing = listings[0] as Listing;
  const openInquiry = (intent: InquiryIntent, listing: Listing | null = selectedListing) => {
    setInquiryState({ intent, listing });
  };
  const toggleFavorite = (listing: Listing) => {
    setFavoriteSlugs((currentFavorites) => currentFavorites.includes(listing.slug)
      ? currentFavorites.filter((slug) => slug !== listing.slug)
      : [...currentFavorites, listing.slug]);
  };

  return (
    <main className="min-h-screen bg-harwick-parchment text-harwick-ink">
      <header className="sticky top-0 z-40 border-b border-harwick-border/70 bg-harwick-parchment/88 px-4 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-4">
          <a className="flex items-center gap-3" href={`/${props.workspaceSlug}/listings`}>
            <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-harwick-ink font-display text-[17px] text-harwick-brass shadow-[0_10px_24px_rgba(26,42,32,0.14)]">
              {workspaceName.charAt(0)}
            </span>
            <span>
              <span className="block text-[15px] font-semibold leading-none">{workspaceName}</span>
              <span className="mt-1 block text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-subtle">
                by harwick
              </span>
            </span>
          </a>
          <nav className="ml-auto hidden items-center gap-1 text-[13px] font-medium text-muted md:flex">
            <a className="rounded-lg px-3.5 py-2 text-foreground transition hover:bg-surface-muted" href="#listings">listings</a>
            <a className="rounded-lg px-3.5 py-2 transition hover:bg-surface-muted hover:text-foreground" href="#contact">inquire</a>
          </nav>
          <a
            className="ml-auto hidden h-9 items-center gap-2 rounded-lg border border-border bg-surface/80 px-3.5 text-[13px] font-medium shadow-sm transition hover:border-border-strong md:flex"
            href="tel:+19495550187"
          >
            <Phone aria-hidden="true" className="h-4 w-4 text-qualified" />
            {pageCopy.phone}
          </a>
          <button
            className="inline-flex min-w-[108px] items-center justify-center rounded-lg bg-harwick-ink px-4 py-2.5 text-center text-[13px] font-semibold text-white shadow-[0_14px_34px_rgba(26,42,32,0.18)] transition hover:bg-harwick-ink-soft"
            onClick={() => openInquiry("general", null)}
            type="button"
          >
            <span className="relative z-10 text-white">ask harwick</span>
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-[1320px] px-6 pb-8 pt-5">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(440px,1fr)] lg:items-end">
          <div className="py-6">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-2 text-[12px] font-medium text-muted shadow-sm">
              <Send aria-hidden="true" className="h-4 w-4 text-harwick-brass" />
              live inventory Harwick can send in DMs
            </div>
            <h1 className="max-w-[760px] font-display text-[58px] font-medium leading-[0.94] text-harwick-ink md:text-[78px]">
              {pageCopy.headline}
            </h1>
            <p className="mt-5 max-w-[620px] text-[18px] leading-7 text-muted">
              {pageCopy.subheadline}
            </p>
            <div className="mt-7 flex max-w-[780px] flex-wrap items-center gap-3 rounded-[24px] border border-border bg-surface/88 p-2 shadow-[0_24px_70px_rgba(24,30,24,0.10)] backdrop-blur-md">
              <div className="flex min-w-[240px] flex-1 items-center gap-3 px-4">
                <Search aria-hidden="true" className="h-5 w-5 text-[#8b9188]" />
                <input
                  aria-label="search listings"
                  className="h-11 min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-subtle"
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="city, neighborhood, address, or MLS"
                  value={searchQuery}
                />
              </div>
              <button className="flex h-11 items-center gap-2 rounded-2xl border border-border bg-surface px-4 text-[13px] font-medium transition hover:border-border-strong hover:bg-surface-muted" type="button">
                <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
                filters
              </button>
              <button className="h-11 rounded-2xl bg-harwick-ink px-6 text-[13px] font-semibold text-white transition hover:bg-harwick-ink-soft" type="button">
                search
              </button>
            </div>
          </div>

          <ListingCard
            isFavorite={favoriteSlugs.includes(featuredListing.slug)}
            listing={featuredListing}
            onOpen={(listing) => setSelectedListingSlug(listing.slug)}
            onToggleFavorite={toggleFavorite}
            priority
          />
        </div>
      </section>

      <section className="mx-auto max-w-[1320px] px-6 pb-16" id="listings">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-5">
          <div>
            <h2 className="font-display text-[31px] font-medium leading-none">{pageCopy.activeListingsLabel}</h2>
            <p className="mt-2 text-[14px] text-muted">
              showing {visibleListings.length} homes from {workspaceName}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {filters.map((filter) => (
              <button
                className={cn(
                  "rounded-full border px-3.5 py-2 text-[12px] font-medium transition",
                  activeFilter === filter.key
                    ? "border-harwick-ink bg-harwick-ink text-white"
                    : "border-border bg-surface text-muted hover:border-border-strong hover:bg-surface-muted hover:text-foreground",
                )}
                key={filter.key}
                onClick={() => setActiveFilter(filter.key)}
                type="button"
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {visibleListings.map((listing) => (
            <ListingCard
              isFavorite={favoriteSlugs.includes(listing.slug)}
              key={listing.slug}
              listing={listing}
              onOpen={(activeListing) => setSelectedListingSlug(activeListing.slug)}
              onToggleFavorite={toggleFavorite}
            />
          ))}
        </div>
        {visibleListings.length === 0 ? (
          <div className="mt-6 rounded-[30px] border border-border bg-surface p-8 text-center">
            <div className="font-display text-[26px] font-medium">no matching listings</div>
            <p className="mt-2 text-[13px] text-muted">Clear the search or choose a different filter.</p>
            <button
              className="mt-5 rounded-full bg-harwick-ink px-5 py-3 text-[12px] font-semibold text-white"
              onClick={() => {
                setSearchQuery("");
                setActiveFilter("all");
              }}
              type="button"
            >
              reset listings
            </button>
          </div>
        ) : null}

        <div
          className="mt-8 grid gap-4 rounded-[30px] border border-border bg-surface p-5 shadow-[0_22px_70px_rgba(24,30,24,0.08)] md:grid-cols-[1fr_auto_auto]"
          id="contact"
        >
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-harwick-ink text-white">
              <MessageSquare aria-hidden="true" className="h-5 w-5" />
            </span>
            <div>
              <div className="text-[16px] font-semibold">questions about a listing?</div>
              <div className="mt-1 text-[13px] text-muted">Ask Harwick for details, showing times, similar homes, or current availability from {workspaceName}.</div>
            </div>
          </div>
          <a className="flex items-center justify-center gap-2 rounded-2xl border border-border px-5 py-3 text-[13px] font-semibold transition hover:border-border-strong hover:bg-surface-muted" href="tel:+19495550187">
            <Phone aria-hidden="true" className="h-4 w-4" />
            call or text
          </a>
          <button className="flex items-center justify-center gap-2 rounded-2xl bg-harwick-ink px-5 py-3 text-[13px] font-semibold text-white transition hover:bg-harwick-ink-soft" onClick={() => openInquiry("general", null)} type="button">
            <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
            inquire now
          </button>
        </div>
      </section>

      <footer className="bg-harwick-ink px-6 py-10 text-white">
        <div className="mx-auto max-w-[1320px]">
          <div className="flex flex-col justify-between gap-8 border-b border-white/10 pb-8 md:flex-row">
            <div>
              <div className="font-display text-[24px] font-medium">{workspaceName}</div>
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/32">by Harwick</div>
              <p className="mt-4 max-w-[320px] text-[13px] leading-6 text-white/52">
                Live listing support for buyers who need availability, showing windows, and a fast route to the right agent.
              </p>
            </div>
            <div>
              <div className="text-[12px] text-white/48">reach the team</div>
              <a className="mt-1 block font-display text-[24px] text-white transition hover:text-harwick-brass" href="tel:+19495550187">
                {pageCopy.phone}
              </a>
            </div>
          </div>

          <div className="flex flex-col gap-4 pt-6 text-[11px] text-white/30 md:flex-row md:items-center md:justify-between">
            <span>(c) 2026 {workspaceName}. All rights reserved.</span>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <a className="transition hover:text-white/55" href="#contact">privacy</a>
              <a className="transition hover:text-white/55" href="#contact">terms</a>
              <a className="transition hover:text-white/55" href="#contact">fair housing</a>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex h-4 w-4 items-center justify-center rounded bg-white/10 font-display text-[9px] text-harwick-brass">H</span>
              powered by Harwick
            </div>
          </div>
        </div>
      </footer>

      <ListingViewer
        listing={selectedListing}
        onClose={() => setSelectedListingSlug(null)}
        onInquire={(intent, listing) => openInquiry(intent, listing)}
      />
      {inquiryState === null ? null : (
        <InquiryDialog
          intent={inquiryState.intent}
          listing={inquiryState.listing}
          onClose={() => setInquiryState(null)}
          workspaceName={workspaceName}
        />
      )}
    </main>
  );
}
