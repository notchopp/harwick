"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  Check,
  CircleX,
  GitBranch,
  Inbox,
  Loader2,
  MessageSquareText,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { OwnerHomeQueueItem, OwnerHomeQueueKind, OwnerHomeQueuePriority } from "@realty-ops/core";
import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

export type QueueRowAction = "approve" | "mark_seen" | "dismiss" | "open";

type KindMeta = {
  icon: LucideIcon;
  iconClass: string;
  label: string;
};

const KIND_META: Record<OwnerHomeQueueKind, KindMeta> = {
  harwick: { icon: Bot, iconClass: "text-[var(--sage)]", label: "Harwick" },
  routing: { icon: GitBranch, iconClass: "text-[var(--clay)]", label: "Routing" },
  inbox: { icon: MessageSquareText, iconClass: "text-[#5A8DEF]", label: "Inbox" },
  operations: { icon: Wrench, iconClass: "text-[var(--oxblood)]", label: "Operations" },
  crm: { icon: AlertTriangle, iconClass: "text-[var(--clay)]", label: "CRM" },
};

function priorityPill(priority: OwnerHomeQueuePriority): { label: string; className: string; dotClass: string } {
  if (priority === "urgent") {
    return {
      label: "urgent",
      className: "border-[var(--oxblood)]/35 bg-[var(--oxblood-soft)] text-[var(--oxblood)]",
      dotClass: "bg-[var(--oxblood)]",
    };
  }
  if (priority === "high") {
    return {
      label: "high",
      className: "border-[var(--clay)]/35 bg-[var(--clay-soft)] text-[var(--clay)]",
      dotClass: "bg-[var(--clay)]",
    };
  }
  return {
    label: "normal",
    className: "border-white/[0.08] bg-white/[0.025] text-white/56",
    dotClass: "bg-white/24",
  };
}

function relativeTime(iso: string, nowMs: number): string {
  const diff = Math.max(0, nowMs - new Date(iso).getTime());
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

function ActionButton(props: {
  label: string;
  onClick: () => void;
  variant: "primary" | "ghost" | "danger";
  disabled?: boolean;
  busy?: boolean;
  icon?: ReactNode;
}) {
  const base = "inline-flex h-7 items-center justify-center gap-1 rounded-[7px] px-2.5 text-[11.5px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
  const variants = {
    primary: "border border-[var(--sage)]/40 bg-[var(--sage-soft)] text-[var(--sage)] hover:bg-[var(--sage-soft)]/80 hover:border-[var(--sage)]/60",
    ghost: "border border-white/[0.08] bg-white/[0.025] text-white/68 hover:border-white/[0.16] hover:bg-white/[0.05] hover:text-white",
    danger: "border border-[var(--oxblood)]/35 bg-transparent text-[var(--oxblood)] hover:bg-[var(--oxblood-soft)]/40",
  };
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        props.onClick();
      }}
      disabled={props.disabled || props.busy}
      className={cn(base, variants[props.variant])}
    >
      {props.busy ? <Loader2 className="size-3 animate-spin" aria-hidden="true" /> : props.icon ?? null}
      {props.busy ? "..." : props.label}
    </button>
  );
}

export function QueueRow(props: {
  item: OwnerHomeQueueItem;
  nowMs: number;
  enabled: boolean;
  busyAction: QueueRowAction | null;
  onAction: (action: QueueRowAction) => void;
  onOpenDetail?: () => void;
  onAssignRouting?: () => void;
}) {
  const meta = KIND_META[props.item.kind];
  const Icon = meta.icon;
  const priority = priorityPill(props.item.priority);
  const isHarwick = props.item.kind === "harwick";
  const interactive = props.onOpenDetail !== undefined;

  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={() => props.onOpenDetail?.()}
      onKeyDown={(event) => {
        if (props.onOpenDetail === undefined) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        props.onOpenDetail();
      }}
      className={cn(
        "group flex items-stretch gap-3 rounded-[12px] border border-white/[0.06] bg-gradient-to-b from-white/[0.025] to-white/[0.008] p-3 transition",
        "hover:border-white/[0.12] hover:from-white/[0.035] hover:to-white/[0.012]",
        interactive ? "cursor-pointer" : "",
      )}
    >
      {/* Priority indicator + kind icon column */}
      <div className="flex shrink-0 flex-col items-center gap-2 pt-0.5">
        <span className={cn("size-1.5 rounded-full", priority.dotClass)} aria-hidden="true" />
        <div className={cn("flex size-7 items-center justify-center rounded-[8px] border border-white/[0.06] bg-white/[0.02]", meta.iconClass)}>
          <Icon className="size-3.5" aria-hidden="true" />
        </div>
      </div>

      {/* Main content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 flex items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/40">{meta.label}</span>
              <span className={cn("rounded-full border px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-[0.08em]", priority.className)}>
                {priority.label}
              </span>
            </div>
            <div className="truncate text-[13px] font-semibold leading-5 text-white">{props.item.title}</div>
            <div className="mt-0.5 line-clamp-2 text-[11.5px] leading-4.5 text-white/56">{props.item.summary}</div>
          </div>
          <span className="shrink-0 font-mono text-[10px] text-white/36">{relativeTime(props.item.createdAt, props.nowMs)}</span>
        </div>

        {/* Action row */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {isHarwick ? (
            <>
              <ActionButton
                label="Approve"
                variant="primary"
                onClick={() => props.onAction("approve")}
                disabled={!props.enabled}
                busy={props.busyAction === "approve"}
                icon={<Check className="size-3" aria-hidden="true" />}
              />
              <ActionButton
                label="Mark seen"
                variant="ghost"
                onClick={() => props.onAction("mark_seen")}
                disabled={!props.enabled}
                busy={props.busyAction === "mark_seen"}
              />
              <ActionButton
                label="Dismiss"
                variant="danger"
                onClick={() => props.onAction("dismiss")}
                disabled={!props.enabled}
                busy={props.busyAction === "dismiss"}
                icon={<CircleX className="size-3" aria-hidden="true" />}
              />
              <a
                href={props.item.href}
                onClick={(event) => event.stopPropagation()}
                className="ml-auto inline-flex h-7 items-center justify-center gap-1 rounded-[7px] px-2.5 text-[11.5px] font-medium text-white/48 transition hover:text-white"
              >
                {props.item.actionLabel}
                <ArrowUpRight className="size-3" aria-hidden="true" />
              </a>
            </>
          ) : (
            <>
              {props.item.kind === "routing" && props.item.leadId !== null && props.onAssignRouting !== undefined ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    props.onAssignRouting?.();
                  }}
                  className="inline-flex h-7 items-center justify-center gap-1 rounded-[7px] border border-[var(--sage)]/35 bg-[var(--sage-soft)] px-2.5 text-[11.5px] font-semibold text-[var(--sage)] transition hover:bg-[var(--sage-soft)]/80"
                >
                  Assign agent
                  <ArrowUpRight className="size-3" aria-hidden="true" />
                </button>
              ) : (
                <a
                  href={props.item.href}
                  onClick={(event) => event.stopPropagation()}
                  className="inline-flex h-7 items-center justify-center gap-1 rounded-[7px] border border-[var(--sage)]/35 bg-[var(--sage-soft)] px-2.5 text-[11.5px] font-semibold text-[var(--sage)] transition hover:bg-[var(--sage-soft)]/80"
                >
                  {props.item.actionLabel}
                  <ArrowUpRight className="size-3" aria-hidden="true" />
                </a>
              )}
              {props.item.reason === null ? null : (
                <span className="text-[10.5px] text-white/40 line-clamp-1">
                  {props.item.reason}
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function EmptyQueueState({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[14px] border border-dashed border-white/[0.08] bg-white/[0.012] px-6 py-10 text-center">
      <Inbox className="size-5 text-white/28" aria-hidden="true" />
      <p className="text-[13px] font-medium text-white/68">{label}</p>
      {hint === undefined ? null : <p className="text-[11.5px] text-white/40">{hint}</p>}
    </div>
  );
}
