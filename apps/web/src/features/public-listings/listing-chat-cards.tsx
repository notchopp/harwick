"use client";

/**
 * Inline tool-result cards rendered in the public listing chat stream.
 *
 * The route's tools (`surface_listing`, `surface_team_member`, etc.) emit
 * payloads with a `kind` discriminator. `<ToolResultCard>` switches on
 * that kind and renders the right card. Lookup tools (note_qualification,
 * search_workspace_listings, etc.) are silent — they don't render here.
 */

import { BedDouble, Bath, BadgeDollarSign, Calendar, CheckCircle2, Clock, MapPin, Phone, User } from "lucide-react";

import { cn } from "../../lib/utils";

import type {
  AreaFactsCardPayload,
  CMACardPayload,
  CallbackCardPayload,
  LeadCaptureCardPayload,
  ListingCardPayload,
  ShowingProposalCardPayload,
  TeamMemberCardPayload,
} from "./listing-chat-tools";

type ToolPayload =
  | ListingCardPayload
  | TeamMemberCardPayload
  | ShowingProposalCardPayload
  | CallbackCardPayload
  | CMACardPayload
  | LeadCaptureCardPayload
  | AreaFactsCardPayload;

function isToolPayload(value: unknown): value is ToolPayload {
  return value !== null && typeof value === "object" && "kind" in value && typeof (value as { kind: unknown }).kind === "string";
}

export function ToolResultCard({ output, workspaceSlug }: { output: unknown; workspaceSlug?: string | undefined }) {
  if (!isToolPayload(output)) return null;
  switch (output.kind) {
    case "listing_card":
      return <ListingCard payload={output} workspaceSlug={workspaceSlug} />;
    case "team_member_card":
      return <TeamMemberCard payload={output} />;
    case "showing_proposal_card":
      return <ShowingProposalCard payload={output} />;
    case "callback_card":
      return <CallbackCard payload={output} />;
    case "cma_card":
      return <CMACard payload={output} />;
    case "lead_capture_card":
      return <LeadCaptureCard payload={output} />;
    case "area_facts_card":
      return <AreaFactsCard payload={output} />;
    default:
      return null;
  }
}

function AreaFactsCard({ payload }: { payload: AreaFactsCardPayload }) {
  return (
    <div className="my-3 w-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="mb-3 flex items-baseline justify-between gap-3 px-0.5">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-white/86">{payload.title}</div>
          {payload.reason === null ? null : (
            <div className="mt-0.5 truncate text-[11px] text-white/48">{payload.reason}</div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {payload.items.map((item, idx) => (
          <a
            key={`${item.name}-${idx}`}
            href={item.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="group flex flex-col overflow-hidden rounded-xl border border-white/8 bg-white/[0.035] transition-all hover:border-white/16 hover:bg-white/[0.06]"
          >
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-white/[0.05]">
              {item.imageUrl === null ? (
                <div className="flex h-full w-full items-center justify-center">
                  <div className="font-display text-2xl font-medium text-white/24">
                    {item.name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                </div>
              ) : (
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              )}
              {item.score === null ? null : (
                <div className="absolute right-2 top-2 rounded-full border border-white/14 bg-black/45 px-2 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur-sm">
                  {item.score}
                </div>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-1.5 px-3 py-2.5">
              <div className="truncate text-[12.5px] font-semibold text-white/88">{item.name}</div>
              {item.subtitle === null ? null : (
                <div className="truncate text-[10.5px] font-medium uppercase tracking-[0.06em] text-white/44">
                  {item.subtitle}
                </div>
              )}
              <div className="line-clamp-2 text-[11.5px] leading-[1.45] text-white/62">{item.summary}</div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

function formatPrice(price: number | null): string {
  if (price === null) return "—";
  return new Intl.NumberFormat("en-US", { currency: "USD", maximumFractionDigits: 0, style: "currency" }).format(price);
}

function formatCompactMoney(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
  if (Math.abs(value) >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return formatPrice(value);
}

function formatShowingWindow(startAt: string | null, endAt: string | null): string | null {
  if (startAt === null) return null;
  try {
    const start = new Date(startAt);
    const datePart = start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    const timePart = start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    if (endAt === null) return `${datePart} · ${timePart}`;
    const endTime = new Date(endAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return `${datePart} · ${timePart} – ${endTime}`;
  } catch {
    return null;
  }
}

function agentInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "—";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase().slice(0, 2);
}

/* ─────────  Listing card  ───────── */

function ListingCard({ payload, workspaceSlug }: { payload: ListingCardPayload; workspaceSlug?: string | undefined }) {
  const href = workspaceSlug === undefined
    ? `#listing-${payload.listingId}`
    : `/${workspaceSlug}/listings/${payload.listingId}`;
  return (
    <a
      className="block overflow-hidden rounded-[18px] border border-white/10 bg-white/[0.03] transition hover:border-white/22 hover:bg-white/[0.05]"
      href={href}
    >
      {payload.photoUrl === null ? null : (
        <div
          aria-hidden="true"
          className="h-32 w-full bg-cover bg-center"
          style={{ backgroundImage: `url(${payload.photoUrl})` }}
        />
      )}
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-display text-[15px] font-medium lowercase text-white">{payload.address.toLowerCase()}</div>
            {payload.neighborhood === null ? null : (
              <div className="mt-0.5 flex items-center gap-1 text-[11.5px] text-white/52">
                <MapPin aria-hidden="true" className="h-3 w-3" />
                {payload.neighborhood}
              </div>
            )}
          </div>
          <div className="shrink-0 text-right">
            <div className="font-display text-[15px] font-semibold tabular-nums text-white">{formatPrice(payload.price)}</div>
            {payload.previousPrice === null ? null : (
              <div className="mt-0.5 text-[10.5px] tabular-nums text-white/38 line-through">{formatPrice(payload.previousPrice)}</div>
            )}
            {payload.status === null ? null : (
              <div className={cn(
                "mt-0.5 text-[10.5px] uppercase tracking-[0.12em]",
                payload.status.toLowerCase() === "active" ? "text-[#b5c9a8]" : "text-white/40",
              )}>
                {payload.status.toLowerCase()}
              </div>
            )}
          </div>
        </div>
        {payload.priceCutAmount === null || payload.priceCutAmount <= 0 ? null : (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[#b5c9a8]/18 bg-[#b5c9a8]/10 px-2 py-1 text-[11px] font-semibold lowercase text-[#d7e7c9]">
            <BadgeDollarSign aria-hidden="true" className="h-3.5 w-3.5" />
            {formatCompactMoney(payload.priceCutAmount)} price cut
          </div>
        )}
        {payload.beds === null && payload.baths === null ? null : (
          <div className="mt-2 flex items-center gap-3 text-[12px] text-white/64">
            {payload.beds === null ? null : (
              <span className="inline-flex items-center gap-1">
                <BedDouble aria-hidden="true" className="h-3.5 w-3.5" />
                {payload.beds} bd
              </span>
            )}
            {payload.baths === null ? null : (
              <span className="inline-flex items-center gap-1">
                <Bath aria-hidden="true" className="h-3.5 w-3.5" />
                {payload.baths} ba
              </span>
            )}
          </div>
        )}
        {payload.reason.trim().length === 0 ? null : (
          <div className="mt-2.5 border-t border-white/8 pt-2.5 text-[11.5px] italic text-white/50">{payload.reason}</div>
        )}
      </div>
    </a>
  );
}

/* ─────────  Team member card  ───────── */

function TeamMemberCard({ payload }: { payload: TeamMemberCardPayload }) {
  return (
    <div className="overflow-hidden rounded-[18px] border border-white/10 bg-white/[0.03] p-3.5">
      <div className="flex items-start gap-3">
        <div
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[#88a276]/22 font-display text-[13px] font-medium text-[#dbeacb]"
        >
          {agentInitials(payload.displayName)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-[14px] font-medium text-white">{payload.displayName}</div>
          <div className="mt-0.5 text-[11.5px] text-white/56">
            {payload.role}
            {payload.specialties === null ? "" : ` · ${payload.specialties}`}
          </div>
          {payload.reason.trim().length === 0 ? null : (
            <div className="mt-2 text-[12px] italic text-white/60">{payload.reason}</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────  Showing proposal card  ───────── */

function ShowingProposalCard({ payload }: { payload: ShowingProposalCardPayload }) {
  const window = formatShowingWindow(payload.requestedStartAt, payload.requestedEndAt);
  return (
    <div className="overflow-hidden rounded-[18px] border border-[#88a276]/22 bg-[#88a276]/8 p-3.5">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#b5c9a8]">
        <Calendar aria-hidden="true" className="h-3 w-3" />
        showing request — pending approval
      </div>
      <div className="mt-1.5 font-display text-[14px] text-white">{window ?? "Time tbd · agent confirming"}</div>
      {payload.assignedMemberName === null ? null : (
        <div className="mt-1 flex items-center gap-1 text-[12px] text-white/64">
          <User aria-hidden="true" className="h-3 w-3" />
          {payload.assignedMemberName} will confirm
        </div>
      )}
    </div>
  );
}

/* ─────────  Callback card  ───────── */

function CallbackCard({ payload }: { payload: CallbackCardPayload }) {
  const label = payload.urgency === "now" ? "asap" : payload.urgency === "today" ? "today" : "this week";
  return (
    <div className="overflow-hidden rounded-[18px] border border-white/10 bg-white/[0.03] p-3.5">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/56">
        <Phone aria-hidden="true" className="h-3 w-3" />
        callback queued · {label}
      </div>
      <div className="mt-1.5 text-[12.5px] text-white/82">{payload.reason}</div>
    </div>
  );
}

/* ─────────  CMA card  ───────── */

function CMACard({ payload }: { payload: CMACardPayload }) {
  return (
    <div className="overflow-hidden rounded-[18px] border border-white/10 bg-white/[0.03] p-3.5">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/56">
        <Clock aria-hidden="true" className="h-3 w-3" />
        cma request queued
      </div>
      <div className="mt-1.5 truncate text-[13px] text-white/82">{payload.sellerPropertyAddress}</div>
      <div className="mt-1 text-[11.5px] text-white/52">agent will run real comps and reach out within 24h</div>
    </div>
  );
}

/* ─────────  Lead capture card  ───────── */

function LeadCaptureCard({ payload }: { payload: LeadCaptureCardPayload }) {
  return (
    <div className="overflow-hidden rounded-[18px] border border-[#88a276]/22 bg-[#88a276]/8 p-3.5">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#b5c9a8]">
        <CheckCircle2 aria-hidden="true" className="h-3 w-3" />
        you're in the loop
      </div>
      <div className="mt-1.5 text-[13px] text-white/82">{payload.nextStep}</div>
    </div>
  );
}
