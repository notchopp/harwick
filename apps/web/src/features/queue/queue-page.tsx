"use client";

import {
  OwnerHomeQueueResponseSchema,
  type OwnerHomeQueueItem,
  type OwnerHomeQueueKind,
  type OwnerHomeQueuePriority,
  type WorkspaceRole,
} from "@realty-ops/core";
import { ArrowRight, ChevronDown, History, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AppShell } from "../../components/app-shell";
import { cn } from "../../lib/utils";
import { EmptyQueueState, QueueRow, type QueueRowAction } from "./queue-row";
import { RoutingAssignSheet } from "./routing-assign-sheet";

type QueuePageProps = {
  workspaceId: string;
  workspaceName: string;
  operatorName: string;
  operatorRole: WorkspaceRole;
};

type SortMode = "priority" | "newest" | "oldest";

type KindFilter = "all" | OwnerHomeQueueKind;
type PriorityFilter = "all" | OwnerHomeQueuePriority;

type FilterState = {
  kind: KindFilter;
  priority: PriorityFilter;
  sort: SortMode;
};

type RoleLens = "manager" | "operator" | "agent" | "viewer";

function roleLensFor(role: WorkspaceRole): RoleLens {
  if (role === "owner" || role === "admin") return "manager";
  if (role === "team_lead" || role === "lead_manager") return "manager";
  if (role === "operator") return "operator";
  if (role === "viewer") return "viewer";
  return "agent";
}

function defaultFilters(role: WorkspaceRole): FilterState {
  const lens = roleLensFor(role);
  if (lens === "operator") return { kind: "operations", priority: "all", sort: "priority" };
  return { kind: "all", priority: "all", sort: "priority" };
}

const PRIORITY_WEIGHT: Record<OwnerHomeQueuePriority, number> = {
  urgent: 3,
  high: 2,
  normal: 1,
};

const KIND_LABELS: Record<OwnerHomeQueueKind, string> = {
  harwick: "Harwick",
  routing: "Routing",
  inbox: "Inbox",
  operations: "Operations",
  crm: "CRM",
};

const SORT_LABELS: Record<SortMode, string> = {
  priority: "Priority",
  newest: "Newest",
  oldest: "Oldest",
};

type Section = {
  id: string;
  label: string;
  hint: string;
  items: OwnerHomeQueueItem[];
};

function bucketItem(item: OwnerHomeQueueItem, nowMs: number): "now" | "week" | "backlog" {
  if (item.priority === "urgent") return "now";
  const dueMs = item.dueAt === null ? null : new Date(item.dueAt).getTime();
  if (dueMs !== null && dueMs - nowMs <= 24 * 60 * 60 * 1000) return "now";
  if (item.priority === "high") return "week";
  if (dueMs !== null && dueMs - nowMs <= 7 * 24 * 60 * 60 * 1000) return "week";
  return "backlog";
}

function sortItems(items: OwnerHomeQueueItem[], mode: SortMode): OwnerHomeQueueItem[] {
  const copy = [...items];
  if (mode === "priority") {
    copy.sort((a, b) => {
      const delta = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
      if (delta !== 0) return delta;
      return a.createdAt < b.createdAt ? 1 : -1;
    });
  } else if (mode === "newest") {
    copy.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  } else {
    copy.sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
  }
  return copy;
}

function FilterPill(props: {
  active: boolean;
  count?: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
        props.active
          ? "border-white/[0.18] bg-white text-[color:var(--panel-0)]"
          : "border-white/[0.08] bg-white/[0.025] text-white/68 hover:border-white/[0.16] hover:bg-white/[0.05] hover:text-white",
      )}
    >
      {props.label}
      {props.count === undefined ? null : (
        <span
          className={cn(
            "rounded-full px-1.5 py-0 font-mono text-[9.5px]",
            props.active ? "bg-black/12 text-[color:var(--panel-0)]/72" : "bg-white/[0.06] text-white/56",
          )}
        >
          {props.count}
        </span>
      )}
    </button>
  );
}

function SortDropdown(props: { value: SortMode; onChange: (next: SortMode) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.025] px-2.5 py-1 text-[11px] font-semibold text-white/72 transition hover:border-white/[0.16] hover:bg-white/[0.05] hover:text-white"
      >
        Sort: {SORT_LABELS[props.value]}
        <ChevronDown className="size-3" aria-hidden="true" />
      </button>
      {open ? (
        <div
          className="absolute right-0 top-full z-10 mt-1 w-32 overflow-hidden rounded-[10px] border border-[color:var(--panel-line-strong)] bg-[color:var(--panel-1)] py-1 shadow-[0_12px_30px_-8px_rgba(0,0,0,0.55)]"
          onMouseLeave={() => setOpen(false)}
        >
          {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                props.onChange(mode);
                setOpen(false);
              }}
              className={cn(
                "block w-full px-3 py-1.5 text-left text-[12px] transition",
                mode === props.value
                  ? "bg-white/[0.04] text-white"
                  : "text-white/72 hover:bg-white/[0.03] hover:text-white",
              )}
            >
              {SORT_LABELS[mode]}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SectionHead(props: { dotClass: string; label: string; count: number; hint: string }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className={cn("size-1.5 rounded-full", props.dotClass)} aria-hidden="true" />
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/64">
        {props.label}
      </span>
      <span className="rounded-full bg-white/[0.05] px-1.5 py-0 font-mono text-[10px] text-white/56">{props.count}</span>
      <span className="ml-2 truncate text-[10.5px] text-white/40">{props.hint}</span>
    </div>
  );
}

export function QueuePage(props: QueuePageProps) {
  const [items, setItems] = useState<OwnerHomeQueueItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(() => defaultFilters(props.operatorRole));
  const [busyRow, setBusyRow] = useState<{ id: string; action: QueueRowAction } | null>(null);
  const [showCleared, setShowCleared] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [assignTarget, setAssignTarget] = useState<{ leadId: string; leadName: string } | null>(null);

  const lens = roleLensFor(props.operatorRole);
  const enabled = props.operatorRole !== "viewer";
  const firstName = useMemo(() => props.operatorName.trim().split(/\s+/)[0] ?? props.operatorName, [props.operatorName]);

  const fetchQueue = useCallback(async () => {
    try {
      const response = await fetch(`/api/workspaces/${props.workspaceId}/queue`, { cache: "no-store" });
      if (!response.ok) {
        setError(`Queue request failed (${response.status}).`);
        setLoaded(true);
        return;
      }
      const payload: unknown = await response.json();
      const parsed = OwnerHomeQueueResponseSchema.safeParse(payload);
      if (!parsed.success) {
        setError("Queue response failed schema validation.");
        setLoaded(true);
        return;
      }
      setItems(parsed.data.items);
      setError(null);
      setLoaded(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load the queue.");
      setLoaded(true);
    }
  }, [props.workspaceId]);

  useEffect(() => {
    void fetchQueue();
    const interval = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, [fetchQueue]);

  async function manualRefresh() {
    setRefreshing(true);
    await fetchQueue();
    setRefreshing(false);
  }

  // Apply role + filter pills to the master list before sectioning.
  const visibleItems = useMemo(() => {
    let pool = items;
    if (filters.kind !== "all") {
      pool = pool.filter((item) => item.kind === filters.kind);
    }
    if (filters.priority !== "all") {
      pool = pool.filter((item) => item.priority === filters.priority);
    }
    return sortItems(pool, filters.sort);
  }, [items, filters]);

  const counts = useMemo(() => {
    const byKind = new Map<OwnerHomeQueueKind, number>();
    const byPriority = new Map<OwnerHomeQueuePriority, number>();
    for (const item of items) {
      byKind.set(item.kind, (byKind.get(item.kind) ?? 0) + 1);
      byPriority.set(item.priority, (byPriority.get(item.priority) ?? 0) + 1);
    }
    return { byKind, byPriority, total: items.length };
  }, [items]);

  const sections: Section[] = useMemo(() => {
    const buckets: Record<"now" | "week" | "backlog", OwnerHomeQueueItem[]> = {
      now: [],
      week: [],
      backlog: [],
    };
    for (const item of visibleItems) {
      buckets[bucketItem(item, nowMs)].push(item);
    }
    return [
      { id: "now", label: "Needs you now", hint: "Urgent + due in the next 24 hours", items: buckets.now },
      { id: "week", label: "This week", hint: "High priority or due in 7 days", items: buckets.week },
      { id: "backlog", label: "Backlog", hint: "Everything else", items: buckets.backlog },
    ];
  }, [visibleItems, nowMs]);

  async function runHarwickAction(item: OwnerHomeQueueItem, action: QueueRowAction) {
    if (!item.id.startsWith("harwick:")) return;
    const workItemId = item.id.slice("harwick:".length);
    setBusyRow({ id: item.id, action });
    setActionStatus(null);
    try {
      const body = action === "approve"
        ? { action: "approve", feedbackLabel: "useful" }
        : action === "mark_seen"
          ? { action: "mark_seen", feedbackLabel: "useful" }
          : { action: "dismiss", feedbackLabel: "not_relevant" };
      const response = await fetch(`/api/workspaces/${item.workspaceId}/harwick-work-items/${workItemId}/action`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        // Optimistic remove — re-fetch in the background to sync with server.
        setItems((current) => current.filter((existing) => existing.id !== item.id));
        setActionStatus(action === "approve" ? "Approved." : action === "mark_seen" ? "Marked seen." : "Dismissed.");
        void fetchQueue();
      } else {
        setActionStatus("The backend rejected this action.");
      }
    } catch (actionError) {
      setActionStatus(actionError instanceof Error ? actionError.message : "Action failed.");
    } finally {
      setBusyRow(null);
    }
  }

  const greeting = lens === "manager"
    ? `${firstName}, every decision Harwick couldn't auto-clear lives here.`
    : lens === "operator"
      ? `${firstName}, integrations + ops failures first. Lead-level work is filtered out by default.`
      : lens === "viewer"
        ? `${firstName}, read-only view of everything you can see.`
        : `${firstName}, your replies, callbacks, and follow-ups in one place.`;

  return (
    <AppShell
      activeItem="Queue"
      memberName={props.operatorName}
      memberRole={props.operatorRole}
      operatorRole={props.operatorRole}
      title="Queue"
      tone="dashboardDark"
      workspaceId={props.workspaceId}
      workspaceName={props.workspaceName}
    >
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-5 py-7 md:px-8 md:py-9 xl:pr-[26rem]">
        {/* Header */}
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.06] pb-5">
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/36">{props.workspaceName}</p>
            <h1 className="font-display text-[28px] leading-none tracking-[-0.015em] text-white">Queue</h1>
            <p className="max-w-[34rem] text-[13px] leading-5 text-white/56">{greeting}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/[0.08] bg-white/[0.025] px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/68">
              {counts.total} open
            </span>
            {counts.byPriority.get("urgent") === undefined || counts.byPriority.get("urgent") === 0 ? null : (
              <span className="rounded-full border border-[var(--oxblood)]/35 bg-[var(--oxblood-soft)] px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[var(--oxblood)]">
                {counts.byPriority.get("urgent")} urgent
              </span>
            )}
            <button
              type="button"
              onClick={() => void manualRefresh()}
              disabled={refreshing}
              className="inline-flex size-8 items-center justify-center rounded-[8px] border border-white/[0.08] bg-white/[0.025] text-white/64 transition hover:border-white/[0.16] hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
              aria-label="Refresh queue"
            >
              <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* Filter pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterPill
            label="All"
            count={counts.total}
            active={filters.kind === "all"}
            onClick={() => setFilters((current) => ({ ...current, kind: "all" }))}
          />
          {(Object.keys(KIND_LABELS) as OwnerHomeQueueKind[])
            .filter((kind) => (counts.byKind.get(kind) ?? 0) > 0)
            .map((kind) => (
              <FilterPill
                key={kind}
                label={KIND_LABELS[kind]}
                count={counts.byKind.get(kind) ?? 0}
                active={filters.kind === kind}
                onClick={() => setFilters((current) => ({ ...current, kind: current.kind === kind ? "all" : kind }))}
              />
            ))}
          <span className="mx-1 h-3 w-px bg-white/[0.08]" aria-hidden="true" />
          {(["urgent", "high", "normal"] as OwnerHomeQueuePriority[])
            .filter((priority) => (counts.byPriority.get(priority) ?? 0) > 0)
            .map((priority) => (
              <FilterPill
                key={priority}
                label={priority}
                count={counts.byPriority.get(priority) ?? 0}
                active={filters.priority === priority}
                onClick={() => setFilters((current) => ({ ...current, priority: current.priority === priority ? "all" : priority }))}
              />
            ))}
          <div className="ml-auto">
            <SortDropdown value={filters.sort} onChange={(sort) => setFilters((current) => ({ ...current, sort }))} />
          </div>
        </div>

        {/* Status banner */}
        {actionStatus === null ? null : (
          <div className="rounded-[10px] border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-[12px] text-white/72">
            {actionStatus}
          </div>
        )}
        {error === null ? null : (
          <div className="rounded-[10px] border border-[var(--oxblood)]/35 bg-[var(--oxblood-soft)] px-3 py-2 text-[12px] text-[var(--oxblood)]">
            {error}
          </div>
        )}

        {/* Sections */}
        {loaded === false ? (
          <div className="space-y-2.5">
            <div className="h-[88px] animate-pulse rounded-[12px] border border-white/[0.06] bg-white/[0.02]" />
            <div className="h-[88px] animate-pulse rounded-[12px] border border-white/[0.06] bg-white/[0.02]" />
            <div className="h-[88px] animate-pulse rounded-[12px] border border-white/[0.06] bg-white/[0.02]" />
          </div>
        ) : visibleItems.length === 0 ? (
          <EmptyQueueState
            label={filters.kind === "all" && filters.priority === "all"
              ? "Queue is clear. Nothing pending your attention."
              : "No items match these filters."}
            {...(filters.kind === "all" && filters.priority === "all"
              ? {}
              : { hint: "Try widening — turn off priority + kind to see everything." })}
          />
        ) : (
          <div className="space-y-7">
            {sections.map((section) => {
              if (section.items.length === 0) return null;
              const dotClass = section.id === "now"
                ? "bg-[var(--oxblood)]"
                : section.id === "week"
                  ? "bg-[var(--clay)]"
                  : "bg-white/24";
              return (
                <section key={section.id}>
                  <SectionHead
                    dotClass={dotClass}
                    label={section.label}
                    count={section.items.length}
                    hint={section.hint}
                  />
                  <div className="space-y-2">
                    {section.items.map((item) => (
                      <QueueRow
                        key={item.id}
                        item={item}
                        nowMs={nowMs}
                        enabled={enabled}
                        busyAction={busyRow?.id === item.id ? busyRow.action : null}
                        onAction={(action) => {
                          if (item.kind === "harwick") {
                            void runHarwickAction(item, action);
                          } else if (action === "open") {
                            window.location.href = item.href;
                          }
                        }}
                        {...(item.kind === "routing" && item.leadId !== null
                          ? {
                              onAssignRouting: () => {
                                setAssignTarget({
                                  leadId: item.leadId as string,
                                  leadName: item.title.replace(/^Route\s+/i, "").replace(/\s+to.*$/i, "") || "this lead",
                                });
                              },
                            }
                          : {})}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {/* Recently cleared — collapsible. Stub for now; the historical query
            lands when we move the timeline data into its own endpoint. */}
        <details
          className="mt-2 rounded-[12px] border border-white/[0.05] bg-white/[0.012] px-4 py-3"
          open={showCleared}
          onToggle={(event) => setShowCleared((event.target as HTMLDetailsElement).open)}
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 text-[11.5px] font-semibold text-white/64">
            <History className="size-3.5" aria-hidden="true" />
            Recently cleared
            <ArrowRight className={cn("ml-auto size-3 transition", showCleared && "rotate-90")} aria-hidden="true" />
          </summary>
          <div className="mt-3 text-[11.5px] leading-5 text-white/52">
            History view coming next. For now, /activity has the full audit trail of cleared items.
            <a href="/activity" className="ml-1 text-white/72 underline-offset-2 hover:underline">
              Open activity
            </a>
          </div>
        </details>
      </main>
      {assignTarget !== null ? (
        <RoutingAssignSheet
          open={assignTarget !== null}
          onOpenChange={(open) => {
            if (!open) setAssignTarget(null);
          }}
          workspaceId={props.workspaceId}
          leadId={assignTarget.leadId}
          leadName={assignTarget.leadName}
          onAssigned={() => {
            void fetchQueue();
            setActionStatus("Lead routed.");
          }}
        />
      ) : null}
    </AppShell>
  );
}
