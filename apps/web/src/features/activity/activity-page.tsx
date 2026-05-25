"use client";

import type { ProductUpdateEntry } from "@realty-ops/core";
import { useMemo, useState } from "react";
import {
  PiBrainFill,
  PiBuildingApartmentFill,
  PiFacebookLogoFill,
  PiGearSixFill,
  PiInstagramLogoFill,
  PiListChecksFill,
  PiPhoneFill,
  PiSparkleFill,
  PiUserCircleFill,
  PiWarningCircleFill,
} from "react-icons/pi";

import { Card, Section, Shell } from "../../components/panels/panels";
import { MicroLabel, MonoTag } from "../../components/panels/typography";
import { cn } from "../../lib/utils";
import type {
  ActivityFilter,
  ActivitySourceFilter,
  WorkspaceActivityEvent,
} from "./activity-data";

type ActivityDateFilter = "today" | "yesterday" | "7days" | "month" | "all";

type ActivityEventView = WorkspaceActivityEvent & {
  dateKey: "today" | "yesterday" | "older";
  dateLabel: string;
  timeLabel: string;
};

function FilterChip(props: { active: boolean; children: string; onClick: () => void }) {
  return (
    <button
      className={cn(
        "rounded-full border px-3 py-1 text-[11.5px] font-medium transition-colors",
        "border-[color:var(--panel-line)] bg-[color:var(--panel-2)] text-[color:var(--graphite-text-muted)]",
        "hover:border-[color:var(--panel-line-strong)] hover:text-[color:var(--graphite-text)]",
        props.active &&
          "border-[color:var(--graphite-text)] bg-[color:var(--graphite-text)] text-[color:var(--panel-1)] hover:border-[color:var(--graphite-text)] hover:text-[color:var(--panel-1)]",
      )}
      onClick={props.onClick}
      type="button"
    >
      {props.children}
    </button>
  );
}

function ActivityIcon({ icon, error }: { icon: WorkspaceActivityEvent["icon"]; error?: boolean }) {
  const baseClass = cn(
    "inline-flex size-7 shrink-0 items-center justify-center rounded-[8px]",
    error === true && "ring-1 ring-[color:var(--oxblood)]/40",
  );
  const iconClass = "size-3.5";

  if (icon === "instagram") {
    return (
      <span className={cn(baseClass, "bg-[color:var(--panel-3)] text-[color:var(--clay)]")}>
        <PiInstagramLogoFill aria-hidden="true" className={iconClass} />
      </span>
    );
  }
  if (icon === "facebook") {
    return (
      <span className={cn(baseClass, "bg-[color:var(--panel-3)] text-[color:var(--harwick-brass)]")}>
        <PiFacebookLogoFill aria-hidden="true" className={iconClass} />
      </span>
    );
  }
  if (icon === "voice") {
    return (
      <span className={cn(baseClass, "bg-[color:var(--sage-soft)] text-[color:var(--sage)]")}>
        <PiPhoneFill aria-hidden="true" className={iconClass} />
      </span>
    );
  }
  if (icon === "sync") {
    return (
      <span className={cn(baseClass, "bg-[color:var(--panel-3)] text-[color:var(--graphite-text)]")}>
        <PiListChecksFill aria-hidden="true" className={iconClass} />
      </span>
    );
  }
  if (icon === "listing") {
    return (
      <span className={cn(baseClass, "bg-[color:var(--clay-soft)] text-[color:var(--clay)]")}>
        <PiBuildingApartmentFill aria-hidden="true" className={iconClass} />
      </span>
    );
  }
  if (icon === "lead") {
    return (
      <span className={cn(baseClass, "bg-[color:var(--harwick-brass-soft)] text-[color:var(--harwick-brass)]")}>
        <PiUserCircleFill aria-hidden="true" className={iconClass} />
      </span>
    );
  }
  if (icon === "harwick") {
    return (
      <span className={cn(baseClass, "bg-[color:var(--sage-soft)] text-[color:var(--sage)]")}>
        <PiBrainFill aria-hidden="true" className={iconClass} />
      </span>
    );
  }
  return (
    <span className={cn(baseClass, "bg-[color:var(--panel-3)] text-[color:var(--graphite-text-muted)]")}>
      <PiGearSixFill aria-hidden="true" className={iconClass} />
    </span>
  );
}

function formatDateLabel(date: Date, now: Date): { dateKey: ActivityEventView["dateKey"]; dateLabel: string } {
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startEventDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((startToday - startEventDay) / (24 * 60 * 60 * 1000));
  const monthDay = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(date);

  if (diffDays === 0) return { dateKey: "today", dateLabel: `Today · ${monthDay}` };
  if (diffDays === 1) return { dateKey: "yesterday", dateLabel: `Yesterday · ${monthDay}` };
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
  if (props.updates.length === 0 && props.error === null) return null;

  return (
    <Section
      eyebrow="shipped"
      title={
        <span className="flex items-center gap-2">
          <span className="inline-flex size-5 items-center justify-center rounded-[6px] bg-[color:var(--panel-3)] text-[color:var(--graphite-text-muted)]">
            <PiSparkleFill aria-hidden="true" className="size-3" />
          </span>
          product updates
        </span>
      }
      bodyClassName="p-3"
    >
      {props.error === null ? null : (
        <div className="mb-3 rounded-[10px] border border-dashed border-[color:var(--panel-line)] bg-[color:var(--panel-3)] px-3 py-2 text-[11.5px] text-[color:var(--graphite-text-muted)]">
          product updates are temporarily unavailable. {props.error}
        </div>
      )}
      <div className="grid gap-3 xl:grid-cols-2">
        {props.updates.map((update) => (
          <Card className="p-4" key={update.tagName}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-[color:var(--panel-3)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--graphite-text-muted)]">
                {update.kind}
              </span>
              <div className="text-[13px] font-semibold text-[color:var(--graphite-text)]">{update.title}</div>
              <div className="ml-auto"><MonoTag>{formatUpdateDate(update.publishedAt)}</MonoTag></div>
            </div>
            <div className="mt-1.5 text-[12.5px] leading-[1.55] text-[color:var(--graphite-text-muted)]">{update.summary}</div>
            {update.highlights.length === 0 ? null : (
              <div className="mt-3 space-y-1.5">
                {update.highlights.slice(0, 3).map((highlight) => (
                  <div
                    className="text-[11.5px] leading-[1.5] text-[color:var(--graphite-text)]"
                    key={`${update.tagName}:${highlight.category}:${highlight.text}`}
                  >
                    <span className="mr-1 uppercase tracking-[0.08em] text-[color:var(--graphite-text-faint)]">
                      {highlight.category}
                    </span>
                    {highlight.text}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 flex items-center gap-3 text-[11px] text-[color:var(--graphite-text-faint)]">
              <MonoTag>{update.tagName}</MonoTag>
              {update.commitCount > 0 ? <span>{update.commitCount} commits</span> : null}
              {update.htmlUrl === null ? null : (
                <a
                  className="text-[color:var(--graphite-text)] underline underline-offset-2 hover:text-[color:var(--sage)]"
                  href={update.htmlUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  view release
                </a>
              )}
            </div>
          </Card>
        ))}
      </div>
    </Section>
  );
}

const SOURCE_LABELS: Record<ActivitySourceFilter, string> = {
  all: "all sources",
  ai: "harwick",
  operator: "operators",
  system: "system",
};

const TYPE_LABELS: Record<ActivityFilter, string> = {
  all: "All types",
  harwick: "Harwick turns",
  lead: "Lead events",
  voice: "Voice",
  social: "Social",
  fub: "FUB sync",
  system: "System",
};

const DATE_LABELS: Record<ActivityDateFilter, string> = {
  today: "today",
  yesterday: "yesterday",
  "7days": "last 7 days",
  month: "this month",
  all: "all time",
};

export function ActivityPageContent(props: {
  workspaceName: string;
  events: WorkspaceActivityEvent[];
  productUpdates: ProductUpdateEntry[];
  productUpdatesError: string | null;
}) {
  const [filterType, setFilterType] = useState<ActivityFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<ActivitySourceFilter>("all");
  const [dateFilter, setDateFilter] = useState<ActivityDateFilter>("7days");
  const [errorsOnly, setErrorsOnly] = useState(false);

  const groupedEvents = useMemo(() => {
    const now = new Date();
    const visible = props.events
      .map((event) => mapActivityEventToView(event, now))
      .filter((event) => {
        if (filterType !== "all" && event.type !== filterType) return false;
        if (sourceFilter !== "all" && event.source !== sourceFilter) return false;
        if (errorsOnly && !event.error) return false;
        if (dateFilter === "today") return event.dateKey === "today";
        if (dateFilter === "yesterday") return event.dateKey === "yesterday";
        const occurredAt = new Date(event.occurredAt).getTime();
        if (dateFilter === "7days") return now.getTime() - occurredAt <= 7 * 24 * 60 * 60 * 1000;
        if (dateFilter === "month") {
          return (
            now.getFullYear() === new Date(event.occurredAt).getFullYear() &&
            now.getMonth() === new Date(event.occurredAt).getMonth()
          );
        }
        return true;
      });

    const groups = new Map<string, ActivityEventView[]>();
    for (const event of visible) {
      groups.set(event.dateLabel, [...(groups.get(event.dateLabel) ?? []), event]);
    }
    return Array.from(groups.entries()).map(([dateLabel, events]) => ({ dateLabel, events }));
  }, [dateFilter, errorsOnly, filterType, props.events, sourceFilter]);

  const totalShown = groupedEvents.reduce((sum, group) => sum + group.events.length, 0);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-[color:var(--panel-1)] text-[color:var(--graphite-text)]">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[color:var(--panel-line-soft)] px-5 py-4 md:px-6 md:py-5">
        <div>
          <MicroLabel>{props.workspaceName} · activity</MicroLabel>
          <h1 className="mt-1 font-display text-[28px] font-semibold leading-[1.02] tracking-[-0.025em] text-[color:var(--graphite-text)] md:text-[42px]">
            everything that happened
          </h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-[1.55] text-[color:var(--graphite-text-muted)]">
            a single timeline of harwick turns, workflow jobs, integration syncs, and operator actions — newest first.
            filter to find the one event that mattered.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MonoTag>{totalShown} shown</MonoTag>
          <select
            className="rounded-[8px] border border-[color:var(--panel-line)] bg-[color:var(--panel-2)] px-2 py-1.5 text-[11.5px] text-[color:var(--graphite-text)] outline-none focus:border-[color:var(--panel-line-strong)]"
            onChange={(event) => setFilterType(event.target.value as ActivityFilter)}
            value={filterType}
          >
            {(Object.keys(TYPE_LABELS) as ActivityFilter[]).map((key) => (
              <option key={key} value={key}>
                {TYPE_LABELS[key]}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="space-y-4 px-5 py-4 md:px-6 md:py-5">
        <ProductUpdatesSection error={props.productUpdatesError} updates={props.productUpdates} />

        <Shell className="px-3 py-3" tone="flat">
          <div className="flex flex-wrap items-center gap-2">
            <MicroLabel className="mr-1 normal-case tracking-[0.06em]">source</MicroLabel>
            {(Object.keys(SOURCE_LABELS) as ActivitySourceFilter[]).map((key) => (
              <FilterChip active={sourceFilter === key} key={key} onClick={() => setSourceFilter(key)}>
                {SOURCE_LABELS[key]}
              </FilterChip>
            ))}
            <span className="mx-1 hidden h-4 w-px bg-[color:var(--panel-line)] md:inline-block" />
            <MicroLabel className="mr-1 normal-case tracking-[0.06em]">when</MicroLabel>
            {(Object.keys(DATE_LABELS) as ActivityDateFilter[]).map((key) => (
              <FilterChip active={dateFilter === key} key={key} onClick={() => setDateFilter(key)}>
                {DATE_LABELS[key]}
              </FilterChip>
            ))}
            <span className="ml-auto" />
            <FilterChip active={errorsOnly} onClick={() => setErrorsOnly((current) => !current)}>
              errors only
            </FilterChip>
          </div>
        </Shell>

        {groupedEvents.length === 0 ? (
          <Shell className="px-6 py-12" tone="flat">
            <div className="mx-auto flex max-w-md flex-col items-center text-center">
              <span className="inline-flex size-12 items-center justify-center rounded-[14px] bg-[color:var(--panel-3)] text-[color:var(--graphite-text-muted)]">
                <PiListChecksFill aria-hidden="true" className="size-5" />
              </span>
              <h2 className="mt-4 font-display text-[20px] font-semibold tracking-[-0.015em] text-[color:var(--graphite-text)]">
                nothing matches this view
              </h2>
              <p className="mt-2 text-[13px] leading-[1.55] text-[color:var(--graphite-text-muted)]">
                widen the date range or clear filters. real workspace events appear here as leads, jobs, syncs, and
                provider checks run.
              </p>
            </div>
          </Shell>
        ) : (
          groupedEvents.map((group) => (
            <Section
              eyebrow={`${group.events.length} ${group.events.length === 1 ? "event" : "events"}`}
              key={group.dateLabel}
              title={group.dateLabel}
              bodyClassName="p-2"
            >
              <div className="flex flex-col">
                {group.events.map((event, index) => (
                  <div
                    className={cn(
                      "flex gap-3 px-3 py-3",
                      index < group.events.length - 1 && "border-b border-[color:var(--panel-line-soft)]",
                    )}
                    key={event.id}
                  >
                    <ActivityIcon error={event.error} icon={event.icon} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="text-[12.5px] font-semibold leading-[1.45] text-[color:var(--graphite-text)]">
                          {event.title}
                        </div>
                        {event.error ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--oxblood-soft)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[color:var(--oxblood)]">
                            <PiWarningCircleFill aria-hidden="true" className="size-3" />
                            error
                          </span>
                        ) : null}
                      </div>
                      {event.detail === null ? null : (
                        <div className="mt-0.5 text-[12px] leading-[1.5] text-[color:var(--graphite-text-muted)]">
                          {event.detail}
                        </div>
                      )}
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-[color:var(--graphite-text-faint)]">
                        <MonoTag>{event.source}</MonoTag>
                        <span>·</span>
                        <span>{event.meta}</span>
                      </div>
                    </div>
                    <div className="shrink-0 pt-0.5 font-mono text-[10.5px] tabular-nums text-[color:var(--graphite-text-faint)]">
                      {event.timeLabel}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          ))
        )}
      </div>
    </div>
  );
}
