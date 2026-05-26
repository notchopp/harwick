"use client";

import {
  ArrowUpRight,
  Bath,
  BedDouble,
  Building2,
  Calendar,
  ChevronLeft,
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
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Drawer } from "vaul";

import { ListingMediaGallery, photosToMedia, type ListingMedia } from "./listing-media-gallery";
import { cn } from "../../lib/utils";

export type PublicListingCardData = {
  id: string;
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
  phone: string | null;
  activeListingsLabel: string;
  headline: string;
  subheadline: string;
};

type InquiryIntent = "general" | "question" | "showing" | "open_house";

const pageCopy: PublicListingsCopy = {
  phone: null,
  activeListingsLabel: "all listings",
  headline: "ask about any home.",
  subheadline: "Current availability, financing, and showing help in one thread.",
};


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

  return name.length === 0 ? "Workspace" : name;
}

function readFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** Bridges the current photos:string[] shape onto the unified ListingMedia
 *  type the gallery component consumes. Once PublicListingCardData grows a
 *  `media` field (with optional kind=video|virtual_tour entries), callers
 *  can pass it through directly. */
function listingMediaFor(listing: PublicListingCardData): ListingMedia[] {
  return photosToMedia(listing.photos.length > 0 ? listing.photos : [listing.imageUrl]);
}

/** Lightweight media-query hook for the desktop-modal / mobile-drawer split.
 *  Reads window.matchMedia once on mount, subscribes to changes. SSR-safe
 *  default is `false` so the first paint matches the mobile shell — this
 *  matches the way Tailwind's lg: breakpoint behaves. */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return isDesktop;
}

function usePublicListingDarkBrowserChrome() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const className = "harwick-public-dark-chrome";
    const mountCountKey = "harwickPublicDarkChromeCount";
    const existingColorScheme = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
    const previousColorScheme = existingColorScheme?.content ?? null;
    const colorSchemeMeta = existingColorScheme ?? document.createElement("meta");
    const previousViewportHeight = html.style.getPropertyValue("--harwick-public-viewport-height");
    const readMountCount = () => Number(html.dataset[mountCountKey] ?? "0");
    const writeViewportHeight = () => {
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      html.style.setProperty("--harwick-public-viewport-height", `${Math.ceil(viewportHeight)}px`);
    };

    if (existingColorScheme === null) {
      colorSchemeMeta.name = "color-scheme";
      document.head.appendChild(colorSchemeMeta);
    }

    html.dataset[mountCountKey] = String(readMountCount() + 1);
    html.classList.add(className);
    body.classList.add(className);
    colorSchemeMeta.content = "dark";
    writeViewportHeight();
    window.visualViewport?.addEventListener("resize", writeViewportHeight);
    window.visualViewport?.addEventListener("scroll", writeViewportHeight);
    window.addEventListener("resize", writeViewportHeight);

    return () => {
      window.visualViewport?.removeEventListener("resize", writeViewportHeight);
      window.visualViewport?.removeEventListener("scroll", writeViewportHeight);
      window.removeEventListener("resize", writeViewportHeight);

      const nextMountCount = Math.max(0, readMountCount() - 1);
      if (nextMountCount > 0) {
        html.dataset[mountCountKey] = String(nextMountCount);
        return;
      }

      delete html.dataset[mountCountKey];
      html.classList.remove(className);
      body.classList.remove(className);
      if (previousViewportHeight.length === 0) {
        html.style.removeProperty("--harwick-public-viewport-height");
      } else {
        html.style.setProperty("--harwick-public-viewport-height", previousViewportHeight);
      }
      if (existingColorScheme === null) {
        colorSchemeMeta.remove();
      } else if (previousColorScheme !== null) {
        colorSchemeMeta.content = previousColorScheme;
      }
    };
  }, []);
}

// Shared scrollbar-hide utility for content inside dark surfaces — the
// default OS bars sit on top of our hairline borders and look heavy.
const SCROLL_HIDE = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

function ListingBadge(props: { listing: PublicListingCardData }) {
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

function ListingImage(props: { alt: string; className: string; loading?: "eager" | "lazy"; src: string | undefined }) {
  if (props.src === undefined || props.src.trim().length === 0) {
    return (
      <div className={cn(props.className, "flex items-center justify-center bg-[radial-gradient(circle_at_35%_20%,rgba(183,150,91,0.22),transparent_34%),linear-gradient(135deg,#213228,#111a15)]")}>
        <Building2 aria-hidden="true" className="h-10 w-10 text-white/45" strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <img
      alt={props.alt}
      className={props.className}
      loading={props.loading}
      src={props.src}
    />
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
  listing: PublicListingCardData;
  onOpen: (listing: PublicListingCardData) => void;
  onToggleFavorite: (listing: PublicListingCardData) => void;
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
      <ListingImage
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
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#b5c9a8]/80">
            live listing · updated {props.listing.updated}
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

function InquiryDialog(props: {
  canSubmitListingScopedInquiries: boolean;
  intent: InquiryIntent;
  listing: PublicListingCardData | null;
  onClose: () => void;
  workspaceSlug: string;
  workspaceName: string;
}) {
  const { canSubmitListingScopedInquiries, intent, listing, onClose, workspaceName, workspaceSlug } = props;
  const listingLabel = listing?.shortAddress ?? "the inventory";
  const messageSeed = intent === "showing"
    ? `I would like to schedule a showing for ${listingLabel}.`
    : intent === "open_house"
      ? `I would like to register for the open house at ${listingLabel}.`
    : intent === "question"
      ? `I have a question about ${listingLabel}.`
      : "I would like help with the current listings.";
  const [message, setMessage] = useState(messageSeed);
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "sent" | "failed">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitState("submitting");
    setSubmitError(null);

    const formData = new FormData(event.currentTarget);
    const preferredStartRaw = readFormString(formData, "preferredStart");
    const preferredStart = preferredStartRaw.length === 0 ? null : new Date(preferredStartRaw);
    const requestedStartAt = preferredStart === null || Number.isNaN(preferredStart.getTime())
      ? null
      : preferredStart.toISOString();
    const requestedEndAt = preferredStart === null || Number.isNaN(preferredStart.getTime())
      ? null
      : new Date(preferredStart.getTime() + 30 * 60 * 1000).toISOString();
    const listingIsPersisted = listing !== null && canSubmitListingScopedInquiries;
    const submittedIntent = (intent === "showing" || intent === "open_house") && !listingIsPersisted ? "general" : intent;
    const url = new URL(`/${workspaceSlug}/api/listings/inquiry`, window.location.origin);
    if (listingIsPersisted) {
      url.searchParams.set("listingId", listing.id);
    }

    const response = await fetch(`${url.pathname}${url.search}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fullName: readFormString(formData, "fullName"),
        phone: readFormString(formData, "phone"),
        email: readFormString(formData, "email"),
        intent: submittedIntent,
        message,
        requestedStartAt,
        requestedEndAt,
      }),
    });

    if (!response.ok) {
      setSubmitState("failed");
      setSubmitError("Harwick could not save this request. Try again or call the agent.");
      return;
    }

    setSubmitState("sent");
  }

  return (
    <div
      aria-labelledby="public-listing-inquiry-title"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(8,12,8,0.62)] p-4 backdrop-blur-[18px] backdrop-saturate-125"
      onClick={onClose}
      role="dialog"
    >
      <div
        className="relative w-full max-w-[520px] overflow-hidden rounded-[28px] border border-white/8 bg-[#0c130e] text-white shadow-[0_42px_120px_-12px_rgba(0,0,0,0.65)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[28px]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 86% 4%, rgba(136,162,118,0.22), transparent 40%), linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0) 22%)",
          }}
        />
        <div className="relative flex items-start justify-between gap-3 px-6 pt-5 pb-4">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase leading-none tracking-[0.18em] text-white/46">
              {intent === "showing" ? "request a showing" : intent === "open_house" ? "register for open house" : "send a question"}
            </div>
            <h2 className="mt-2 font-display text-[26px] font-medium lowercase leading-[1.05] tracking-[-0.02em] text-white" id="public-listing-inquiry-title">
              let&apos;s connect.
            </h2>
            <p className="mt-1.5 text-[12.5px] leading-5 text-white/56">
              Harwick attaches {listing === null ? "your request" : listingLabel} and routes it to {listing?.agent ?? workspaceName}.
            </p>
          </div>
          <button
            aria-label="close inquiry form"
            className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] text-white/70 transition hover:border-white/22 hover:text-white"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        <form
          className="relative space-y-3.5 px-6 pb-6"
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-white/40" htmlFor="inquiry-name">
            name
            <span className="mt-1.5 flex items-center gap-2 rounded-[14px] border border-white/10 bg-white/[0.04] px-3 py-2.5 transition focus-within:border-[#88a276]/50 focus-within:bg-white/[0.06]">
              <User aria-hidden="true" className="h-4 w-4 text-white/40" />
              <input
                className="min-w-0 flex-1 bg-transparent text-[14px] font-normal text-white outline-none placeholder:text-white/30"
                id="inquiry-name"
                name="fullName"
                placeholder="your name"
                required
              />
            </span>
          </label>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-white/40" htmlFor="inquiry-phone">
              phone
              <span className="mt-1.5 flex items-center gap-2 rounded-[14px] border border-white/10 bg-white/[0.04] px-3 py-2.5 transition focus-within:border-[#88a276]/50 focus-within:bg-white/[0.06]">
                <Phone aria-hidden="true" className="h-4 w-4 text-white/40" />
                <input
                  className="min-w-0 flex-1 bg-transparent text-[14px] font-normal text-white outline-none placeholder:text-white/30"
                  id="inquiry-phone"
                  name="phone"
                  placeholder="phone number"
                  required
                  type="tel"
                />
              </span>
            </label>

            <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-white/40" htmlFor="inquiry-email">
              email
              <span className="mt-1.5 flex items-center gap-2 rounded-[14px] border border-white/10 bg-white/[0.04] px-3 py-2.5 transition focus-within:border-[#88a276]/50 focus-within:bg-white/[0.06]">
                <Mail aria-hidden="true" className="h-4 w-4 text-white/40" />
                <input
                  className="min-w-0 flex-1 bg-transparent text-[14px] font-normal text-white outline-none placeholder:text-white/30"
                  id="inquiry-email"
                  name="email"
                  placeholder="you@example.com"
                  required
                  type="email"
                />
              </span>
            </label>
          </div>

          <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-white/40" htmlFor="inquiry-message">
            message
            <span className="mt-1.5 block rounded-[14px] border border-white/10 bg-white/[0.04] px-3 py-2.5 transition focus-within:border-[#88a276]/50 focus-within:bg-white/[0.06]">
              <textarea
                className="min-h-[96px] w-full resize-none bg-transparent text-[14px] font-normal leading-6 text-white outline-none placeholder:text-white/30"
                id="inquiry-message"
                name="message"
                onChange={(event) => setMessage(event.target.value)}
                value={message}
              />
            </span>
          </label>

          {intent === "showing" || intent === "open_house" ? (
            <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-white/40" htmlFor="inquiry-preferred-start">
              {intent === "open_house" ? "preferred arrival time" : "preferred showing time"}
              <span className="mt-1.5 flex items-center gap-2 rounded-[14px] border border-white/10 bg-white/[0.04] px-3 py-2.5 transition focus-within:border-[#88a276]/50 focus-within:bg-white/[0.06]">
                <Calendar aria-hidden="true" className="h-4 w-4 text-white/40" />
                <input
                  className="min-w-0 flex-1 bg-transparent text-[14px] font-normal text-white outline-none placeholder:text-white/30 [color-scheme:dark]"
                  id="inquiry-preferred-start"
                  name="preferredStart"
                  type="datetime-local"
                />
              </span>
            </label>
          ) : null}

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <button
              className="rounded-[14px] border border-white/12 bg-white/[0.04] px-4 py-2.5 text-[13px] font-semibold lowercase text-white/82 transition hover:border-white/22 hover:bg-white/[0.06]"
              onClick={onClose}
              type="button"
            >
              cancel
            </button>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-[14px] bg-[#88a276] px-4 py-2.5 text-[13px] font-semibold lowercase text-[#07100a] shadow-[0_10px_22px_rgba(136,162,118,0.30)] transition hover:bg-[#94ad81] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={submitState === "submitting" || submitState === "sent"}
              type="submit"
            >
              <Send aria-hidden="true" className="h-4 w-4" />
              {submitState === "submitting" ? "sending" : submitState === "sent" ? "sent" : "send to harwick"}
            </button>
          </div>

          {submitState === "sent" ? (
            <div className="rounded-[14px] border border-[var(--sage)]/30 bg-[var(--sage)]/12 px-4 py-3 text-[12px] font-medium text-white/86">
              Harwick saved the request and routed it into the workspace.
            </div>
          ) : null}
          {submitState === "failed" && submitError !== null ? (
            <div className="rounded-[14px] border border-[var(--oxblood)]/30 bg-[var(--oxblood)]/12 px-4 py-3 text-[12px] font-medium text-white/86">
              {submitError}
            </div>
          ) : null}

          <div className="flex items-center justify-center gap-2 border-t border-white/8 pt-3.5 text-[10.5px] font-medium lowercase tracking-[0.06em] text-white/40">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[#88a276]/20 font-display text-[10px] text-[var(--sage)]">H</span>
            powered by harwick — responses in minutes
          </div>
        </form>
      </div>
    </div>
  );
}

type ChatMessage = {
  id: string;
  actor: "lead" | "harwick_ai";
  body: string;
  occurredAt: string;
};

type ChatQualification = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  leadType?: "buyer" | "seller" | "renter" | "investor" | "unknown";
  intent?: "high" | "medium" | "low" | "spam" | "unknown";
  timeline?: string | null;
  budget?: string | null;
  targetArea?: string | null;
  propertyType?: string | null;
  financingStatus?: "preapproved" | "cash" | "needs_lender" | "unknown";
  score?: number;
};

function mergeQualification(current: ChatQualification, patch: Record<string, unknown>): ChatQualification {
  const next: ChatQualification = { ...current };
  const leadType = patch["leadType"];
  if (leadType === "buyer" || leadType === "seller" || leadType === "renter" || leadType === "investor" || leadType === "unknown") {
    next.leadType = leadType;
  }
  const intent = patch["intent"];
  if (intent === "high" || intent === "medium" || intent === "low" || intent === "spam" || intent === "unknown") {
    next.intent = intent;
  }
  if (typeof patch["timeline"] === "string") next.timeline = patch["timeline"];
  const budget = patch["budget"];
  if (typeof budget === "string" || typeof budget === "number") next.budget = String(budget);
  if (typeof patch["targetArea"] === "string") next.targetArea = patch["targetArea"];
  if (typeof patch["propertyType"] === "string") next.propertyType = patch["propertyType"];
  const financingStatus = patch["financingStatus"];
  if (financingStatus === "preapproved" || financingStatus === "cash" || financingStatus === "needs_lender" || financingStatus === "unknown") {
    next.financingStatus = financingStatus;
  }
  if (intent === "high") next.score = Math.max(current.score ?? 0, 75);
  return next;
}

function HarwickListingChatPanel(props: {
  listing: PublicListingCardData;
  onClose?: () => void;
  framed?: boolean;
  workspaceSlug: string;
  workspaceName: string;
}) {
  const { framed = true, listing, onClose, workspaceName, workspaceSlug } = props;
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "harwick-open",
      actor: "harwick_ai",
      body: `I'm Harwick for ${workspaceName}. I already have the facts for ${listing.shortAddress}. Ask what matters, or I can help you get toward a showing.`,
      occurredAt: new Date().toISOString(),
    },
  ]);
  const [draft, setDraft] = useState("");
  const [qualification, setQualification] = useState<ChatQualification>({
    leadType: "unknown",
    intent: "unknown",
    targetArea: listing.neighborhood,
    propertyType: listing.type,
    budget: listing.price,
    financingStatus: "unknown",
    score: 0,
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (onClose === undefined) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose?.();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function sendMessage(message: string) {
    const trimmed = message.trim();
    if (trimmed.length === 0 || pending) return;

    setError(null);
    setPending(true);
    setDraft("");

    const leadMessage: ChatMessage = {
      id: `lead-${Date.now()}`,
      actor: "lead",
      body: trimmed,
      occurredAt: new Date().toISOString(),
    };
    const nextMessages = [...messages, leadMessage];
    setMessages(nextMessages);

    let response: Response;
    try {
      response = await fetch(`/${workspaceSlug}/api/listings/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          listingId: listing.id,
          message: trimmed,
          conversation: nextMessages.slice(-12).map((entry) => ({
            id: entry.id,
            actor: entry.actor,
            body: entry.body,
            occurredAt: entry.occurredAt,
          })),
          qualification,
        }),
      });
    } catch {
      setPending(false);
      setError("Harwick could not answer right now. You can still request a showing.");
      return;
    }

    if (!response.ok) {
      setPending(false);
      setError("Harwick could not answer right now. You can still request a showing.");
      return;
    }

    const data = await response.json() as {
      reply?: unknown;
      statePatch?: Record<string, unknown>;
      nextAction?: unknown;
    };
    const reply = typeof data.reply === "string" && data.reply.trim().length > 0
      ? data.reply.trim()
      : "I can help with that. What timeline are you working with?";
    setMessages((current) => [
      ...current,
      {
        id: `harwick-${Date.now()}`,
        actor: "harwick_ai",
        body: reply,
        occurredAt: new Date().toISOString(),
      },
    ]);
    if (data.statePatch !== undefined) {
      setQualification((current) => mergeQualification(current, data.statePatch ?? {}));
    }
    setPending(false);
  }

  const prompts = [
    `Is ${listing.shortAddress} still available?`,
    `What do buyers usually ask about ${listing.shortAddress}?`,
    "What would payment look like with 10% down?",
    "Can I see it this weekend?",
  ];

  return (
    <section
      aria-labelledby="public-listing-chat-title"
      className={cn(
        "relative flex min-h-[560px] flex-col overflow-hidden bg-[#0c130e] text-white [color-scheme:dark]",
        framed && "rounded-[28px] border border-white/8 shadow-[0_34px_90px_-24px_rgba(0,0,0,0.72)]",
      )}
    >
      <div
        aria-hidden
        className={cn("pointer-events-none absolute inset-0", framed && "rounded-[28px]")}
        style={{
          backgroundImage:
            "radial-gradient(circle at 86% 4%, rgba(136,162,118,0.22), transparent 40%), linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0) 22%)",
        }}
      />

        <div className="relative flex items-start justify-between gap-3 px-5 pb-4 pt-5 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase leading-none tracking-[0.18em] text-white/46">
              <span className="flex h-4 w-4 items-center justify-center rounded-sm bg-[#88a276]/20 font-display text-[9px] text-[var(--sage)]">H</span>
              harwick · {listing.shortAddress.toLowerCase()}
            </div>
            <h2
              className="mt-2 font-display text-[22px] font-medium lowercase leading-[1.05] tracking-[-0.02em] text-white"
              id="public-listing-chat-title"
            >
              ask anything about this place.
            </h2>
            <p className="mt-1.5 text-[12.5px] leading-5 text-white/56">
              Answers come from this listing's verified facts. If you want to see it, Harwick will qualify the request here.
            </p>
          </div>
          {onClose === undefined ? null : (
            <button
              aria-label="close Harwick chat"
              className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] text-white/70 transition hover:border-white/22 hover:text-white"
              onClick={onClose}
              type="button"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className={cn("relative flex-1 space-y-2.5 overflow-y-auto px-5 py-4", SCROLL_HIDE)}>
          {messages.map((message) => (
            <div
              className={cn(
                "max-w-[86%] text-[13.5px] leading-6",
                message.actor === "lead"
                  ? "ml-auto rounded-[20px] rounded-br-[6px] bg-[#88a276] px-4 py-2.5 font-medium text-[#07100a] shadow-[0_8px_18px_rgba(136,162,118,0.22)]"
                  : "mr-auto rounded-[20px] rounded-bl-[6px] border border-white/10 bg-white/[0.04] px-4 py-2.5 text-white/86",
              )}
              key={message.id}
            >
              {message.body}
            </div>
          ))}
          {pending ? (
            <div className="mr-auto inline-flex max-w-[86%] items-center gap-2 rounded-[20px] rounded-bl-[6px] border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[13px] text-white/56">
              <span className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--sage)]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--sage)] [animation-delay:120ms]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--sage)] [animation-delay:240ms]" />
              </span>
              harwick is reading the listing...
            </div>
          ) : null}
          {error === null ? null : (
            <div className="rounded-[16px] border border-[var(--oxblood)]/30 bg-[var(--oxblood)]/12 px-4 py-3 text-[12.5px] text-white/82">
              {error}
            </div>
          )}
        </div>

        <div className="relative border-t border-white/8 bg-[#0c130e]/95 px-5 py-3.5 backdrop-blur-md">
          {messages.length <= 1 ? (
            <div className={cn("mb-3 -mx-1 flex gap-2 overflow-x-auto pb-1 px-1", SCROLL_HIDE)}>
              {prompts.map((prompt) => (
                <button
                  className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] font-medium lowercase text-white/76 transition hover:border-white/22 hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
                  disabled={pending}
                  key={prompt}
                  onClick={() => {
                    void sendMessage(prompt);
                  }}
                  type="button"
                >
                  {prompt.toLowerCase()}
                </button>
              ))}
            </div>
          ) : null}
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage(draft);
            }}
          >
            <input
              aria-label="Ask Harwick about this listing"
              className="h-11 min-w-0 flex-1 rounded-[14px] border border-white/10 bg-white/[0.04] px-4 text-[16px] text-white outline-none placeholder:text-white/30 focus:border-[#88a276]/50 focus:bg-white/[0.06] sm:text-[14px]"
              onChange={(event) => setDraft(event.target.value)}
              placeholder="ask about schools, payment, availability..."
              value={draft}
            />
            <button
              aria-label="send message to Harwick"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#88a276] text-[#07100a] shadow-[0_8px_18px_rgba(136,162,118,0.28)] transition hover:bg-[#94ad81] disabled:opacity-50"
              disabled={pending || draft.trim().length === 0}
              type="submit"
            >
              <Send aria-hidden="true" className="h-4 w-4" />
            </button>
          </form>
          <button
            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-[12px] border border-white/10 bg-white/[0.02] px-4 py-2.5 text-[12.5px] font-medium lowercase text-white/72 transition hover:border-white/22 hover:bg-white/[0.05] hover:text-white"
            onClick={() => {
              void sendMessage("Can I see it this weekend? What times are open?");
            }}
            type="button"
          >
            <Calendar aria-hidden="true" className="h-3.5 w-3.5 text-[var(--sage)]" />
            guide me to a showing
          </button>
        </div>
    </section>
  );
}

function HarwickListingChatDialog(props: {
  listing: PublicListingCardData;
  onClose: () => void;
  workspaceSlug: string;
  workspaceName: string;
}) {
  const { listing, onClose, workspaceName, workspaceSlug } = props;

  return (
    <div
      aria-labelledby="public-listing-chat-title"
      aria-modal="true"
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[rgba(8,12,8,0.62)] p-0 backdrop-blur-[18px] backdrop-saturate-125 sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
    >
      <div
        className="w-full max-w-[560px] overflow-hidden rounded-t-[32px] sm:rounded-[28px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative mt-2.5 flex justify-center sm:hidden">
          <div className="h-[5px] w-[44px] rounded-full bg-white/22" aria-hidden="true" />
        </div>
        <HarwickListingChatPanel
          listing={listing}
          onClose={onClose}
          workspaceSlug={workspaceSlug}
          workspaceName={workspaceName}
        />
      </div>
    </div>
  );
}

function ListingViewerSection(props: {
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-6 py-5">
      <div className="text-[10px] font-bold uppercase leading-none tracking-[0.18em] text-white/40">
        {props.eyebrow}
      </div>
      <div className="mt-3">{props.children}</div>
    </div>
  );
}

function ListingViewerStat(props: {
  icon: typeof BedDouble;
  value: string;
  label: string;
}) {
  const Icon = props.icon;
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-white/8 bg-white/[0.03]">
        <Icon aria-hidden="true" className="h-4 w-4 text-white/72" strokeWidth={1.7} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-semibold text-white">{props.value}</div>
        <div className="truncate text-[11px] uppercase tracking-[0.08em] text-white/40">{props.label}</div>
      </div>
    </div>
  );
}

function ListingViewerFactRow(props: {
  icon: typeof BedDouble;
  label: string;
  value: string;
}) {
  const Icon = props.icon;
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/6 py-3 last:border-b-0">
      <div className="flex min-w-0 items-center gap-2.5 text-[12.5px] text-white/52">
        <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" strokeWidth={1.7} />
        <span className="truncate">{props.label}</span>
      </div>
      <div className="shrink-0 text-right text-[13px] font-semibold text-white/88">{props.value}</div>
    </div>
  );
}

function ListingViewerMonthly(props: { listing: PublicListingCardData }) {
  const downPayment = Math.round(props.listing.priceValue * 0.2);
  const loanAmount = props.listing.priceValue - downPayment;
  const monthlyPrincipal = Math.round((loanAmount * 0.0675) / 12);
  const monthlyTaxes = Math.round((props.listing.priceValue * (props.listing.annualTaxRate / 100)) / 12);
  const monthlyInsurance = Math.round(props.listing.priceValue * 0.00035);
  const monthlyEstimate = monthlyPrincipal + monthlyTaxes + monthlyInsurance + props.listing.monthlyHoa;
  return (
    <div className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.12em] text-white/40">est. monthly</div>
          <div className="mt-1 font-display text-[28px] font-medium leading-none tracking-[-0.02em] text-white">
            {formatMoney(monthlyEstimate)}
          </div>
        </div>
        <div className="text-right text-[11px] leading-4 text-white/40">
          20% down<br />6.75% rate
        </div>
      </div>
      <div className="mt-3 space-y-1.5 text-[11.5px]">
        {[
          ["principal & interest", formatMoney(monthlyPrincipal) + "/mo"],
          ["taxes", formatMoney(monthlyTaxes) + "/mo"],
          ["insurance", formatMoney(monthlyInsurance) + "/mo"],
          ["hoa", formatMoney(props.listing.monthlyHoa) + "/mo"],
        ].map(([label, value]) => (
          <div className="flex items-center justify-between gap-3 text-white/52" key={label}>
            <span>{label}</span>
            <span className="tabular-nums text-white/76">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Content shared between the mobile bottom-drawer shell and the desktop
 * centered-modal shell. Both render exactly the same body (drag handle is
 * the only mobile-only piece).
 */
function ListingViewerBody(props: {
  listing: PublicListingCardData;
  layout: "drawer" | "modal";
  onChat: (listing: PublicListingCardData) => void;
  onInquire: (intent: InquiryIntent, listing: PublicListingCardData) => void;
  titleAs: React.ElementType;
  closeAs: React.ElementType;
}) {
  const { listing, layout, onChat, onInquire } = props;
  const Title = props.titleAs;
  const Close = props.closeAs;
  return (
    <>
      {layout === "drawer" ? (
        <div className="relative mt-2.5 flex justify-center">
          <div className="h-[5px] w-[44px] rounded-full bg-white/22" aria-hidden="true" />
        </div>
      ) : null}

      <div className="relative flex items-start justify-between gap-3 px-6 pb-4 pt-3.5">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase leading-none tracking-[0.18em] text-white/46">
            {listing.badgeTone === "new" ? "new this week" : listing.badgeTone === "reduced" ? "price reduced" : "active listing"}
            {" · "}
            {listing.updated}
          </div>
          <Title className="mt-2 font-display text-[26px] font-medium lowercase leading-[1.05] tracking-[-0.02em] text-white">
            {listing.shortAddress}
          </Title>
          <div className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-white/56">
            <MapPin aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.7} />
            <span className="truncate">{listing.address}</span>
          </div>
        </div>
        <Close
          className="-mr-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] text-white/70 transition hover:border-white/22 hover:text-white"
          aria-label="close"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </Close>
      </div>

      <div className={cn("relative min-h-0 flex-1 overflow-y-auto pb-[120px]", SCROLL_HIDE)}>
        <ListingMediaGallery media={listingMediaFor(listing)} listingLabel={listing.shortAddress} />
        <div className="mt-3 flex items-center justify-end px-4">
          <span className="font-display text-[26px] font-semibold leading-none tracking-[-0.01em] text-white">
            {listing.price}
          </span>
        </div>

        <div className="mt-1 grid grid-cols-2 gap-x-4 px-6 sm:grid-cols-4">
          <ListingViewerStat icon={BedDouble} value={listing.beds} label="beds" />
          <ListingViewerStat icon={Bath} value={listing.baths} label="baths" />
          <ListingViewerStat icon={Ruler} value={listing.area} label="size" />
          <ListingViewerStat icon={Building2} value={listing.type} label="type" />
        </div>

        <div className="mx-6 h-px bg-white/6" />

        <ListingViewerSection eyebrow="the place">
          <p className="text-[14px] leading-7 text-white/72">{listing.description}</p>
        </ListingViewerSection>

        <div className="mx-6 h-px bg-white/6" />

        <ListingViewerSection eyebrow="facts">
          <ListingViewerFactRow icon={Building2} label="mls" value={listing.mls} />
          <ListingViewerFactRow icon={Calendar} label="built" value={listing.yearBuilt} />
          <ListingViewerFactRow icon={Ruler} label="lot" value={listing.lot} />
          <ListingViewerFactRow icon={User} label="listing agent" value={listing.agent} />
        </ListingViewerSection>

        {listing.features.length === 0 ? null : (
          <>
            <div className="mx-6 h-px bg-white/6" />
            <ListingViewerSection eyebrow="features">
              <div className="flex flex-wrap gap-1.5">
                {listing.features.map((feature) => (
                  <span
                    key={feature}
                    className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11.5px] font-medium text-white/72"
                  >
                    {feature}
                  </span>
                ))}
              </div>
            </ListingViewerSection>
          </>
        )}

        <div className="mx-6 h-px bg-white/6" />

        <ListingViewerSection eyebrow="monthly">
          <ListingViewerMonthly listing={listing} />
        </ListingViewerSection>

        {listing.openHouse.trim().length === 0 ? null : (
          <>
            <div className="mx-6 h-px bg-white/6" />
            <ListingViewerSection eyebrow="open house">
              <button
                onClick={() => onInquire("open_house", listing)}
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition hover:border-white/18 hover:bg-white/[0.05]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.04]">
                    <Calendar aria-hidden="true" className="h-4 w-4 text-[var(--sage)]" strokeWidth={1.7} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-white">{listing.openHouse}</div>
                    <div className="text-[11.5px] text-white/52">tap to register</div>
                  </div>
                </div>
                <ArrowUpRight aria-hidden="true" className="h-4 w-4 text-white/40" />
              </button>
            </ListingViewerSection>
          </>
        )}
      </div>

      {/* Sticky bottom action bar — single primary sage CTA, single secondary ghost */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10">
        <div aria-hidden className="h-12 bg-gradient-to-t from-[#0c130e] via-[#0c130e]/85 to-transparent" />
        <div className="pointer-events-auto border-t border-white/8 bg-[#0c130e]/95 px-5 py-3.5 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => onChat(listing)}
              type="button"
              className="flex flex-1 items-center justify-center gap-2 rounded-[14px] bg-[#88a276] px-4 py-3 text-[13.5px] font-semibold lowercase text-[#07100a] shadow-[0_10px_22px_rgba(136,162,118,0.30)] transition hover:bg-[#94ad81]"
            >
              <MessageSquare aria-hidden="true" className="h-4 w-4" />
              ask harwick
            </button>
            <button
              onClick={() => onInquire("showing", listing)}
              type="button"
              className="rounded-[14px] border border-white/12 bg-white/[0.04] px-4 py-3 text-[13px] font-semibold lowercase text-white/82 transition hover:border-white/22 hover:bg-white/[0.06]"
            >
              request showing
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function ListingViewer(props: {
  listing: PublicListingCardData | null;
  onClose: () => void;
  onChat: (listing: PublicListingCardData) => void;
  onInquire: (intent: InquiryIntent, listing: PublicListingCardData) => void;
}) {
  const { listing, onChat, onClose, onInquire } = props;
  const isDesktop = useIsDesktop();

  // Close on Escape for the desktop modal path (Drawer.Root handles its own).
  useEffect(() => {
    if (!isDesktop || listing === null) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isDesktop, listing, onClose]);

  // Desktop: centered modal. The shape (max-w-[760px], #0c130e, hairline,
  // radial overlay, sticky footer) is identical to the mobile drawer —
  // only the wrapper changes.
  if (isDesktop) {
    if (listing === null) return null;
    return (
      <div
        aria-modal="true"
        className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(8,12,8,0.62)] p-6 backdrop-blur-[18px] backdrop-saturate-125"
        onClick={onClose}
        role="dialog"
      >
        <div
          className="relative flex h-[min(94vh,900px)] w-full max-w-[760px] flex-col overflow-hidden rounded-[28px] border border-white/8 bg-[#0c130e] text-white shadow-[0_42px_120px_-12px_rgba(0,0,0,0.65)] outline-none"
          onClick={(event) => event.stopPropagation()}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[28px]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 86% 4%, rgba(136,162,118,0.22), transparent 40%), linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0) 22%)",
            }}
          />
          <ListingViewerBody
            closeAs={(closeProps: React.ComponentProps<"button">) => (
              <button {...closeProps} onClick={onClose} type="button" />
            )}
            layout="modal"
            listing={listing}
            onChat={onChat}
            onInquire={onInquire}
            titleAs="h2"
          />
        </div>
      </div>
    );
  }

  // Mobile: vaul bottom drawer.
  return (
    <Drawer.Root
      noBodyStyles
      open={listing !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-[rgba(8,12,8,0.62)] backdrop-blur-[18px] backdrop-saturate-125" />
        <Drawer.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex h-[94vh] max-w-[760px] flex-col overflow-hidden rounded-t-[32px] border border-b-0 border-white/8 bg-[#0c130e] text-white shadow-[0_-32px_80px_-12px_rgba(6,12,8,0.55)] outline-none"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-t-[32px]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 86% 4%, rgba(136,162,118,0.22), transparent 40%), linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0) 22%)",
            }}
          />
          {listing === null ? null : (
            <ListingViewerBody
              closeAs={Drawer.Close}
              layout="drawer"
              listing={listing}
              onChat={onChat}
              onInquire={onInquire}
              titleAs={Drawer.Title}
            />
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export function PublicListingDetailPage(props: {
  listing: PublicListingCardData;
  workspaceSlug: string;
}) {
  usePublicListingDarkBrowserChrome();
  const workspaceName = formatWorkspaceName(props.workspaceSlug);
  const { listing } = props;
  const siblingUrl = `/${props.workspaceSlug}/listings`;

  return (
    <main className="min-h-[100dvh] bg-[#0a0f0c] text-white [color-scheme:dark]" data-public-listings-shell="true">
      <div aria-hidden="true" data-public-status-tint="true" />
      <header className="sticky top-0 z-40 border-b border-white/8 bg-[#0a0f0c]/88 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-4">
          <a
            className="inline-flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 text-[13px] font-medium lowercase text-white/72 transition hover:border-white/22 hover:bg-white/[0.06] hover:text-white"
            href={siblingUrl}
          >
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            all listings
          </a>
          <div className="ml-auto text-right">
            <div className="text-[13px] font-semibold text-white">{workspaceName}</div>
            <div className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-white/36">powered by harwick</div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1320px] gap-8 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_430px] lg:items-start lg:py-8 xl:grid-cols-[minmax(0,1fr)_480px]">
        <section className="min-w-0">
          <div className="rounded-[30px] border border-white/8 bg-white/[0.025] pb-6 shadow-[0_34px_90px_-34px_rgba(0,0,0,0.8)]">
            <div className="px-5 pb-4 pt-5 sm:px-6">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#b5c9a8]/72">
                live listing · updated {listing.updated}
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <div className="min-w-0">
                  <h1 className="font-display text-[34px] font-medium lowercase leading-[0.98] tracking-[-0.02em] text-white sm:text-[46px]">
                    {listing.shortAddress}
                  </h1>
                  <div className="mt-3 flex items-center gap-1.5 text-[14px] text-white/58">
                    <MapPin aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={1.7} />
                    <span className="truncate">{listing.address}</span>
                  </div>
                </div>
                <div className="font-display text-[34px] font-semibold leading-none tracking-[-0.01em] text-white sm:text-[40px]">
                  {listing.price}
                </div>
              </div>
            </div>

            <ListingMediaGallery media={listingMediaFor(listing)} listingLabel={listing.shortAddress} />

            <div className="mt-4 grid grid-cols-2 gap-x-4 px-6 sm:grid-cols-4">
              <ListingViewerStat icon={BedDouble} value={listing.beds} label="beds" />
              <ListingViewerStat icon={Bath} value={listing.baths} label="baths" />
              <ListingViewerStat icon={Ruler} value={listing.area} label="size" />
              <ListingViewerStat icon={Building2} value={listing.type} label="type" />
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <section className="rounded-[24px] border border-white/8 bg-white/[0.025] p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/38">what harwick knows</div>
              <p className="mt-3 text-[14px] leading-7 text-white/70">{listing.description}</p>
              <div className="mt-5 flex flex-wrap gap-1.5">
                {listing.features.map((feature) => (
                  <span
                    key={feature}
                    className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11.5px] font-medium lowercase text-white/72"
                  >
                    {feature}
                  </span>
                ))}
              </div>
            </section>

            <section className="rounded-[24px] border border-white/8 bg-white/[0.025] p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/38">showing context</div>
              <div className="mt-4 space-y-3">
                <ListingViewerFactRow icon={Building2} label="mls" value={listing.mls} />
                <ListingViewerFactRow icon={Calendar} label="open house" value={listing.openHouse} />
                <ListingViewerFactRow icon={User} label="listing agent" value={listing.agent} />
              </div>
            </section>
          </div>

          <div className="mt-6 rounded-[24px] border border-white/8 bg-white/[0.025] p-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/38">monthly picture</div>
            <div className="mt-4">
              <ListingViewerMonthly listing={listing} />
            </div>
          </div>
        </section>

        <aside className="min-w-0 lg:sticky lg:top-24">
          <HarwickListingChatPanel
            listing={listing}
            workspaceSlug={props.workspaceSlug}
            workspaceName={workspaceName}
          />
        </aside>
      </div>
    </main>
  );
}

// The duplicate old inline body that used to live here has moved into
// ListingViewerBody above. Keeping this comment as a navigation aid.
export function PublicListingsPage(props: { listings?: PublicListingCardData[]; workspaceSlug: string }) {
  usePublicListingDarkBrowserChrome();
  const workspaceName = formatWorkspaceName(props.workspaceSlug);
  const listings = props.listings ?? [];
  const hasListings = listings.length > 0;
  const [selectedListingSlug, setSelectedListingSlug] = useState<string | null>(null);
  const [inquiryState, setInquiryState] = useState<{ intent: InquiryIntent; listing: PublicListingCardData | null } | null>(null);
  const [chatListing, setChatListing] = useState<PublicListingCardData | null>(null);
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
  const featuredListing = listings[0] ?? null;
  const openInquiry = (intent: InquiryIntent, listing: PublicListingCardData | null = selectedListing) => {
    setInquiryState({ intent, listing });
  };
  const openListingPage = (listing: PublicListingCardData) => {
    window.location.assign(`/${props.workspaceSlug}/listings/${listing.slug}`);
  };
  const toggleFavorite = (listing: PublicListingCardData) => {
    setFavoriteSlugs((currentFavorites) => currentFavorites.includes(listing.slug)
      ? currentFavorites.filter((slug) => slug !== listing.slug)
      : [...currentFavorites, listing.slug]);
  };

  return (
    <main className="min-h-[100dvh] bg-[#0a0f0c] text-white [color-scheme:dark]" data-public-listings-shell="true">
      <div aria-hidden="true" data-public-status-tint="true" />
      <header className="sticky top-0 z-40 border-b border-white/8 bg-[#0a0f0c]/88 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-4">
          <a className="flex items-center gap-3" href={`/${props.workspaceSlug}/listings`}>
            <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#88a276] font-display text-[17px] text-[#07100a] shadow-[0_10px_24px_rgba(136,162,118,0.20)]">
              {workspaceName.charAt(0)}
            </span>
            <span>
              <span className="block text-[15px] font-semibold leading-none text-white">{workspaceName}</span>
              <span className="mt-1 block text-[9px] font-semibold uppercase tracking-[0.14em] text-white/40">
                by harwick
              </span>
            </span>
          </a>
          <nav className="ml-auto hidden items-center gap-1 text-[13px] font-medium text-white/56 md:flex">
            <a className="rounded-lg px-3.5 py-2 text-white transition hover:bg-white/[0.06]" href="#listings">listings</a>
            <a className="rounded-lg px-3.5 py-2 transition hover:bg-white/[0.06] hover:text-white" href="#contact">inquire</a>
          </nav>
          {pageCopy.phone === null ? null : (
            <a
              className="ml-auto hidden h-9 items-center gap-2 rounded-lg border border-white/12 bg-white/[0.04] px-3.5 text-[13px] font-medium text-white/82 transition hover:border-white/22 hover:bg-white/[0.06] md:flex"
              href={`tel:${pageCopy.phone.replace(/[^+\d]/g, "")}`}
            >
              <Phone aria-hidden="true" className="h-4 w-4 text-[var(--sage)]" />
              {pageCopy.phone}
            </a>
          )}
          <button
            className="ml-auto inline-flex min-w-[108px] items-center justify-center rounded-lg bg-[#88a276] px-4 py-2.5 text-center text-[13px] font-semibold lowercase text-[#07100a] shadow-[0_10px_22px_rgba(136,162,118,0.30)] transition hover:bg-[#94ad81] md:ml-0"
            onClick={() => {
              if (featuredListing === null) {
                openInquiry("general", null);
                return;
              }
              setChatListing(featuredListing);
            }}
            type="button"
          >
            ask harwick
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-[1320px] px-5 pb-8 pt-5 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(440px,1fr)] lg:items-end">
          <div className="py-5 sm:py-6">
            <h1 className="max-w-[760px] font-display text-[48px] font-medium lowercase leading-[0.95] text-white sm:text-[58px] md:text-[78px]">
              {pageCopy.headline}
            </h1>
            <p className="mt-4 max-w-[620px] text-[15px] leading-6 text-white/56 sm:text-[18px] sm:leading-7">
              {pageCopy.subheadline}
            </p>
            <div className="mt-6 flex h-12 max-w-[780px] items-center gap-1.5 rounded-[18px] border border-white/10 bg-white/[0.03] p-1.5 shadow-[0_24px_70px_rgba(6,12,8,0.40)] backdrop-blur-md sm:h-auto sm:gap-3 sm:rounded-[24px] sm:p-2">
              <div className="flex min-w-0 flex-1 items-center gap-2 px-2 sm:gap-3 sm:px-4">
                <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-white/40 sm:h-5 sm:w-5" />
                <input
                  aria-label="search listings"
                  className="h-9 min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/30 sm:h-11 sm:text-[14px]"
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="search homes"
                  value={searchQuery}
                />
              </div>
              <button aria-label="filter listings" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] border border-white/12 bg-white/[0.04] text-white/82 transition hover:border-white/22 hover:bg-white/[0.06] sm:h-11 sm:w-auto sm:gap-2 sm:rounded-2xl sm:px-4 sm:text-[13px] sm:font-medium" type="button">
                <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
                <span className="hidden sm:inline">filters</span>
              </button>
              <button className="hidden h-11 rounded-2xl bg-[#88a276] px-6 text-[13px] font-semibold lowercase text-[#07100a] shadow-[0_10px_22px_rgba(136,162,118,0.30)] transition hover:bg-[#94ad81] sm:block" type="button">
                search
              </button>
            </div>
          </div>

          {featuredListing === null ? (
            <div className="flex min-h-[520px] items-center justify-center rounded-[34px] border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
              <div>
                <Building2 aria-hidden="true" className="mx-auto h-8 w-8 text-white/30" strokeWidth={1.6} />
                <div className="mt-4 font-display text-[30px] font-medium lowercase text-white">no public listings yet.</div>
                <p className="mx-auto mt-3 max-w-[360px] text-[14px] leading-6 text-white/56">
                  Verified workspace listings will appear here as soon as the team publishes inventory.
                </p>
              </div>
            </div>
          ) : (
            <ListingCard
              isFavorite={favoriteSlugs.includes(featuredListing.slug)}
              listing={featuredListing}
              onOpen={openListingPage}
              onToggleFavorite={toggleFavorite}
              priority
            />
          )}
        </div>
      </section>

      <section className="mx-auto max-w-[1320px] px-6 pb-16" id="listings">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-5">
          <div>
            <h2 className="font-display text-[31px] font-medium lowercase leading-none text-white">{pageCopy.activeListingsLabel}</h2>
            <p className="mt-2 text-[14px] text-white/56">
              showing {visibleListings.length} {visibleListings.length === 1 ? "listing" : "listings"} from {workspaceName}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {filters.map((filter) => (
              <button
                className={cn(
                  "rounded-full border px-3.5 py-2 text-[12px] font-medium lowercase transition",
                  activeFilter === filter.key
                    ? "border-[#88a276]/40 bg-[#88a276]/15 text-white"
                    : "border-white/10 bg-white/[0.03] text-white/56 hover:border-white/22 hover:bg-white/[0.06] hover:text-white",
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
              onOpen={openListingPage}
              onToggleFavorite={toggleFavorite}
            />
          ))}
        </div>
        {visibleListings.length === 0 ? (
          <div className="mt-6 rounded-[30px] border border-white/10 bg-white/[0.03] p-8 text-center">
            <div className="font-display text-[26px] font-medium lowercase text-white">no matching listings</div>
            <p className="mt-2 text-[13px] text-white/56">Clear the search or choose a different filter.</p>
            <button
              className="mt-5 rounded-full bg-[#88a276] px-5 py-3 text-[12px] font-semibold lowercase text-[#07100a] shadow-[0_10px_22px_rgba(136,162,118,0.30)]"
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
          className="mt-8 grid gap-4 rounded-[30px] border border-white/10 bg-white/[0.03] p-5 shadow-[0_22px_70px_rgba(6,12,8,0.40)] md:grid-cols-[1fr_auto_auto]"
          id="contact"
        >
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#88a276]/20 text-[var(--sage)]">
              <MessageSquare aria-hidden="true" className="h-5 w-5" />
            </span>
            <div>
              <div className="text-[16px] font-semibold lowercase text-white">questions about a listing?</div>
              <div className="mt-1 text-[13px] text-white/56">Ask Harwick for details, showing times, similar homes, or current availability from {workspaceName}.</div>
            </div>
          </div>
          {pageCopy.phone === null ? null : (
            <a className="flex items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/[0.04] px-5 py-3 text-[13px] font-semibold lowercase text-white/82 transition hover:border-white/22 hover:bg-white/[0.06]" href={`tel:${pageCopy.phone.replace(/[^+\d]/g, "")}`}>
              <Phone aria-hidden="true" className="h-4 w-4" />
              call or text
            </a>
          )}
          <button
            className="flex items-center justify-center gap-2 rounded-2xl bg-[#88a276] px-5 py-3 text-[13px] font-semibold lowercase text-[#07100a] shadow-[0_10px_22px_rgba(136,162,118,0.30)] transition hover:bg-[#94ad81]"
            onClick={() => {
              if (featuredListing === null) {
                openInquiry("general", null);
                return;
              }
              setChatListing(featuredListing);
            }}
            type="button"
          >
            <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
            ask harwick
          </button>
        </div>
      </section>

      <footer className="border-t border-white/8 bg-[#070b08] px-6 py-10 text-white">
        <div className="mx-auto max-w-[1320px]">
          <div className="flex flex-col justify-between gap-8 border-b border-white/10 pb-8 md:flex-row">
            <div>
              <div className="font-display text-[24px] font-medium">{workspaceName}</div>
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/32">by Harwick</div>
              <p className="mt-4 max-w-[320px] text-[13px] leading-6 text-white/52">
                Live listing support for buyers who need availability, showing windows, and a fast route to the right agent.
              </p>
            </div>
            {pageCopy.phone === null ? null : (
              <div>
                <div className="text-[12px] text-white/48">reach the team</div>
                <a className="mt-1 block font-display text-[24px] text-white transition hover:text-harwick-brass" href={`tel:${pageCopy.phone.replace(/[^+\d]/g, "")}`}>
                  {pageCopy.phone}
                </a>
              </div>
            )}
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
        onChat={(listing) => setChatListing(listing)}
        onClose={() => setSelectedListingSlug(null)}
        onInquire={(intent, listing) => openInquiry(intent, listing)}
      />
      {chatListing === null ? null : (
        <HarwickListingChatDialog
          listing={chatListing}
          onClose={() => setChatListing(null)}
          workspaceSlug={props.workspaceSlug}
          workspaceName={workspaceName}
        />
      )}
      {inquiryState === null ? null : (
        <InquiryDialog
          canSubmitListingScopedInquiries={hasListings}
          intent={inquiryState.intent}
          listing={inquiryState.listing}
          onClose={() => setInquiryState(null)}
          workspaceSlug={props.workspaceSlug}
          workspaceName={workspaceName}
        />
      )}
    </main>
  );
}
