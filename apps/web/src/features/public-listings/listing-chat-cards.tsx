"use client";

/**
 * Inline tool-result cards rendered in the public listing chat stream.
 *
 * The route's tools (`surface_listing`, `surface_team_member`, etc.) emit
 * payloads with a `kind` discriminator. `<ToolResultCard>` switches on
 * that kind and renders the right card. Lookup tools (note_qualification,
 * search_workspace_listings, etc.) are silent — they don't render here.
 */

import { BedDouble, Bath, Calendar, CheckCircle2, Clock, MapPin, Phone, User } from "lucide-react";

import { cn } from "../../lib/utils";

import type {
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
  | LeadCaptureCardPayload;

function isToolPayload(value: unknown): value is ToolPayload {
  return value !== null && typeof value === "object" && "kind" in value && typeof (value as { kind: unknown }).kind === "string";
}

export function ToolResultCard({ output }: { output: unknown }) {
  if (!isToolPayload(output)) return null;
  switch (output.kind) {
    case "listing_card":
      return <ListingCard payload={output} />;
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
    default:
      return null;
  }
}

function formatPrice(price: number | null): string {
  if (price === null) return "—";
  return new Intl.NumberFormat("en-US", { currency: "USD", maximumFractionDigits: 0, style: "currency" }).format(price);
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

function ListingCard({ payload }: { payload: ListingCardPayload }) {
  return (
    <a
      className="block overflow-hidden rounded-[18px] border border-white/10 bg-white/[0.03] transition hover:border-white/22 hover:bg-white/[0.05]"
      href={`#listing-${payload.listingId}`}
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
