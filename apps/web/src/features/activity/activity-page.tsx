"use client";

import { AlertCircle, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { FacebookGlyph, InstagramGlyph, ListingGlyph, PhoneGlyph, SyncGlyph } from "../../components/harwick-icons";
import { WorkspaceTopbar } from "../../components/workspace-topbar";
import { cn } from "../../lib/utils";

type ActivityFilter = "all" | "lead" | "voice" | "social" | "fub" | "system";
type ActivityDateFilter = "today" | "yesterday" | "7days" | "month";

type ActivityEvent = {
  id: string;
  dateKey: "today" | "yesterday";
  dateLabel: string;
  time: string;
  type: ActivityFilter;
  icon: "instagram" | "facebook" | "voice" | "sync" | "system" | "lead" | "listing";
  summary: ReactNode;
  meta: string;
  error?: boolean;
};

const ACTIVITY_EVENTS: ActivityEvent[] = [
  {
    id: "act_1",
    dateKey: "today",
    dateLabel: "Today · April 29, 2026",
    time: "10:26 AM",
    type: "social",
    icon: "instagram",
    summary: (
      <>
        New lead <strong className="font-medium">Marcus Thompson</strong> created from Instagram comment on
        {" "}
        "4BR Coral Gables". Score: 87. Assigned to Sarah Kim.
      </>
    ),
    meta: "Lead · Instagram · Qualification job queued",
  },
  {
    id: "act_2",
    dateKey: "today",
    dateLabel: "Today · April 29, 2026",
    time: "10:08 AM",
    type: "voice",
    icon: "voice",
    summary: (
      <>
        Missed call from <strong className="font-medium">Diana Reyes</strong> (305-555-8821). Duration 0:42.
        Callback task created and assigned to Sarah Kim.
      </>
    ),
    meta: "Voice · Retell · Task ID: task_8821",
  },
  {
    id: "act_3",
    dateKey: "today",
    dateLabel: "Today · April 29, 2026",
    time: "9:14 AM",
    type: "fub",
    icon: "sync",
    summary: (
      <>
        FUB sync retry queued for <strong className="font-medium">Jordan Mills</strong>. Ownership conflict:
        Harwick shows Sarah Kim, FUB shows Unassigned. Manual resolution required.
      </>
    ),
    meta: "Follow Up Boss · Sync job fub_sync_mills · Retry #1",
  },
  {
    id: "act_4",
    dateKey: "today",
    dateLabel: "Today · April 29, 2026",
    time: "9:01 AM",
    type: "social",
    icon: "facebook",
    summary: (
      <>
        AI reply draft generated for <strong className="font-medium">Keisha Brown</strong> Facebook DM.
        Pending operator approval.
      </>
    ),
    meta: "Social · Facebook DM · OpenAI · Draft ID: draft_kb_04",
  },
  {
    id: "act_5",
    dateKey: "today",
    dateLabel: "Today · April 29, 2026",
    time: "8:50 AM",
    type: "system",
    icon: "system",
    summary: (
      <>
        Worker heartbeat confirmed. All jobs healthy. 3 qualification jobs completed, 1 FUB sync job queued.
      </>
    ),
    meta: "System · Worker health check · Interval: 5m",
  },
  {
    id: "act_6",
    dateKey: "yesterday",
    dateLabel: "Yesterday · April 28, 2026",
    time: "4:45 PM",
    type: "lead",
    icon: "lead",
    summary: (
      <>
        Lead <strong className="font-medium">Keisha Brown</strong> qualified and synced to Follow Up Boss.
        Stage: Hot Lead. Assigned to Marcus Lee.
      </>
    ),
    meta: "Lead · FUB sync · Score: 91",
  },
  {
    id: "act_7",
    dateKey: "yesterday",
    dateLabel: "Yesterday · April 28, 2026",
    time: "4:22 PM",
    type: "voice",
    icon: "voice",
    summary: (
      <>
        Unknown caller transferred to <strong className="font-medium">Diana Prince</strong> — investment routing
        rule matched. Call duration 2:55.
      </>
    ),
    meta: "Voice · Retell · Transfer · Rule: investment_intent",
  },
  {
    id: "act_8",
    dateKey: "yesterday",
    dateLabel: "Yesterday · April 28, 2026",
    time: "12:00 PM",
    type: "system",
    icon: "listing",
    summary: (
      <>
        Listing <strong className="font-medium">1847 Brickell Ave</strong> marked as needs recheck. Last
        verification was 8 days ago. Verify listing task created.
      </>
    ),
    meta: "Listing · Auto-scheduled recheck · Task: verify_brickell",
    error: true,
  },
  {
    id: "act_9",
    dateKey: "yesterday",
    dateLabel: "Yesterday · April 28, 2026",
    time: "8:00 AM",
    type: "fub",
    icon: "sync",
    summary: (
      <>
        Back-sync completed for <strong className="font-medium">Follow Up Boss</strong>. 12 contacts reconciled.
        0 conflicts. 2 stage updates pulled from FUB to Harwick.
      </>
    ),
    meta: "FUB · Back-sync job · Duration: 3.2s",
  },
];

function FilterChip(props: { active: boolean; children: string; onClick: () => void }) {
  return (
    <button
      className={cn(
        "rounded-full border border-border bg-transparent px-[11px] py-1 text-[11.5px] text-muted transition-colors hover:border-border-strong",
        props.active && "harwick-pill-active hover:border-harwick-ink hover:text-white",
      )}
      onClick={props.onClick}
      type="button"
    >
      {props.children}
    </button>
  );
}

function ActivityIcon(props: { icon: ActivityEvent["icon"]; error?: boolean }) {
  const baseClassName = cn(
    "flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px]",
    props.error && "ring-1 ring-oxblood/30",
  );

  if (props.icon === "instagram") {
    return (
      <div className={cn(baseClassName, "bg-[#F0E5F5] text-[#5B2D7B]")}>
        <InstagramGlyph className="h-[13px] w-[13px]" />
      </div>
    );
  }

  if (props.icon === "facebook") {
    return (
      <div className={cn(baseClassName, "bg-[#E5EBF5] text-[#1A3A6B]")}>
        <FacebookGlyph className="h-[13px] w-[13px]" />
      </div>
    );
  }

  if (props.icon === "voice") {
    return (
      <div className={cn(baseClassName, "bg-sage-soft text-qualified")}>
        <PhoneGlyph className="h-[13px] w-[13px]" />
      </div>
    );
  }

  if (props.icon === "sync") {
    return (
      <div className={cn(baseClassName, "bg-[#E5EBF5] text-[#1A3A6B]")}>
        <SyncGlyph className="h-[13px] w-[13px]" />
      </div>
    );
  }

  if (props.icon === "listing") {
    return (
      <div className={cn(baseClassName, "bg-clay-soft text-warm")}>
        <ListingGlyph className="h-[13px] w-[13px]" />
      </div>
    );
  }

  if (props.icon === "lead") {
    return (
      <div className={cn(baseClassName, "bg-brass-soft text-warm")}>
        <AlertCircle className="h-[13px] w-[13px]" strokeWidth={2} />
      </div>
    );
  }

  return (
    <div className={cn(baseClassName, "bg-[#E8E5DF] text-muted")}>
      <Settings className="h-[13px] w-[13px]" strokeWidth={2} />
    </div>
  );
}

export function ActivityPageContent(props: { workspaceName: string }) {
  const [filterType, setFilterType] = useState<ActivityFilter>("all");
  const [dateFilter, setDateFilter] = useState<ActivityDateFilter>("today");
  const [errorsOnly, setErrorsOnly] = useState(false);

  const groupedEvents = useMemo(() => {
    const visible = ACTIVITY_EVENTS.filter((event) => {
      if (filterType !== "all" && event.type !== filterType) {
        return false;
      }

      if (errorsOnly && !event.error) {
        return false;
      }

      if (dateFilter === "today") {
        return event.dateKey === "today";
      }

      if (dateFilter === "yesterday") {
        return event.dateKey === "yesterday";
      }

      return true;
    });

    return [
      {
        dateLabel: "Today · April 29, 2026",
        events: visible.filter((event) => event.dateKey === "today"),
      },
      {
        dateLabel: "Yesterday · April 28, 2026",
        events: visible.filter((event) => event.dateKey === "yesterday"),
      },
    ].filter((group) => group.events.length > 0);
  }, [dateFilter, errorsOnly, filterType]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <WorkspaceTopbar context="activity log" workspaceName={props.workspaceName}>
        <select
          className="ml-auto rounded-[8px] border border-border bg-surface px-[10px] py-[6px] text-[11.5px] outline-none"
          onChange={(event) => setFilterType(event.target.value as ActivityFilter)}
          value={filterType}
        >
          <option value="all">All types</option>
          <option value="lead">Lead events</option>
          <option value="voice">Voice</option>
          <option value="social">Social</option>
          <option value="fub">FUB sync</option>
          <option value="system">System</option>
        </select>
      </WorkspaceTopbar>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-surface px-7 py-3">
        <FilterChip active={dateFilter === "today"} onClick={() => setDateFilter("today")}>
          Today
        </FilterChip>
        <FilterChip active={dateFilter === "yesterday"} onClick={() => setDateFilter("yesterday")}>
          Yesterday
        </FilterChip>
        <FilterChip active={dateFilter === "7days"} onClick={() => setDateFilter("7days")}>
          Last 7 days
        </FilterChip>
        <FilterChip active={dateFilter === "month"} onClick={() => setDateFilter("month")}>
          This month
        </FilterChip>
        <div className="mx-1 h-[18px] w-px bg-border" />
        <FilterChip active={errorsOnly} onClick={() => setErrorsOnly((current) => !current)}>
          Errors only
        </FilterChip>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-7 pt-4">
        {groupedEvents.map((group) => (
          <div className="mb-[22px]" key={group.dateLabel}>
            <div className="mb-2 pl-0.5 text-[10px] uppercase tracking-[0.1em] text-muted-subtle">{group.dateLabel}</div>

            {group.events.map((event, index) => (
              <div
                className={cn("flex gap-[11px] border-b border-border py-[9px]", index === group.events.length - 1 && "border-b-0")}
                key={event.id}
              >
                <ActivityIcon error={event.error ?? false} icon={event.icon} />
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] leading-[1.45] text-foreground">{event.summary}</div>
                  <div className="mt-0.5 text-[11px] text-muted-subtle">{event.meta}</div>
                </div>
                <div className="shrink-0 pt-0.5 text-[11px] text-muted-subtle">{event.time}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
