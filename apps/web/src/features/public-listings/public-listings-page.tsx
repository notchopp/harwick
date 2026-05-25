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
import { type FormEvent, useEffect, useMemo, useState } from "react";

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
  headline: "listings ready to send.",
  subheadline: "A live inventory surface for buyers who want the right listing link, current availability, and a fast answer from Harwick.",
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

function CostCalculator(props: { listing: PublicListingCardData }) {
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
            void handleSubmit(event);
          }}
        >
          <label className="block text-[12px] font-semibold text-foreground" htmlFor="inquiry-name">
            name
            <span className="mt-2 flex items-center gap-2 rounded-2xl border border-border bg-surface px-3 py-2.5 focus-within:border-border-strong focus-within:ring-2 focus-within:ring-harwick-brass/20">
              <User aria-hidden="true" className="h-4 w-4 text-muted-subtle" />
              <input
                className="min-w-0 flex-1 bg-transparent text-[14px] font-normal outline-none placeholder:text-muted-subtle"
                id="inquiry-name"
                name="fullName"
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
                  placeholder="Phone number"
                  required
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
                  required
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

          {intent === "showing" || intent === "open_house" ? (
            <label className="block text-[12px] font-semibold text-foreground" htmlFor="inquiry-preferred-start">
              {intent === "open_house" ? "preferred arrival time" : "preferred showing time"}
              <span className="mt-2 flex items-center gap-2 rounded-2xl border border-border bg-surface px-3 py-2.5 focus-within:border-border-strong focus-within:ring-2 focus-within:ring-harwick-brass/20">
                <Calendar aria-hidden="true" className="h-4 w-4 text-muted-subtle" />
                <input
                  className="min-w-0 flex-1 bg-transparent text-[14px] font-normal outline-none placeholder:text-muted-subtle"
                  id="inquiry-preferred-start"
                  name="preferredStart"
                  type="datetime-local"
                />
              </span>
            </label>
          ) : null}

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <button
              className="rounded-2xl border border-border bg-surface px-4 py-2.5 text-[13px] font-semibold text-muted transition hover:border-border-strong hover:text-foreground"
              onClick={onClose}
              type="button"
            >
              cancel
            </button>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-harwick-ink px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-harwick-ink-soft disabled:cursor-not-allowed disabled:opacity-60"
              disabled={submitState === "submitting" || submitState === "sent"}
              type="submit"
            >
              <Send aria-hidden="true" className="h-4 w-4" />
              {submitState === "submitting" ? "sending" : submitState === "sent" ? "sent" : "send to Harwick"}
            </button>
          </div>

          {submitState === "sent" ? (
            <div className="rounded-2xl border border-sage/25 bg-sage/10 px-4 py-3 text-[12px] font-medium text-foreground">
              Harwick saved the request and routed it into the workspace.
            </div>
          ) : null}
          {submitState === "failed" && submitError !== null ? (
            <div className="rounded-2xl border border-oxblood/20 bg-oxblood/10 px-4 py-3 text-[12px] font-medium text-foreground">
              {submitError}
            </div>
          ) : null}

          <div className="flex items-center justify-center gap-2 border-t border-border pt-4 text-[11px] text-muted-subtle">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-harwick-ink font-display text-[11px] text-harwick-brass">H</span>
            powered by Harwick - responses in minutes
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

function HarwickListingChatDialog(props: {
  listing: PublicListingCardData;
  onClose: () => void;
  onRequestShowing: () => void;
  workspaceSlug: string;
  workspaceName: string;
}) {
  const { listing, onClose, onRequestShowing, workspaceName, workspaceSlug } = props;
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "harwick-open",
      actor: "harwick_ai",
      body: `I'm Harwick for ${workspaceName}. Ask me about ${listing.shortAddress}, availability, financing, schools, commute, or showing times.`,
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
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
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
    "Is this still available?",
    "How are the schools?",
    "What would payment look like?",
    "Can I see it this weekend?",
  ];

  return (
    <div
      aria-labelledby="public-listing-chat-title"
      aria-modal="true"
      className="fixed inset-0 z-[70] flex items-end justify-center bg-harwick-ink/58 p-0 backdrop-blur-md sm:items-center sm:p-4"
      role="dialog"
    >
      <div className="flex max-h-[92vh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-[30px] border border-white/16 bg-[#111913] text-white shadow-[0_36px_140px_rgba(8,15,10,0.48)] sm:rounded-[30px]">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-white/[0.035] px-5 py-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/42">ask harwick</div>
            <h2 className="mt-1 text-[22px] font-semibold leading-none" id="public-listing-chat-title">
              {listing.shortAddress}
            </h2>
            <p className="mt-2 text-[12px] leading-5 text-white/52">
              Harwick answers from listing facts and qualifies the next step without making you start with paperwork.
            </p>
          </div>
          <button
            aria-label="close Harwick chat"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] text-white/64 transition hover:border-white/24 hover:text-white"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-5">
          {messages.map((message) => (
            <div
              className={cn(
                "max-w-[86%] rounded-[22px] px-4 py-3 text-[13px] leading-6",
                message.actor === "lead"
                  ? "ml-auto bg-white text-harwick-ink"
                  : "border border-white/10 bg-white/[0.055] text-white/82",
              )}
              key={message.id}
            >
              {message.body}
            </div>
          ))}
          {pending ? (
            <div className="inline-flex rounded-[22px] border border-white/10 bg-white/[0.055] px-4 py-3 text-[13px] text-white/56">
              Harwick is checking the listing context...
            </div>
          ) : null}
          {error === null ? null : (
            <div className="rounded-[18px] border border-oxblood/30 bg-oxblood/15 px-4 py-3 text-[12px] text-white/78">
              {error}
            </div>
          )}
        </div>

        <div className="border-t border-white/10 bg-[#0c120e] px-5 py-4">
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {prompts.map((prompt) => (
              <button
                className="shrink-0 rounded-full border border-white/12 bg-white/[0.045] px-3 py-2 text-[12px] text-white/72 transition hover:border-white/24 hover:text-white"
                disabled={pending}
                key={prompt}
                onClick={() => {
                  void sendMessage(prompt);
                }}
                type="button"
              >
                {prompt}
              </button>
            ))}
          </div>
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage(draft);
            }}
          >
            <input
              aria-label="Ask Harwick about this listing"
              className="h-12 min-w-0 flex-1 rounded-2xl border border-white/12 bg-white/[0.055] px-4 text-[14px] outline-none placeholder:text-white/32 focus:border-harwick-brass/45"
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask about schools, payment, availability..."
              value={draft}
            />
            <button
              aria-label="send message to Harwick"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-harwick-ink transition hover:bg-harwick-brass-soft disabled:opacity-50"
              disabled={pending || draft.trim().length === 0}
              type="submit"
            >
              <Send aria-hidden="true" className="h-4 w-4" />
            </button>
          </form>
          <button
            className="mt-3 w-full rounded-2xl border border-sage/25 bg-sage/12 px-4 py-3 text-[13px] font-semibold text-white transition hover:border-sage/40 hover:bg-sage/18"
            onClick={onRequestShowing}
            type="button"
          >
            request a showing with this context
          </button>
        </div>
      </div>
    </div>
  );
}

function ListingViewer(props: {
  listing: PublicListingCardData | null;
  onClose: () => void;
  onChat: (listing: PublicListingCardData) => void;
  onInquire: (intent: InquiryIntent, listing: PublicListingCardData) => void;
}) {
  const { listing, onChat, onClose, onInquire } = props;

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
              <button className="rounded-full bg-harwick-ink px-3.5 py-2 text-[12px] font-semibold text-white transition hover:bg-harwick-ink-soft" onClick={() => onChat(listing)} type="button">
                ask harwick
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
                  <ListingImage alt={`${listing.shortAddress} main view`} className="h-full min-h-[460px] w-full object-cover" src={listing.photos[0] ?? listing.imageUrl} />
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
                  <button className="w-full rounded-2xl bg-harwick-ink px-4 py-3 text-[13px] font-semibold text-white transition hover:bg-harwick-ink-soft" onClick={() => onChat(listing)} type="button">
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
                <button className="mt-4 w-full rounded-2xl border border-border px-4 py-3 text-[13px] font-semibold transition hover:border-border-strong hover:bg-surface-muted" onClick={() => onInquire("open_house", listing)} type="button">
                  register
                </button>
              </div>

              <CostCalculator listing={listing} />
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PublicListingsPage(props: { listings?: PublicListingCardData[]; workspaceSlug: string }) {
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
  const toggleFavorite = (listing: PublicListingCardData) => {
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
          {pageCopy.phone === null ? null : (
            <a
              className="ml-auto hidden h-9 items-center gap-2 rounded-lg border border-border bg-surface/80 px-3.5 text-[13px] font-medium shadow-sm transition hover:border-border-strong md:flex"
              href={`tel:${pageCopy.phone.replace(/[^+\d]/g, "")}`}
            >
              <Phone aria-hidden="true" className="h-4 w-4 text-qualified" />
              {pageCopy.phone}
            </a>
          )}
          <button
            className="inline-flex min-w-[108px] items-center justify-center rounded-lg bg-harwick-ink px-4 py-2.5 text-center text-[13px] font-semibold text-white shadow-[0_14px_34px_rgba(26,42,32,0.18)] transition hover:bg-harwick-ink-soft"
            onClick={() => {
              if (featuredListing === null) {
                openInquiry("general", null);
                return;
              }
              setChatListing(featuredListing);
            }}
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

          {featuredListing === null ? (
            <div className="flex min-h-[520px] items-center justify-center rounded-[34px] border border-dashed border-border bg-surface/70 p-8 text-center shadow-[0_24px_70px_rgba(24,30,24,0.08)]">
              <div>
                <Building2 aria-hidden="true" className="mx-auto h-8 w-8 text-muted-subtle" strokeWidth={1.6} />
                <div className="mt-4 font-display text-[30px] font-medium text-harwick-ink">No public listings yet.</div>
                <p className="mx-auto mt-3 max-w-[360px] text-[14px] leading-6 text-muted">
                  Verified workspace listings will appear here as soon as the team publishes inventory.
                </p>
              </div>
            </div>
          ) : (
            <ListingCard
              isFavorite={favoriteSlugs.includes(featuredListing.slug)}
              listing={featuredListing}
              onOpen={(listing) => setSelectedListingSlug(listing.slug)}
              onToggleFavorite={toggleFavorite}
              priority
            />
          )}
        </div>
      </section>

      <section className="mx-auto max-w-[1320px] px-6 pb-16" id="listings">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-5">
          <div>
            <h2 className="font-display text-[31px] font-medium leading-none">{pageCopy.activeListingsLabel}</h2>
            <p className="mt-2 text-[14px] text-muted">
              showing {visibleListings.length} {visibleListings.length === 1 ? "listing" : "listings"} from {workspaceName}.
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
          {pageCopy.phone === null ? null : (
            <a className="flex items-center justify-center gap-2 rounded-2xl border border-border px-5 py-3 text-[13px] font-semibold transition hover:border-border-strong hover:bg-surface-muted" href={`tel:${pageCopy.phone.replace(/[^+\d]/g, "")}`}>
              <Phone aria-hidden="true" className="h-4 w-4" />
              call or text
            </a>
          )}
          <button
            className="flex items-center justify-center gap-2 rounded-2xl bg-harwick-ink px-5 py-3 text-[13px] font-semibold text-white transition hover:bg-harwick-ink-soft"
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
          onRequestShowing={() => {
            setInquiryState({ intent: "showing", listing: chatListing });
            setChatListing(null);
          }}
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
