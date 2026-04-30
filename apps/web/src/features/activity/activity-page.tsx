"use client";

import { useState } from "react";
import { AlertCircle, Zap, Share2, Repeat2, Settings } from "lucide-react";
import { cn } from "../../lib/utils";

type EventType = "lead" | "voice" | "social" | "fub" | "system" | "assign";

type ActivityEvent = {
  id: string;
  type: EventType;
  date: string;
  timestamp: string;
  title: string;
  description?: string;
  error?: boolean;
};

const MOCK_EVENTS: ActivityEvent[] = [
  {
    id: "evt_1",
    type: "lead",
    date: "Today",
    timestamp: "3:14 PM",
    title: "Marcus Thompson <strong>qualified</strong> as a buyer",
    description: "Credit score verified, pre-approved for $1.8M",
  },
  {
    id: "evt_2",
    type: "social",
    date: "Today",
    timestamp: "2:47 PM",
    title: "Instagram comment from <strong>Marcus Thompson</strong>",
    description: '"Is this still available? We\'ve been looking..."',
  },
  {
    id: "evt_3",
    type: "voice",
    date: "Today",
    timestamp: "12:33 PM",
    title: "<strong>Voice call</strong> with Diana Reyes (23m)",
    description: "Interested in Coral Gables properties, open to viewings",
  },
  {
    id: "evt_4",
    type: "fub",
    date: "Today",
    timestamp: "11:02 AM",
    title: "Synced <strong>3 leads</strong> to Follow Up Boss",
  },
  {
    id: "evt_5",
    type: "assign",
    date: "Yesterday",
    timestamp: "4:52 PM",
    title: "Keisha Brown <strong>assigned</strong> to Sarah Kim",
  },
  {
    id: "evt_6",
    type: "system",
    date: "Yesterday",
    timestamp: "2:15 PM",
    title: "<strong>System update:</strong> Lead scoring v2.1 deployed",
    error: true,
  },
];

const EVENT_TYPE_COLORS: Record<
  EventType,
  {
    icon: string;
    label: string;
    bg: string;
  }
> = {
  lead: {
    icon: "ld",
    label: "Lead events",
    bg: "bg-amber-100",
  },
  voice: {
    icon: "vc",
    label: "Voice",
    bg: "bg-green-100",
  },
  social: {
    icon: "so",
    label: "Social",
    bg: "bg-purple-100",
  },
  fub: {
    icon: "fu",
    label: "FUB sync",
    bg: "bg-blue-100",
  },
  system: {
    icon: "sy",
    label: "System",
    bg: "bg-gray-100",
  },
  assign: {
    icon: "as",
    label: "Assignment",
    bg: "bg-amber-100",
  },
};

function ActivityIcon({ type, error }: { type: EventType; error?: boolean }) {
  const config = EVENT_TYPE_COLORS[type];
  const Icon =
    type === "lead"
      ? AlertCircle
      : type === "voice"
        ? Zap
        : type === "social"
          ? Share2
          : type === "fub"
            ? Repeat2
            : type === "assign"
              ? AlertCircle
              : Settings;

  const textColor =
    type === "lead" || type === "assign"
      ? "text-amber-700"
      : type === "voice"
        ? "text-green-700"
        : type === "social"
          ? "text-purple-700"
          : type === "fub"
            ? "text-blue-700"
            : "text-gray-700";

  return (
    <div className={cn("flex h-8 w-8 items-center justify-center rounded-full", config.bg, error && "ring-1 ring-red-300")}>
      <Icon className={cn("h-4 w-4", textColor)} />
    </div>
  );
}

export function ActivityPageContent() {
  const [filterType, setFilterType] = useState<"all" | EventType>("all");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "7days" | "month">("all");
  const [errorsOnly, setErrorsOnly] = useState(false);

  const filteredEvents = MOCK_EVENTS.filter((event) => {
    if (filterType !== "all" && event.type !== filterType) return false;
    if (errorsOnly && !event.error) return false;
    return true;
  });

  const groupedByDate = filteredEvents.reduce(
    (acc, event) => {
      const date = event.date;
      if (!acc[date]) acc[date] = [];
      acc[date].push(event);
      return acc;
    },
    {} as Record<string, ActivityEvent[]>
  );

  return (
    <div className="flex flex-col overflow-hidden bg-background">
      {/* Topbar */}
      <div className="h-[58px] border-b border-border bg-surface px-8 flex items-center gap-4 flex-shrink-0">
        <span className="font-display text-[19px] font-medium">Activity Log</span>
        <select
          value={filterType === "all" ? "all" : filterType}
          onChange={(e) => setFilterType(e.target.value === "all" ? "all" : (e.target.value as EventType))}
          className="ml-auto text-[12px] rounded-lg border border-border bg-surface px-2.5 py-1.5 font-medium text-foreground hover:border-border-strong focus:outline-none"
        >
          <option value="all">All types</option>
          <option value="lead">Lead events</option>
          <option value="voice">Voice</option>
          <option value="social">Social</option>
          <option value="fub">FUB sync</option>
          <option value="system">System</option>
        </select>
      </div>

      {/* Filter Row */}
      <div className="flex items-center gap-4 border-b border-border bg-surface px-8 py-3 flex-shrink-0">
        <div className="flex gap-2">
          {(["all", "today", "7days", "month"] as const).map((range) => (
            <button
              key={range}
              onClick={() => setDateFilter(range)}
              className={cn(
                "rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors",
                dateFilter === range ? "bg-foreground text-background" : "bg-transparent text-foreground hover:text-foreground"
              )}
            >
              {range === "all" ? "All" : range === "today" ? "Today" : range === "7days" ? "Last 7 days" : "This month"}
            </button>
          ))}
        </div>

        <div className="flex gap-2 ml-auto">
          <button
            onClick={() => setErrorsOnly(!errorsOnly)}
            className={cn(
              "rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors",
              errorsOnly ? "bg-red-100 text-red-700" : "bg-transparent text-foreground hover:text-foreground"
            )}
          >
            Errors only
          </button>
        </div>
      </div>

      {/* Activity Timeline */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {Object.entries(groupedByDate).map(([date, events]) => (
          <div key={date} className="mb-8">
            {/* Day Label */}
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted mb-4">
              {date} · April 29, 2026
            </div>

            {/* Activity Items */}
            <div className="space-y-3 ml-4">
              {events.map((event) => (
                <div key={event.id} className="flex gap-4">
                  {/* Icon */}
                  <div className="flex-shrink-0 pt-0.5">
                    <ActivityIcon type={event.type} {...(event.error && { error: event.error })} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div
                          className="text-[12.5px] leading-[1.5] text-foreground"
                          dangerouslySetInnerHTML={{ __html: event.title }}
                        />
                        {event.description && <div className="text-[11px] text-muted mt-0.5">{event.description}</div>}
                      </div>
                      <span className="text-[11px] text-muted flex-shrink-0 whitespace-nowrap">{event.timestamp}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
