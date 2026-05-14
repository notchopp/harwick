"use client";

import type { OwnerHomeQueueItem } from "@realty-ops/core";
import { Clock } from "lucide-react";
import { useMemo, useState } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";

import { Section } from "../../components/panels/panels";
import { MicroLabel, MonoTag } from "../../components/panels/typography";
import { cn } from "../../lib/utils";

/**
 * "This week" pane on /home — a real DayPicker on the left with a dot on each
 * day that has a scheduled item, and an agenda list of upcoming items on the right.
 */
export function SchedulePane(props: {
  items: OwnerHomeQueueItem[];
}) {
  const [selected, setSelected] = useState<Date>(new Date());

  const eventsByDay = useMemo(() => {
    const map = new Map<string, OwnerHomeQueueItem[]>();
    for (const item of props.items) {
      if (item.dueAt === null) continue;
      const date = new Date(item.dueAt);
      if (Number.isNaN(date.getTime())) continue;
      const key = formatDayKey(date);
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return map;
  }, [props.items]);

  const eventsForSelected = eventsByDay.get(formatDayKey(selected)) ?? [];
  const upcoming = useMemo(() => {
    const now = Date.now();
    return [...props.items]
      .filter((item) => item.dueAt !== null && Date.parse(item.dueAt) >= now)
      .sort((a, b) => Date.parse(a.dueAt ?? "") - Date.parse(b.dueAt ?? ""))
      .slice(0, 8);
  }, [props.items]);

  const dayCounts = useMemo(() => {
    const days: Date[] = [];
    eventsByDay.forEach((_value, key) => {
      const [year, month, day] = key.split("-").map((x) => Number.parseInt(x, 10));
      if (year !== undefined && month !== undefined && day !== undefined) {
        days.push(new Date(year, month - 1, day));
      }
    });
    return days;
  }, [eventsByDay]);

  return (
    <Section
      eyebrow="This week"
      title={selected.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
      trailing={<MonoTag>{upcoming.length} upcoming</MonoTag>}
      className="min-w-0 overflow-hidden"
      bodyClassName="grid min-w-0 grid-cols-1 gap-3 p-2.5 sm:p-3 md:grid-cols-[auto_1fr]"
    >
      <div className="min-w-0 overflow-hidden rounded-[var(--panel-radius-xs)] border border-[color:var(--panel-line-soft)] bg-[color:var(--panel-3)]/40 p-1.5 sm:p-2">
        <DayPicker
          mode="single"
          required
          selected={selected}
          onSelect={(date) => setSelected(date ?? new Date())}
          showOutsideDays
          modifiers={{ hasEvent: dayCounts }}
          modifiersClassNames={{
            hasEvent: "rdp-has-event",
          }}
          className="harwick-day-picker max-w-full"
        />
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <MicroLabel>agenda</MicroLabel>
          <span className="text-[10.5px] text-[color:var(--graphite-text-faint)]">{eventsForSelected.length} on this day</span>
        </div>
        {upcoming.length === 0 ? (
          <div className="flex items-center gap-2 rounded-[var(--panel-radius-xs)] border border-dashed border-[color:var(--panel-line-soft)] px-3 py-3 text-[12px] text-[color:var(--graphite-text-muted)]">
            <Clock className="size-3.5 text-[color:var(--graphite-text-faint)]" aria-hidden="true" />
            Nothing on the calendar with a hard due date right now.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {upcoming.map((item) => {
              const date = item.dueAt === null ? null : new Date(item.dueAt);
              const isSelectedDay = date !== null && formatDayKey(date) === formatDayKey(selected);
              return (
                <li key={item.id}>
                  <a
                    href={item.href}
                    className={cn(
                      "group flex min-w-0 items-center gap-2 rounded-[var(--panel-radius-xs)] border border-[color:var(--panel-line-soft)] bg-[color:var(--panel-3)]/30 px-2.5 py-2 transition sm:gap-3 sm:px-3",
                      isSelectedDay
                        ? "border-[color:var(--panel-line-strong)] bg-[color:var(--panel-3)]/70"
                        : "hover:border-[color:var(--panel-line)] hover:bg-[color:var(--panel-3)]/50",
                    )}
                  >
                    <div className="w-[56px] shrink-0 sm:w-[64px]">
                      <MonoTag>{date === null ? "TBD" : date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }).toUpperCase()}</MonoTag>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] font-semibold text-[color:var(--graphite-text)]">{item.title}</div>
                      <div className="truncate text-[11px] text-[color:var(--graphite-text-muted)]">{item.summary}</div>
                    </div>
                    <span className="shrink-0 text-[10.5px] text-[color:var(--graphite-text-faint)] transition group-hover:text-[color:var(--graphite-text)]">
                      Open
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Section>
  );
}

function formatDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
