"use client";

import type { ProductUpdateEntry } from "@realty-ops/core";
import { AlertCircle, Settings, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { FacebookGlyph, InstagramGlyph, ListingGlyph, PhoneGlyph, SyncGlyph } from "../../components/harwick-icons";
import { WorkspaceTopbar } from "../../components/workspace-topbar";
import { cn } from "../../lib/utils";
import type { ActivityFilter, WorkspaceActivityEvent } from "./activity-data";

type ActivityDateFilter = "today" | "yesterday" | "7days" | "month";

type ActivityEventView = WorkspaceActivityEvent & {
  dateKey: "today" | "yesterday" | "older";
  dateLabel: string;
  timeLabel: string;
};

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

function ActivityIcon(props: { icon: WorkspaceActivityEvent["icon"]; error?: boolean }) {
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

function formatDateLabel(date: Date, now: Date): { dateKey: ActivityEventView["dateKey"]; dateLabel: string } {
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startEventDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((startToday - startEventDay) / (24 * 60 * 60 * 1000));
  const monthDay = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(date);

  if (diffDays === 0) {
    return { dateKey: "today", dateLabel: `Today · ${monthDay}` };
  }
  if (diffDays === 1) {
    return { dateKey: "yesterday", dateLabel: `Yesterday · ${monthDay}` };
  }
  if (diffDays > 1) {
    return { dateKey: "older", dateLabel: monthDay };
  }

  return { dateKey: "older", dateLabel: monthDay };
}

function mapActivityEventToView(event: WorkspaceActivityEvent, now: Date): ActivityEventView {
  const date = new Date(event.occurredAt);
  const { dateKey, dateLabel } = formatDateLabel(date, now);

  return {
    ...event,
    dateKey,
    dateLabel,
    timeLabel: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date),
  };
}

function formatUpdateDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function ProductUpdatesSection(props: { updates: ProductUpdateEntry[]; error: string | null }) {
  if (props.updates.length === 0 && props.error === null) {
    return null;
  }

  return (
    <section className="border-b border-border bg-surface px-7 py-5">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#EEE8FF] text-[#5740A8]">
          <Sparkles className="h-3.5 w-3.5" strokeWidth={1.8} />
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-subtle">Product updates</div>
          <div className="text-[13px] text-muted">Shipped changes from tags, deploys, and release notes.</div>
        </div>
      </div>

      {props.error === null ? null : (
        <div className="mb-3 rounded-[10px] border border-dashed border-border bg-background px-3 py-2 text-[11.5px] text-muted">
          Product updates are temporarily unavailable. {props.error}
        </div>
      )}

      <div className="grid gap-3 xl:grid-cols-2">
        {props.updates.map((update) => (
          <article className="rounded-[12px] border border-border bg-background px-4 py-3" key={update.tagName}>
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-subtle">
                {update.kind}
              </div>
              <div className="text-[13px] font-medium text-foreground">{update.title}</div>
              <div className="ml-auto text-[11px] text-muted-subtle">{formatUpdateDate(update.publishedAt)}</div>
            </div>
            <div className="mt-1 text-[12px] leading-[1.5] text-muted">{update.summary}</div>
            {update.highlights.length === 0 ? null : (
              <div className="mt-3 space-y-1.5">
                {update.highlights.slice(0, 3).map((highlight) => (
                  <div className="text-[11.5px] leading-[1.45] text-foreground" key={`${update.tagName}:${highlight.category}:${highlight.text}`}>
                    <span className="mr-1 uppercase tracking-[0.08em] text-muted-subtle">{highlight.category}</span>
                    {highlight.text}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-subtle">
              <span>{update.tagName}</span>
              {update.commitCount > 0 ? <span>{update.commitCount} commits</span> : null}
              {update.htmlUrl === null ? null : (
                <a className="text-foreground underline underline-offset-2" href={update.htmlUrl} rel="noreferrer" target="_blank">
                  View release
                </a>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function ActivityPageContent(props: {
  workspaceName: string;
  events: WorkspaceActivityEvent[];
  productUpdates: ProductUpdateEntry[];
  productUpdatesError: string | null;
}) {
  const [filterType, setFilterType] = useState<ActivityFilter>("all");
  const [dateFilter, setDateFilter] = useState<ActivityDateFilter>("today");
  const [errorsOnly, setErrorsOnly] = useState(false);

  const groupedEvents = useMemo(() => {
    const now = new Date();
    const visible = props.events.map((event) => mapActivityEventToView(event, now)).filter((event) => {
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

      const occurredAt = new Date(event.occurredAt).getTime();
      if (dateFilter === "7days") {
        return now.getTime() - occurredAt <= 7 * 24 * 60 * 60 * 1000;
      }

      if (dateFilter === "month") {
        return now.getFullYear() === new Date(event.occurredAt).getFullYear()
          && now.getMonth() === new Date(event.occurredAt).getMonth();
      }

      return true;
    });

    const groups = new Map<string, ActivityEventView[]>();
    for (const event of visible) {
      groups.set(event.dateLabel, [...(groups.get(event.dateLabel) ?? []), event]);
    }

    return Array.from(groups.entries()).map(([dateLabel, events]) => ({ dateLabel, events }));
  }, [dateFilter, errorsOnly, filterType, props.events]);

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

      <ProductUpdatesSection error={props.productUpdatesError} updates={props.productUpdates} />

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
        {groupedEvents.length === 0 ? (
          <div className="flex min-h-[240px] items-center justify-center rounded-[10px] border border-dashed border-border bg-surface/60 px-6 text-center">
            <div>
              <div className="text-[13px] font-medium text-foreground">No activity matches this view.</div>
              <div className="mt-1 text-[12px] text-muted-subtle">
                Real workspace events will appear here as leads, jobs, syncs, and provider checks run.
              </div>
            </div>
          </div>
        ) : null}

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
                  <div className="text-[12.5px] font-medium leading-[1.45] text-foreground">{event.title}</div>
                  {event.detail === null ? null : (
                    <div className="mt-0.5 text-[12px] leading-[1.45] text-muted">{event.detail}</div>
                  )}
                  <div className="mt-0.5 text-[11px] text-muted-subtle">{event.meta}</div>
                </div>
                <div className="shrink-0 pt-0.5 text-[11px] text-muted-subtle">{event.timeLabel}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
