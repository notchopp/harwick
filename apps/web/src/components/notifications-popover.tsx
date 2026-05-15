"use client";

import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCircle2,
  GitBranch,
  Inbox,
  MessageSquare,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { ScrollArea } from "./ui/scroll-area";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { cn } from "../lib/utils";

type NotificationKind = "work_item" | "routing" | "channel_mention" | "lead_task" | "subagent_complete";

type Notification = {
  id: string;
  kind: NotificationKind;
  title: string;
  subtitle: string | null;
  href: string;
  priority: "low" | "normal" | "high" | "urgent";
  createdAt: string;
};

const KIND_META: Record<NotificationKind, { Icon: LucideIcon; iconClass: string; label: string }> = {
  work_item: { Icon: Sparkles, iconClass: "text-[var(--sage)]", label: "Harwick" },
  routing: { Icon: GitBranch, iconClass: "text-[var(--clay)]", label: "Routing" },
  channel_mention: { Icon: MessageSquare, iconClass: "text-[#5A8DEF]", label: "Channel" },
  lead_task: { Icon: CalendarClock, iconClass: "text-[var(--sage)]", label: "Task" },
  subagent_complete: { Icon: CheckCircle2, iconClass: "text-[var(--sage)]", label: "Subagent" },
};

function priorityRing(priority: Notification["priority"]): string {
  if (priority === "urgent") return "ring-1 ring-inset ring-[var(--oxblood)]/40";
  if (priority === "high") return "ring-1 ring-inset ring-[var(--clay)]/30";
  return "";
}

function relativeTime(iso: string, now: number): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

function lastSeenStorageKey(workspaceId: string): string {
  return `harwick:notifications:last-seen:${workspaceId}`;
}

function readLastSeenAt(workspaceId: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(lastSeenStorageKey(workspaceId));
    if (raw === null) return 0;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

function writeLastSeenAt(workspaceId: string, ts: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(lastSeenStorageKey(workspaceId), String(ts));
  } catch {
    /* swallow */
  }
}

export function NotificationsPopover(props: {
  workspaceId: string;
  className?: string;
  darkTone: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [lastSeenAt, setLastSeenAt] = useState(() => readLastSeenAt(props.workspaceId));
  const [now, setNow] = useState(() => Date.now());

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await fetch(`/api/workspaces/${props.workspaceId}/notifications`, { cache: "no-store" });
      if (!response.ok) {
        setNotifications([]);
        setLoaded(true);
        return;
      }
      const payload = (await response.json()) as { notifications?: Notification[] };
      setNotifications(Array.isArray(payload.notifications) ? payload.notifications : []);
      setLoaded(true);
    } catch {
      setLoaded(true);
    }
  }, [props.workspaceId]);

  // Initial load + refresh every 60s while mounted so the badge stays fresh.
  useEffect(() => {
    void fetchNotifications();
    const interval = window.setInterval(() => {
      void fetchNotifications();
      setNow(Date.now());
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [fetchNotifications]);

  // Refetch on open so the operator always sees latest when they click.
  useEffect(() => {
    if (open) void fetchNotifications();
  }, [open, fetchNotifications]);

  const unreadCount = useMemo(() => {
    return notifications.filter((notification) => new Date(notification.createdAt).getTime() > lastSeenAt).length;
  }, [notifications, lastSeenAt]);

  function markAllSeen() {
    const ts = Date.now();
    writeLastSeenAt(props.workspaceId, ts);
    setLastSeenAt(ts);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      // Mark all as seen the moment the operator opens the popover — same
      // intent as a Slack-style read receipt; revisiting later starts clean.
      markAllSeen();
    }
  }

  const triggerClass = cn(
    "harwick-topbar-icon relative size-9 rounded-[10px]",
    props.darkTone
      ? "text-white/58 hover:bg-white/[0.04] hover:text-white"
      : "text-harwick-ink-soft hover:bg-harwick-linen hover:text-harwick-ink",
    props.className,
  );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              className={triggerClass}
              size="icon"
              variant="ghost"
              aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
            >
              <Bell aria-hidden="true" className="size-4" />
              {unreadCount > 0 ? (
                <span className="absolute right-1 top-1 flex min-w-3.5 items-center justify-center rounded-full bg-oxblood px-1 text-[9px] font-semibold leading-3.5 text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Notifications</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="harwick-shell-dark w-[360px] overflow-hidden rounded-[14px] border border-[color:var(--panel-line-strong)] bg-[color:var(--panel-1)] p-0 text-white shadow-[0_24px_60px_-12px_rgba(0,0,0,0.6)]"
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] bg-white/[0.02] px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/64">
            Notifications
            {unreadCount > 0 ? (
              <span className="ml-2 rounded-full bg-[var(--oxblood-soft)] px-1.5 py-0.5 text-[9.5px] font-semibold text-[var(--oxblood)]">{unreadCount} new</span>
            ) : null}
          </div>
          <a
            href="/queue"
            className="text-[10.5px] font-medium text-white/56 transition hover:text-white"
            onClick={() => setOpen(false)}
          >
            Open queue
          </a>
        </div>

        <ScrollArea className="max-h-[420px]">
          {loaded === false ? (
            <div className="flex items-center gap-2 px-4 py-6 text-[12px] text-white/52">
              Loading…
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <Inbox className="size-5 text-white/32" aria-hidden="true" />
              <p className="text-[12.5px] text-white/64">You're all clear — nothing pending.</p>
            </div>
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {notifications.map((notification) => {
                const meta = KIND_META[notification.kind];
                const Icon = meta.Icon;
                const isUnread = new Date(notification.createdAt).getTime() > lastSeenAt;
                return (
                  <li key={notification.id}>
                    <a
                      href={notification.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-start gap-3 px-3 py-2.5 transition hover:bg-white/[0.025]",
                        priorityRing(notification.priority),
                      )}
                    >
                      <div className={cn("relative mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-[8px] border border-white/[0.06] bg-white/[0.03]", meta.iconClass)}>
                        <Icon className="size-3.5" aria-hidden="true" />
                        {isUnread ? (
                          <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-[var(--oxblood)] ring-2 ring-[color:var(--panel-1)]" aria-hidden="true" />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[12.5px] font-semibold text-white">{notification.title}</span>
                          <span className="shrink-0 font-mono text-[10px] text-white/40">{relativeTime(notification.createdAt, now)}</span>
                        </div>
                        {notification.subtitle === null ? null : (
                          <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-4 text-white/64">{notification.subtitle}</p>
                        )}
                        <span className="mt-1 inline-block text-[9.5px] font-semibold uppercase tracking-[0.1em] text-white/48">
                          {meta.label}
                          {notification.priority === "urgent" || notification.priority === "high"
                            ? <span className={cn("ml-1.5 rounded-full px-1.5 py-0.5", notification.priority === "urgent" ? "bg-[var(--oxblood-soft)] text-[var(--oxblood)]" : "bg-[var(--clay-soft)] text-[var(--clay)]")}>
                                {notification.priority}
                              </span>
                            : null}
                        </span>
                      </div>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>

        {notifications.length === 0 ? null : (
          <div className="flex items-center justify-between border-t border-white/[0.06] bg-white/[0.015] px-3 py-2">
            <button
              type="button"
              onClick={markAllSeen}
              className="text-[10.5px] font-medium text-white/56 transition hover:text-white"
            >
              Mark all seen
            </button>
            <span className="font-mono text-[9.5px] text-white/32">{notifications.length} total</span>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// Used by AppShell to render the unread badge without opening the popover.
// AppShell currently expects a `notificationCount` prop; we still drive that
// from the server-fetched data so the badge stays in sync if a parent wants
// to display the count outside the popover surface.
export { AlertTriangle };
