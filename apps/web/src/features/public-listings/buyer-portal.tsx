"use client";

/**
 * Buyer-side portal surface for a public listing page.
 *
 * Three pieces, one shared cookie-scoped fetch:
 *
 *   1. useBuyerPortalState  — fetches GET /[slug]/api/listings/chat?listingId=...
 *                             once on mount, exposes {state, reload, isLoading}.
 *   2. BuyerPortalMeetTheTeam — Airbnb-style "Meet the Team" panel. Pre-routing
 *                               renders the brokerage trust block; post-routing
 *                               flips to "Priya Shah is helping you" with the
 *                               showing status row. Same vertical slot — the
 *                               panel *evolves* as the visitor relationship matures.
 *   3. BuyerPortalChip       — floating lower-right chip (only when the visitor
 *                               has shared a first name). Tap opens a right-anchored
 *                               vaul drawer with name + what Harwick remembers +
 *                               listings asked about + agent + showings. Mirrors
 *                               the operator-side rail DNA, smaller — chip only,
 *                               no labels.
 *
 * No pills, no per-pill chips. Status rows are plain text inside nested rounded
 * panels with hairline borders. Matches the standing aesthetic rule.
 */

import {
  Calendar,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock,
  MapPin,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Drawer } from "vaul";

import type { PublicListingPortalState } from "@realty-ops/core";

import { PLAN_MATERIALS } from "../marketing/plan-card-material";
import { cn } from "../../lib/utils";

type PortalState = PublicListingPortalState;

type UseBuyerPortalStateResult = {
  state: PortalState | null;
  isLoading: boolean;
  reload: () => Promise<void>;
};

/**
 * Cookie-scoped portal-state fetch. Returns `null` until the first
 * load resolves; consumers should render their "anonymous first-time
 * visitor" branch in the null + non-loading case.
 */
export function useBuyerPortalState(params: {
  workspaceSlug: string;
  listingId: string;
}): UseBuyerPortalStateResult {
  const [state, setState] = useState<PortalState | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchState = useCallback(async () => {
    try {
      const url = `/${params.workspaceSlug}/api/listings/chat?listingId=${encodeURIComponent(params.listingId)}`;
      const response = await fetch(url, { method: "GET", credentials: "same-origin" });
      if (!response.ok) {
        setState(null);
        return;
      }
      const data = await response.json() as PortalState;
      setState(data);
    } catch {
      setState(null);
    } finally {
      setIsLoading(false);
    }
  }, [params.workspaceSlug, params.listingId]);

  useEffect(() => {
    void fetchState();
  }, [fetchState]);

  return { state, isLoading, reload: fetchState };
}

/* ─────────  Meet The Team / Dynamic Agent  ───────── */

/**
 * Friendly relative timestamp for the cross-listing timeline. Picks the
 * most-relevant moment ("today", "yesterday", "Tuesday", "Mar 14") and
 * adds a "first" vs "kept coming back" qualifier so the drawer reads
 * like a journey, not a stale list.
 */
function formatTimelineStamp(firstAskedAt: string | null, lastAskedAt: string | null): string {
  const last = lastAskedAt ?? firstAskedAt;
  if (last === null) return "";
  const now = Date.now();
  const lastMs = Date.parse(last);
  if (!Number.isFinite(lastMs)) return "";
  const minutes = Math.round((now - lastMs) / 60_000);
  let label: string;
  if (minutes < 5) label = "just now";
  else if (minutes < 60) label = `${minutes}m ago`;
  else if (minutes < 60 * 24) label = `${Math.round(minutes / 60)}h ago`;
  else if (minutes < 60 * 24 * 7) {
    const d = new Date(lastMs);
    label = d.toLocaleDateString(undefined, { weekday: "short" });
  } else {
    const d = new Date(lastMs);
    label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  // "Kept coming back" when first and last differ meaningfully (>2h).
  if (firstAskedAt !== null && lastAskedAt !== null) {
    const firstMs = Date.parse(firstAskedAt);
    if (Number.isFinite(firstMs) && lastMs - firstMs > 2 * 60 * 60 * 1000) {
      return `${label} · kept coming back`;
    }
  }
  return label;
}

function agentInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "—";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase().slice(0, 2);
}

function showingStatusCopy(status: PortalState["showings"][number]["status"]): {
  label: string;
  Icon: typeof CircleCheck;
  tone: "neutral" | "good" | "bad";
} {
  switch (status) {
    case "approved":
      return { label: "confirmed", Icon: CircleCheck, tone: "good" };
    case "declined":
      return { label: "rescheduling", Icon: CircleX, tone: "bad" };
    case "completed":
      return { label: "showing done", Icon: CircleCheck, tone: "good" };
    case "cancelled":
      return { label: "cancelled", Icon: CircleX, tone: "bad" };
    default:
      return { label: "pending approval", Icon: CircleDashed, tone: "neutral" };
  }
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

/**
 * Real photo avatar with initials fallback. Photos come from
 * workspace_members.avatar_url; when absent, we render a sage-bg circle
 * with the member's initials so the card still looks alive.
 */
function MemberAvatar({
  name,
  avatarUrl,
  size,
  ring = false,
}: {
  name: string;
  avatarUrl: string | null;
  size: number;
  ring?: boolean;
}) {
  const dims = { width: size, height: size };
  const fontSize = Math.round(size * 0.36);
  if (avatarUrl !== null && avatarUrl.length > 0) {
    return (
      <span
        aria-label={name}
        className={cn(
          "block shrink-0 overflow-hidden rounded-full bg-cover bg-center bg-no-repeat shadow-[0_2px_6px_rgba(0,0,0,0.42)]",
          ring && "ring-2 ring-[#0e1714]",
        )}
        style={{ ...dims, backgroundImage: `url(${avatarUrl})` }}
      />
    );
  }
  return (
    <span
      aria-label={name}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#9bc09b] to-[#5f8c66] font-display font-medium text-[#07100a] shadow-[0_2px_6px_rgba(0,0,0,0.42)]",
        ring && "ring-2 ring-[#0e1714]",
      )}
      style={{ ...dims, fontSize }}
    >
      {agentInitials(name)}
    </span>
  );
}

/**
 * Universal trust copy. Works whether the workspace has 1 agent (solo)
 * or 25 (brokerage). Operator will be able to override this string in
 * settings later — for now this is the default.
 */
function buildTrustCopy(params: {
  workspaceName: string;
  agentCount: number;
  customTagline: string | null;
}): string {
  if (params.customTagline !== null && params.customTagline.trim().length > 0) {
    return params.customTagline.trim();
  }
  const noun = params.agentCount <= 1 ? "agent" : "team";
  return `Local real estate ${noun} who actually answer. Harwick handles the first conversation, the right person picks it up.`;
}

/**
 * Always-rendered listing trust block. Two faces:
 *
 *   - Pre-routing: holographic sage card (team plan material). Stacked
 *     real-photo avatars, universal-default tagline, social-proof row.
 *   - Post-routing (state.assignedAgent !== null): replaces with the
 *     assigned-agent card — real photo, role + specialties, the most
 *     relevant showing row underneath.
 *
 * Both variants live in the same vertical slot in the listing detail
 * page so the "page becomes the buyer's thread" framing reads as ONE
 * panel that fills in as the visitor relationship matures.
 */
export function BuyerPortalMeetTheTeam(props: {
  workspaceName: string;
  listingId: string;
  state: PortalState | null;
  // Future-hookup: operator-editable tagline override. Null for now
  // (renders the universal default).
  customTagline?: string | null;
}) {
  const { state, workspaceName } = props;
  const material = PLAN_MATERIALS.team;

  if (state === null) {
    return (
      <section className="overflow-hidden rounded-[24px] border border-white/8 bg-white/[0.025] p-5">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/38">meet the team</div>
        <div className="mt-3 h-16 animate-pulse rounded-[16px] bg-white/[0.04]" aria-hidden="true" />
      </section>
    );
  }

  const assigned = state.assignedAgent;
  const showingForThisListing = state.showings.find((s) => s.listingId === props.listingId) ?? state.showings[0] ?? null;

  if (assigned !== null) {
    const showing = showingForThisListing;
    return (
      <section
        className="relative overflow-hidden rounded-[24px] border border-white/12 p-5 text-white"
        style={{ background: material.background, boxShadow: material.edgeShadow }}
      >
        <div className="relative text-[10px] font-bold uppercase tracking-[0.18em] text-[#dbeacb]">
          your agent
        </div>
        <div className="relative mt-4 flex items-start gap-4">
          <MemberAvatar
            name={assigned.displayName}
            avatarUrl={assigned.avatarUrl}
            size={56}
            ring
          />
          <div className="min-w-0 flex-1">
            <div className="font-display text-[17px] font-medium leading-tight text-white">
              {assigned.displayName}
            </div>
            <div className="mt-0.5 text-[11.5px] uppercase tracking-[0.12em] text-white/56">
              {assigned.role}
            </div>
            {assigned.specialties === null ? null : (
              <div className="mt-1.5 text-[12.5px] leading-5 text-white/76">{assigned.specialties}</div>
            )}
          </div>
        </div>
        {showing === null ? null : (() => {
          const status = showingStatusCopy(showing.status);
          const window = formatShowingWindow(showing.requestedStartAt, showing.requestedEndAt);
          return (
            <div className="relative mt-4 rounded-[16px] border border-white/10 bg-black/22 px-4 py-3 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/52">
                <Calendar aria-hidden="true" className="h-3 w-3" />
                your showing
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-3 text-[13px] text-white/90">
                <span className="truncate font-medium">{window ?? "time tbd"}</span>
                <span className={cn(
                  "inline-flex items-center gap-1.5 text-[11.5px]",
                  status.tone === "good" && "text-[#c4e0b8]",
                  status.tone === "bad" && "text-[#e8b6b6]",
                  status.tone === "neutral" && "text-white/64",
                )}>
                  <status.Icon aria-hidden="true" className="h-3 w-3" />
                  {status.label}
                </span>
              </div>
            </div>
          );
        })()}
      </section>
    );
  }

  const teamPreview = state.team.slice(0, 4);
  const tagline = buildTrustCopy({
    workspaceName,
    agentCount: state.team.length,
    customTagline: props.customTagline ?? null,
  });
  const headerNoun = state.team.length <= 1 ? "meet your agent" : `meet ${workspaceName.toLowerCase()}`;

  return (
    <section
      className="relative overflow-hidden rounded-[24px] border border-white/12 p-5 text-white"
      style={{ background: material.background, boxShadow: material.edgeShadow }}
    >
      <div className="relative text-[10px] font-bold uppercase tracking-[0.18em] text-[#dbeacb]">
        {headerNoun}
      </div>

      <p className="relative mt-3 text-[14px] leading-6 text-white/86">{tagline}</p>

      {teamPreview.length === 0 ? null : (
        <div className="relative mt-5 flex items-center justify-between gap-4">
          <div className="flex -space-x-3">
            {teamPreview.map((member) => (
              <MemberAvatar
                key={member.memberId}
                name={member.displayName}
                avatarUrl={member.avatarUrl}
                size={40}
                ring
              />
            ))}
            {state.team.length > teamPreview.length ? (
              <span
                aria-hidden="true"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-[11px] font-medium text-white/72 ring-2 ring-[#0e1714]"
              >
                +{state.team.length - teamPreview.length}
              </span>
            ) : null}
          </div>
          <div className="text-right text-[11px] uppercase tracking-[0.12em] text-white/52">
            {state.team.length} {state.team.length === 1 ? "agent" : "agents"}
            <br />
            <span className="text-[10px] text-[#b5c9a8]">ready when you are</span>
          </div>
        </div>
      )}

    </section>
  );
}

/* ─────────  Floating chip + drawer  ───────── */

function ChipAvatar({ initial }: { initial: string }) {
  return (
    <div
      aria-hidden="true"
      className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#9bc09b] to-[#5f8c66] font-display text-[13px] font-medium text-[#07100a] shadow-[0_2px_8px_rgba(0,0,0,0.32)]"
    >
      {initial}
    </div>
  );
}

/**
 * Lower-right floating chip + slight-profile drawer. Materializes only
 * once the visitor has shared a first name (profile.name !== null) so
 * first-time anonymous browsers see a calm, undecorated page. The chip
 * itself is single-glyph (initial + dot) — no label, no badge count.
 *
 * The drawer accretes content as the relationship deepens. Empty state
 * is acceptable: "name + a single-line greeting" is enough to feel
 * recognized without being a dashboard.
 */
export function BuyerPortalChip(props: { state: PortalState | null }) {
  const { state } = props;
  const [open, setOpen] = useState(false);

  if (state === null) return null;
  if (state.profile.name === null || state.profile.name.trim().length === 0) return null;

  const firstName = state.profile.name.trim().split(/\s+/)[0] ?? state.profile.name.trim();
  const initial = firstName[0]?.toUpperCase() ?? "·";

  return (
    <Drawer.Root direction="right" onOpenChange={setOpen} open={open}>
      <Drawer.Trigger asChild>
        <button
          aria-label={`Open your profile, ${firstName}`}
          className="fixed bottom-5 right-5 z-40 h-11 w-11 rounded-full border border-white/14 backdrop-blur-md transition hover:border-white/26"
          style={{
            background: PLAN_MATERIALS.team.background,
            boxShadow: `${PLAN_MATERIALS.team.edgeShadow}, 0 8px 24px rgba(0,0,0,0.42)`,
          }}
          type="button"
        />
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-[rgba(8,12,8,0.62)] backdrop-blur-[18px] backdrop-saturate-125" />
        <Drawer.Content
          className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[400px] flex-col overflow-hidden border-l border-white/8 bg-[#0c130e] text-white [color-scheme:dark]"
        >
          <Drawer.Title className="sr-only">{firstName}'s profile</Drawer.Title>
          <div className="flex items-center justify-between px-5 pt-6 pb-3">
            <div className="flex items-center gap-3">
              <ChipAvatar initial={initial} />
              <div>
                <div className="font-display text-[18px] font-medium lowercase text-white">{firstName.toLowerCase()}</div>
                <div className="text-[11.5px] text-white/52">
                  {state.profile.isReturning ? "picking up where we left off" : "your thread with the team"}
                </div>
              </div>
            </div>
            <button
              aria-label="close"
              className="-mr-1 flex h-9 w-9 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] text-white/70 transition hover:border-white/22 hover:text-white"
              onClick={() => setOpen(false)}
              type="button"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-5 pb-6 pt-2">
            {/* HERO — model-generated headline. The "oh shit harwick knows
                me" moment. Renders as quoted-style prose, not a label. */}
            {state.profile.headline === null ? null : (
              <section className="rounded-[18px] border border-[#88a276]/20 bg-[#88a276]/8 p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#b5c9a8]">how harwick sees you</div>
                <p className="mt-2 font-display text-[15px] leading-6 text-white/92">
                  {state.profile.headline}
                </p>
              </section>
            )}

            {/* LIFE CONTEXT — the human story. Kids, marriage, job, family
                timing. Highest signal for "wow you remember." */}
            {state.profile.lifeContext.length === 0 ? null : (
              <section className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">what harwick noticed</div>
                <ul className="mt-2.5 space-y-2 text-[13px] leading-5 text-white/82">
                  {state.profile.lifeContext.slice(0, 8).map((note) => (
                    <li className="flex items-start gap-2" key={note}>
                      <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#b5c9a8]" />
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* VIBE — emotional / style notes. Short, secondary. */}
            {state.profile.vibeNotes.length === 0 ? null : (
              <section className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">vibe</div>
                <ul className="mt-2 space-y-1.5 text-[12.5px] leading-5 text-white/70">
                  {state.profile.vibeNotes.slice(0, 4).map((note) => (
                    <li className="italic" key={note}>{note}</li>
                  ))}
                </ul>
              </section>
            )}

            {/* TIMELINE — cross-listing journey. "Tuesday: asked about X.
                Today: jumped to Y." Read top→bottom in reverse-chrono. */}
            {state.profile.listingsAskedAbout.length === 0 ? null : (
              <section className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">your thread so far</div>
                <ul className="mt-2.5 space-y-2.5">
                  {state.profile.listingsAskedAbout.slice(0, 6).map((listing, index) => (
                    <li className="flex items-start gap-2.5 text-[13px] leading-5" key={listing.id}>
                      <span aria-hidden="true" className={cn(
                        "mt-1 h-2 w-2 shrink-0 rounded-full",
                        index === 0 ? "bg-[#b5c9a8]" : "bg-white/30",
                      )} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-white/86">{listing.address}</div>
                        <div className="mt-0.5 text-[11.5px] text-white/48">
                          {formatTimelineStamp(listing.firstAskedAt, listing.lastAskedAt)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* SHOWINGS — render only when there are any (post-promotion). */}
            {state.showings.length === 0 ? null : (
              <section className="rounded-[18px] border border-[#88a276]/20 bg-[#88a276]/6 p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#b5c9a8]">your showings</div>
                <ul className="mt-2.5 space-y-2.5">
                  {state.showings.slice(0, 4).map((showing) => {
                    const status = showingStatusCopy(showing.status);
                    const window = formatShowingWindow(showing.requestedStartAt, showing.requestedEndAt);
                    return (
                      <li className="flex items-start gap-2.5 text-[13px] leading-5" key={showing.taskId}>
                        <Calendar aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/56" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-white/90">{showing.listingAddress}</div>
                          <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-white/56">
                            <Clock aria-hidden="true" className="h-3 w-3" />
                            <span>{window ?? "time tbd"}</span>
                            <span aria-hidden="true">·</span>
                            <span className={cn(
                              status.tone === "good" && "text-[#b5c9a8]",
                              status.tone === "bad" && "text-[#d4a8a8]",
                            )}>
                              {status.label}
                            </span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {/* PREFERRED SHOWING TIMES — only when set, pre-booking
                speculation (Saturday mornings etc). */}
            {state.profile.preferredShowingTimes.length === 0 ? null : (
              <section className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">when you'd want to tour</div>
                <div className="mt-2 text-[13px] leading-5 text-white/76">
                  {state.profile.preferredShowingTimes.slice(0, 4).join(" · ")}
                </div>
              </section>
            )}

            {/* AGENT — when routing has assigned someone. */}
            {state.assignedAgent === null ? null : (
              <section className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">your agent</div>
                <div className="mt-2 flex items-center gap-3">
                  <div
                    aria-hidden="true"
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[#88a276]/22 font-display text-[13px] text-[#dbeacb]"
                  >
                    {agentInitials(state.assignedAgent.displayName)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[14px] font-medium text-white">{state.assignedAgent.displayName}</div>
                    <div className="text-[11.5px] text-white/56">
                      {state.assignedAgent.role}
                      {state.assignedAgent.specialties === null ? null : ` · ${state.assignedAgent.specialties}`}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* QUICK FACTS — the slot grid, secondary, only when present. */}
            {state.profile.knownFacts.length === 0 ? null : (
              <section className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">quick facts</div>
                <ul className="mt-2 space-y-1.5 text-[12.5px] leading-5 text-white/70">
                  {state.profile.knownFacts.slice(0, 8).map((fact) => (
                    <li className="flex items-start gap-2" key={fact}>
                      <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-white/30" />
                      <span>{fact}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* EMPTY STATE — first-time visitor who just shared a name. */}
            {state.profile.headline === null
              && state.profile.lifeContext.length === 0
              && state.profile.knownFacts.length === 0
              && state.assignedAgent === null
              && state.showings.length === 0
              && state.profile.listingsAskedAbout.length === 0
                ? (
                  <section className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-5">
                    <p className="text-[13px] leading-5 text-white/64">
                      As you chat, this is where Harwick keeps track of what matters to you — your timing, what you're looking for, your agent, your showings. Picks up next time you come back.
                    </p>
                  </section>
                )
              : null}

            <div className="px-1 text-[10px] uppercase tracking-[0.16em] text-white/30">
              you're recognized by this device only. nothing is shared publicly.
            </div>
          </div>

          <div className="border-t border-white/8 px-5 py-3 text-[11.5px] text-white/40">
            <button
              className="inline-flex w-full items-center justify-between text-white/60 transition hover:text-white"
              onClick={() => setOpen(false)}
              type="button"
            >
              <span>back to listing</span>
              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
