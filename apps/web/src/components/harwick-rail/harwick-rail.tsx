"use client";

import type { TeamPresenceMember, WorkspaceRole } from "@realty-ops/core";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Brain,
  Compass,
  GitBranch,
  Maximize2,
  Minimize2,
  Send,
  TrendingUp,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Drawer } from "vaul";

import { FeedbackButtons } from "../training-signals/feedback-buttons";
import { cn } from "../../lib/utils";
import { ChannelsMode } from "./channels-mode";
import { HarwickChat } from "./harwick-chat";
import { HarwickMark } from "./harwick-mark";
import { useProactiveFeed, type ProactiveCard, type ProactiveKind } from "./use-proactive-feed";

const STORAGE_KEY = "harwick-rail-position-v4";

type RailMode = "feed" | "chat" | "channels";

type RailState = {
  open: boolean;
  mode: RailMode;
  x: number;
  y: number;
  w: number;
  h: number;
  maximized: boolean;
};

function makeDefaultState(): RailState {
  const width = 440;
  const initialX = typeof window === "undefined" ? 24 : Math.max(24, window.innerWidth - width - 24);
  return {
    open: true,
    mode: "feed",
    x: initialX,
    y: 24,
    w: width,
    h: 640,
    maximized: false,
  };
}

function readState(): RailState {
  if (typeof window === "undefined") return makeDefaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return makeDefaultState();
    const parsed = JSON.parse(raw) as Partial<RailState>;
    return { ...makeDefaultState(), ...parsed };
  } catch {
    return makeDefaultState();
  }
}

function clampPosition(state: RailState): RailState {
  if (typeof window === "undefined") return state;
  const maxX = Math.max(8, window.innerWidth - state.w - 8);
  const maxY = Math.max(8, window.innerHeight - state.h - 8);
  return {
    ...state,
    x: Math.min(Math.max(8, state.x), maxX),
    y: Math.min(Math.max(8, state.y), maxY),
  };
}

const kindStyles: Record<ProactiveKind, { ring: string; chipBg: string; chipText: string; icon: LucideIcon; primary: string }> = {
  alert: {
    ring: "ring-1 ring-inset ring-[var(--oxblood)]/35",
    chipBg: "bg-[var(--oxblood-soft)]",
    chipText: "text-[var(--oxblood)]",
    icon: AlertTriangle,
    primary: "border border-[var(--oxblood)]/40 bg-[var(--oxblood-soft)] text-[var(--oxblood)] hover:bg-[var(--oxblood-soft)]/80 hover:border-[var(--oxblood)]/60",
  },
  insight: {
    ring: "ring-1 ring-inset ring-[var(--sage)]/30",
    chipBg: "bg-[var(--sage-soft)]",
    chipText: "text-[var(--sage)]",
    icon: Brain,
    primary: "border border-[var(--sage)]/35 bg-[var(--sage-soft)] text-[var(--sage)] hover:bg-[var(--sage-soft)]/80 hover:border-[var(--sage)]/55",
  },
  trend: {
    ring: "ring-1 ring-inset ring-[var(--clay)]/30",
    chipBg: "bg-[var(--clay-soft)]",
    chipText: "text-[var(--clay)]",
    icon: TrendingUp,
    primary: "border border-[var(--clay)]/35 bg-[var(--clay-soft)] text-[var(--clay)] hover:bg-[var(--clay-soft)]/80 hover:border-[var(--clay)]/55",
  },
  routing: {
    ring: "ring-1 ring-inset ring-white/[0.08]",
    chipBg: "bg-white/[0.05]",
    chipText: "text-white/82",
    icon: GitBranch,
    primary: "border border-white/[0.14] bg-white/[0.06] text-white hover:bg-white/[0.1] hover:border-white/[0.22]",
  },
  draft: {
    ring: "ring-1 ring-inset ring-white/[0.08]",
    chipBg: "bg-white/[0.05]",
    chipText: "text-white/82",
    icon: Send,
    primary: "border border-[var(--sage)]/35 bg-[var(--sage-soft)] text-[var(--sage)] hover:bg-[var(--sage-soft)]/80 hover:border-[var(--sage)]/55",
  },
  prep: {
    ring: "ring-1 ring-inset ring-[var(--sage)]/30",
    chipBg: "bg-[var(--sage-soft)]",
    chipText: "text-[var(--sage)]",
    icon: Compass,
    primary: "border border-[var(--sage)]/35 bg-[var(--sage-soft)] text-[var(--sage)] hover:bg-[var(--sage-soft)]/80 hover:border-[var(--sage)]/55",
  },
};

function ProactiveCardView({ card, workspaceId }: { card: ProactiveCard; workspaceId: string }) {
  const styles = kindStyles[card.kind];
  const Icon = styles.icon;
  return (
    <div
      className={cn(
        "rounded-[12px] border border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-white/[0.012] p-3.5",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_4px_12px_-6px_rgba(0,0,0,0.45)]",
        styles.ring,
      )}
    >
      <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.1em]">
        <span className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5", styles.chipBg, styles.chipText)}>
          <Icon className="size-2.5" aria-hidden="true" />
          {card.kind}
        </span>
        {card.badge === undefined || card.badge === null ? null : (
          <span className="rounded-full bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-white/68">{card.badge}</span>
        )}
        <span className="ml-auto text-[10px] text-white/40">now</span>
      </div>
      <div className="text-[13px] font-medium leading-5 text-white">{card.title}</div>
      <p className="mt-1 text-[12px] leading-5 text-white/64">{card.body}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {card.actions.map((action, index) => (
          <a
            key={action.label}
            href={action.href ?? "#"}
            className={cn(
              "inline-flex items-center gap-1 rounded-[7px] px-2.5 py-1 text-[11px] font-medium transition",
              index === 0
                ? styles.primary
                : "border border-white/[0.08] bg-white/[0.025] text-white/72 hover:border-white/[0.16] hover:bg-white/[0.05] hover:text-white",
            )}
          >
            {action.label}
            {index === 0 ? <ArrowRight className="size-3" aria-hidden="true" /> : null}
          </a>
        ))}
        <span className="ml-auto inline-flex items-center gap-1">
          <span className="text-[10px] text-white/40">useful?</span>
          <FeedbackButtons
            size="sm"
            compact
            target={{ kind: "surface", workspaceId, surface: "proactive_card", resourceId: card.id, context: { title: card.title, kind: card.kind } }}
          />
        </span>
      </div>
    </div>
  );
}

function FeedMode({ workspaceId, role, onSwitchToChat }: { workspaceId: string; role: WorkspaceRole; onSwitchToChat: () => void }) {
  const feed = useProactiveFeed(workspaceId, role);
  const greeting = role === "owner" || role === "admin"
    ? "Caught up overnight. Here's what I'd surface first."
    : role === "team_lead" || role === "lead_manager"
      ? "Capacity, routing, and approvals — what matters today."
      : role === "operator"
        ? "Sync health and blockers. Voice runtime looks stable."
        : "What needs you first. Drafts, replies, follow-ups.";

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3">
      <div className="mb-3 flex items-center gap-2 text-[10.5px] font-medium uppercase tracking-[0.12em] text-white/48">
        <HarwickMark size={12} tone="soft" />
        today · {role}
      </div>
      <p className="mb-3.5 text-[13px] leading-5 text-white/92">{greeting}</p>
      {feed.loaded === false ? (
        <div className="space-y-2.5">
          <div className="h-[88px] animate-pulse rounded-[12px] border border-white/[0.06] bg-white/[0.02]" />
          <div className="h-[88px] animate-pulse rounded-[12px] border border-white/[0.06] bg-white/[0.02]" />
        </div>
      ) : (
        <div className="space-y-2.5">
          {feed.cards.map((card) => (
            <ProactiveCardView key={card.id} card={card} workspaceId={workspaceId} />
          ))}
        </div>
      )}
      <button
        type="button"
        className="mt-3.5 flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-white/[0.12] bg-transparent px-3 py-2.5 text-[12px] font-medium text-white/64 transition hover:border-white/[0.22] hover:text-white"
        onClick={onSwitchToChat}
      >
        <Bot className="size-3.5" aria-hidden="true" />
        Ask Harwick anything
      </button>
    </div>
  );
}

function RailHeader(props: {
  mode: RailMode;
  role: WorkspaceRole;
  onModeChange: (mode: RailMode) => void;
  onClose: () => void;
  maximized: boolean;
  onMaximizeToggle: () => void;
}) {
  return (
    <div
      data-rail-drag-handle="true"
      className="flex h-11 shrink-0 cursor-grab items-center gap-2 border-b border-white/[0.06] bg-white/[0.02] px-3 active:cursor-grabbing"
    >
      <HarwickMark size={20} tone="default" />
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="text-[12.5px] font-semibold text-white">Harwick</span>
        <span className="text-[10.5px] text-white/52">chief of staff · {props.role}</span>
      </div>
      <div className="ml-auto flex items-center gap-1">
        <div className="inline-flex rounded-[7px] border border-[color:var(--panel-line)] bg-[color:var(--panel-2)] p-0.5">
          {(["feed", "chat", "channels"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={cn(
                "flex h-6 items-center gap-1 rounded-[5px] px-1.5 text-[10.5px] font-semibold transition",
                props.mode === mode ? "bg-white text-[color:var(--panel-0)]" : "text-[color:var(--graphite-text-muted)] hover:text-[color:var(--graphite-text)]",
              )}
              onClick={() => props.onModeChange(mode)}
              title={mode === "feed" ? "Today's feed" : mode === "chat" ? "Chat with Harwick" : "Workspace rooms"}
            >
              {mode === "channels" ? "rooms" : mode}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="flex size-7 items-center justify-center rounded-[6px] text-white/64 transition hover:bg-white/[0.04] hover:text-white"
          onClick={props.onMaximizeToggle}
          title={props.maximized ? "Restore" : "Maximize"}
        >
          {props.maximized ? <Minimize2 className="size-3.5" aria-hidden="true" /> : <Maximize2 className="size-3.5" aria-hidden="true" />}
        </button>
        <button
          type="button"
          className="flex size-7 items-center justify-center rounded-[6px] text-white/64 transition hover:bg-white/[0.04] hover:text-white"
          onClick={props.onClose}
          title="Hide rail"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export function HarwickRail(props: { workspaceId: string; operatorRole: WorkspaceRole }) {
  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState<RailState>(() => makeDefaultState());
  const [teamMembers, setTeamMembers] = useState<TeamPresenceMember[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const windowRef = useRef<HTMLDivElement | null>(null);

  // Single in-memory chat session per page load. When server-side rooms land,
  // this will become a per-room id and messages will persist server-side.
  const chatThreadId = useMemo(() => `rail-${props.workspaceId}`, [props.workspaceId]);

  useEffect(() => {
    setState(clampPosition(readState()));
    setMounted(true);
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [mounted, state]);

  useEffect(() => {
    if (!mounted) return;
    const onResize = () => setState((current) => clampPosition(current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [mounted]);

  // Team presence for channels-mode picker (piggybacks on /api/home).
  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    async function loadTeam() {
      try {
        const response = await fetch(`/api/home?workspaceId=${props.workspaceId}`, { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const payload = (await response.json()) as { teamPresence?: { members?: unknown } };
        const raw = payload.teamPresence?.members;
        if (!Array.isArray(raw)) return;
        const members = raw.flatMap((item): TeamPresenceMember[] => {
          if (item === null || typeof item !== "object") return [];
          const record = item as Record<string, unknown>;
          const id = typeof record["id"] === "string" ? record["id"] : null;
          const name = typeof record["name"] === "string" ? record["name"] : null;
          const initials = typeof record["initials"] === "string" ? record["initials"] : null;
          const roleLabel = typeof record["roleLabel"] === "string" ? record["roleLabel"] : "Member";
          if (id === null || name === null || initials === null) return [];
          return [{
            id,
            workspaceId: typeof record["workspaceId"] === "string" ? record["workspaceId"] : props.workspaceId,
            activeLeadCount: typeof record["activeLeadCount"] === "number" ? record["activeLeadCount"] : 0,
            avatarUrl: typeof record["avatarUrl"] === "string" ? record["avatarUrl"] : null,
            initials,
            lastSeen: typeof record["lastSeen"] === "string" ? record["lastSeen"] : "—",
            lastSeenAt: typeof record["lastSeenAt"] === "string" ? record["lastSeenAt"] : null,
            name,
            openWork: typeof record["openWork"] === "number" ? record["openWork"] : 0,
            role: (typeof record["role"] === "string" ? record["role"] : "agent") as TeamPresenceMember["role"],
            roleLabel,
            status: (typeof record["status"] === "string" ? record["status"] : "online") as TeamPresenceMember["status"],
          }];
        });
        if (!cancelled) setTeamMembers(members);
      } catch {
        // swallow
      }
    }
    void loadTeam();
    return () => { cancelled = true; };
  }, [mounted, props.workspaceId]);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (!target.closest("[data-rail-drag-handle=\"true\"]")) return;
    if (target.closest("button,textarea,input,a")) return;
    if (windowRef.current === null) return;

    const rect = windowRef.current.getBoundingClientRect();
    const startMouseX = event.clientX;
    const startMouseY = event.clientY;
    const startLeft = rect.left;
    const startBottom = window.innerHeight - rect.bottom;
    const elementId = event.currentTarget;
    elementId.setPointerCapture(event.pointerId);

    const onMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startMouseX;
      const dy = moveEvent.clientY - startMouseY;
      setState((current) => clampPosition({
        ...current,
        maximized: false,
        x: startLeft + dx,
        y: startBottom - dy,
      }));
    };
    const onUp = (upEvent: PointerEvent) => {
      elementId.releasePointerCapture(upEvent.pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  const onResizePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const startMouseX = event.clientX;
    const startMouseY = event.clientY;
    const startW = state.w;
    const startH = state.h;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);

    const onMove = (moveEvent: PointerEvent) => {
      const dx = startMouseX - moveEvent.clientX;
      const dy = startMouseY - moveEvent.clientY;
      setState((current) => ({
        ...current,
        maximized: false,
        w: Math.min(720, Math.max(340, startW + dx)),
        h: Math.min(window.innerHeight - 32, Math.max(420, startH + dy)),
      }));
    };
    const onUp = (upEvent: PointerEvent) => {
      target.releasePointerCapture(upEvent.pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [state.h, state.w]);

  const onRailLinkClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!(target instanceof HTMLAnchorElement)) return;
    const href = target.getAttribute("href");
    if (href === null || href.length === 0 || href.startsWith("#") || target.target === "_blank") return;
    setState((current) => ({ ...current, open: false }));
  }, []);

  if (!mounted) return null;

  if (!state.open) {
    return (
      <button
        type="button"
        className={cn(
          "fixed z-50 inline-flex items-center gap-2 rounded-full border border-[color:var(--panel-line-strong)] bg-[color:var(--panel-2)] px-3.5 py-2 text-[12.5px] font-semibold text-white shadow-[var(--panel-inset-top),0_12px_28px_-6px_rgba(0,0,0,0.55),0_2px_4px_rgba(0,0,0,0.3)] backdrop-blur transition active:scale-95 hover:-translate-y-px hover:border-[color:var(--panel-line-strong)]",
          isMobile
            ? "right-4 bottom-[calc(env(safe-area-inset-bottom,0)+5rem)]"
            : "right-5 bottom-5",
        )}
        onClick={() => setState((current) => ({ ...current, open: true }))}
      >
        <HarwickMark size={18} tone="soft" />
        Ask Harwick
      </button>
    );
  }

  const railBody = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" onClickCapture={onRailLinkClick}>
      <RailHeader
        mode={state.mode}
        role={props.operatorRole}
        onModeChange={(mode) => setState((current) => ({ ...current, mode }))}
        onClose={() => setState((current) => ({ ...current, open: false }))}
        maximized={state.maximized}
        onMaximizeToggle={() => setState((current) => ({ ...current, maximized: !current.maximized }))}
      />

      {state.mode === "feed" ? (
        <FeedMode
          workspaceId={props.workspaceId}
          role={props.operatorRole}
          onSwitchToChat={() => setState((current) => ({ ...current, mode: "chat" }))}
        />
      ) : state.mode === "channels" ? (
        <ChannelsMode team={teamMembers} currentMemberId={null} />
      ) : (
        <HarwickChat workspaceId={props.workspaceId} threadId={chatThreadId} />
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Drawer.Root
        open={state.open}
        onOpenChange={(open) => setState((current) => ({ ...current, open }))}
        shouldScaleBackground={false}
      >
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" />
          <Drawer.Content className="harwick-shell-dark fixed inset-x-0 bottom-0 z-50 flex h-[92vh] max-w-[100vw] flex-col overflow-hidden rounded-t-[var(--panel-radius-lg)] border-t border-[color:var(--panel-line-strong)] bg-[color:var(--panel-1)] text-white outline-none">
            <Drawer.Title className="sr-only">Harwick</Drawer.Title>
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/14" aria-hidden="true" />
            {railBody}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  const style: React.CSSProperties = state.maximized
    ? { left: 24, right: 24, top: 24, bottom: 24, width: "auto", height: "auto" }
    : { left: state.x, bottom: state.y, width: state.w, height: state.h };

  return (
    <div
      ref={windowRef}
      role="complementary"
      aria-label="Harwick rail"
      className="harwick-shell-dark fixed z-50 flex flex-col overflow-hidden rounded-[var(--panel-radius-lg)] border border-[color:var(--panel-line-strong)] bg-[color:var(--panel-1)] text-white shadow-[0_24px_60px_-12px_rgba(0,0,0,0.6),0_4px_16px_-2px_rgba(0,0,0,0.4)]"
      style={style}
      onPointerDown={onPointerDown}
    >
      <div
        className="absolute -left-1 -top-1 z-10 size-4 cursor-nwse-resize rounded-tl-[10px]"
        onPointerDown={onResizePointerDown}
        aria-hidden="true"
      />
      {railBody}
    </div>
  );
}

export type { ProactiveCard } from "./use-proactive-feed";
