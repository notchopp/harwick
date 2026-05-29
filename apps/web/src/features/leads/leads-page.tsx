"use client";

import {
  automationModeLabel,
  type ConversationAutomationMode,
  type LeadType,
} from "@realty-ops/core";
import {
  Bot,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Mail,
  MessageSquare,
  Pause,
  Phone,
  Plus,
  Search,
  SortAsc,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Drawer } from "vaul";

import { FacebookGlyph, HouseGlyph, InstagramGlyph, PhoneGlyph } from "../../components/harwick-icons";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";
import { LeadActionToolbar } from "../conversations/lead-action-toolbar";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { useLeadBrief, type LeadBriefRole } from "../judgment-tools/use-lead-brief";
import type { LeadPageItem, LeadPageSource, LeadPageStage, LeadTimelineEvent } from "./leads-data";
import { LeadsKanban } from "./leads-kanban";

type LeadStatus = "new" | "qualified" | "nurture" | "lost";
type LeadQualificationFilter = "all" | "buyer" | "seller" | "unqualified";
type SortBy = "newest" | "score" | "uncontacted";
type LeadsLoadState = "loading" | "ready" | "error";
type LeadRecord = LeadPageItem & {
  automationMode: ConversationAutomationMode;
  automationReason: string;
  displayStatus: LeadStatus;
  draft: string;
  helperSuggestion: string;
  primaryAction: string;
  secondaryAction: string;
  subStatus: string;
  timelineItems: string[];
};

const leadsPageSize = 12;

function clampPage(page: number, pageCount: number) {
  return Math.min(Math.max(page, 1), Math.max(pageCount, 1));
}

function sourceLabel(source: LeadPageSource) {
  if (source === "voice") return "Voice";
  if (source === "listing_chat") return "Listing chat";
  if (source === "manual") return "Manual";
  return source.charAt(0).toUpperCase() + source.slice(1);
}

function deriveDisplayStatus(stage: LeadPageStage): LeadStatus {
  if (stage === "qualified" || stage === "showing") {
    return "qualified";
  }

  if (stage === "nurture") {
    return "nurture";
  }

  return "new";
}

function deriveSubStatus(stage: LeadPageStage): string {
  if (stage === "callback") {
    return "Callback due";
  }

  if (stage === "showing") {
    return "Showing ready";
  }

  if (stage === "unrouted") {
    return "Owner review";
  }

  if (stage === "nurture") {
    return "Follow-up due";
  }

  return "Not contacted";
}

function primaryActionFor(stage: LeadPageStage, timeline: string) {
  if (stage === "callback") {
    return "call back";
  }

  if (stage === "showing") {
    return "confirm showing";
  }

  if (timeline === "unknown") {
    return "ask timeline";
  }

  return "send action";
}

function helperSuggestionFor(item: LeadPageItem) {
  if (item.stage === "callback") {
    return "Call first, then let Harwick summarize and prepare the next action.";
  }

  if (item.timeline === "unknown") {
    return "Capture timeline next so routing and follow-up can stay explainable.";
  }

  return "Keep the next response tight and move toward the clearest next operational step.";
}

function automationReasonFor(item: LeadPageItem) {
  if (item.stage === "callback") {
    return "callback intent needs human contact before more automation";
  }

  if (item.stage === "unrouted") {
    return "routing still needs owner context before Harwick should move ahead";
  }

  return "safe operational response based on current qualification and assignment context";
}

function draftFor(item: LeadPageItem) {
  const firstName = item.name.split(" ")[0] ?? "there";
  if (item.stage === "callback") {
    return `Call ${firstName} back first. Confirm timing, area, and urgency before sending the next Harwick action.`;
  }

  if (item.timeline === "unknown") {
    return `Hi ${firstName} — happy to help. What timeline are you working with so I can send the most relevant next step?`;
  }

  return `Hi ${firstName} — I have your ${item.area} search in mind. I can send the right next step from here.`;
}

function mapLeadPageItemToRecord(item: LeadPageItem): LeadRecord {
  return {
    ...item,
    // Defensive default: API may temporarily omit timelineEvents during the rolling
    // deploy of the data-layer changes. Better to render an empty list than crash.
    timelineEvents: Array.isArray(item.timelineEvents) ? item.timelineEvents : [],
    assignedMemberId: item.assignedMemberId ?? null,
    automationMode: item.automationMode ?? (item.stage === "callback" ? "paused_by_rule" : "ai_on"),
    automationReason: item.automationReason ?? automationReasonFor(item),
    displayStatus: deriveDisplayStatus(item.stage),
    draft: draftFor(item),
    helperSuggestion: helperSuggestionFor(item),
    primaryAction: primaryActionFor(item.stage, item.timeline),
    secondaryAction: "take over",
    subStatus: deriveSubStatus(item.stage),
    timelineItems: [
      "lead row loaded from workspace backend",
      `latest context: ${item.sourceDetail}`,
      item.routeReason,
    ],
  };
}

function isLeadPageItem(value: unknown): value is LeadPageItem {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const item = value as Record<string, unknown>;

  return typeof item["id"] === "string"
    && typeof item["workspaceId"] === "string"
    && typeof item["name"] === "string"
    && typeof item["initials"] === "string"
    && (typeof item["phone"] === "string" || item["phone"] === null)
    && typeof item["source"] === "string"
    && typeof item["sourceDetail"] === "string"
    && typeof item["stage"] === "string"
    && typeof item["stageLabel"] === "string"
    && typeof item["cardKind"] === "string"
    && typeof item["intent"] === "string"
    && typeof item["leadType"] === "string"
    && typeof item["intentLevel"] === "string"
    && typeof item["score"] === "number"
    && typeof item["budget"] === "string"
    && typeof item["area"] === "string"
    && typeof item["timeline"] === "string"
    && typeof item["propertyType"] === "string"
    && typeof item["financingStatus"] === "string"
    && typeof item["assignedTo"] === "string"
    && (typeof item["assignedMemberId"] === "string" || item["assignedMemberId"] === null || item["assignedMemberId"] === undefined)
    && typeof item["sourceOwner"] === "string"
    && typeof item["lastTouch"] === "string"
    && typeof item["routeReason"] === "string"
    && typeof item["listing"] === "string"
    && typeof item["message"] === "string"
    && (typeof item["reviewId"] === "string" || item["reviewId"] === null || item["reviewId"] === undefined)
    && (typeof item["automationMode"] === "string" || item["automationMode"] === null || item["automationMode"] === undefined)
    && (typeof item["automationReason"] === "string" || item["automationReason"] === null || item["automationReason"] === undefined)
    && (typeof item["qualificationSummary"] === "string" || item["qualificationSummary"] === null || item["qualificationSummary"] === undefined)
    && (typeof item["leadDocument"] === "string" || item["leadDocument"] === null || item["leadDocument"] === undefined)
    // timeline is optional — tolerate older API responses while we deploy
    && (item["timelineEvents"] === undefined || Array.isArray(item["timelineEvents"]));
}

/**
 * Render a single timeline event's relative time. Falls back to the raw ISO
 * if the date is unparseable so a malformed row never blanks the UI.
 */
function formatTimelineTime(occurredAt: string): string {
  const date = new Date(occurredAt);
  if (Number.isNaN(date.getTime())) return occurredAt;
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * Parse Harwick's lead_document — a timestamped append-only log built up
 * across chat turns via `documentUpdate`. Format: "[ISO timestamp] body\n\n---\n\n".
 * Returns at most `max` entries newest-first, each with parsed Date.
 */
function parseHarwickNotes(raw: string | null, max = 8): Array<{ at: Date; body: string }> {
  if (raw === null || raw.trim().length === 0) return [];
  const chunks = raw.split(/\n\n---\n\n/).map((c) => c.trim()).filter((c) => c.length > 0);
  const parsed: Array<{ at: Date; body: string }> = [];
  for (const chunk of chunks) {
    const match = chunk.match(/^\[(\d{4}-\d{2}-\d{2}T[^\]]+)\]\s+([\s\S]+)$/);
    if (match === null) {
      parsed.push({ at: new Date(0), body: chunk });
      continue;
    }
    const [, iso, body] = match;
    const at = new Date(iso!);
    parsed.push({ at: Number.isNaN(at.getTime()) ? new Date(0) : at, body: body!.trim() });
  }
  parsed.sort((a, b) => b.at.getTime() - a.at.getTime());
  return parsed.slice(0, max);
}

function formatNoteTimestamp(at: Date): string {
  if (at.getTime() === 0) return "—";
  return at.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function SourceGlyph(props: { source: LeadPageSource }) {
  if (props.source === "listing_chat") {
    return <HouseGlyph className="h-[15px] w-[15px]" />;
  }

  if (props.source === "instagram") {
    return <InstagramGlyph className="h-[15px] w-[15px]" />;
  }

  if (props.source === "facebook") {
    return <FacebookGlyph className="h-[15px] w-[15px]" />;
  }

  // voice / manual / fallback
  return <PhoneGlyph className="h-[15px] w-[15px]" />;
}

function LeadsPaginationFooter(props: {
  currentPage: number;
  itemCount: number;
  pageCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const start = props.itemCount === 0 ? 0 : (props.currentPage - 1) * props.pageSize + 1;
  const end = Math.min(props.itemCount, props.currentPage * props.pageSize);

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-[14px] border border-[color:var(--panel-line)] bg-[color:var(--panel-1)] px-4 py-3 text-[12px] text-[color:var(--graphite-text-muted)] shadow-[var(--shadow-tight)] sm:flex-row sm:items-center sm:justify-between">
      <div>
        showing {start}-{end} of {props.itemCount}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={props.currentPage <= 1}
          onClick={() => props.onPageChange(props.currentPage - 1)}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[color:var(--panel-line)] bg-[color:var(--panel-1)] px-3 text-[12px] font-medium text-[color:var(--graphite-text-muted)] transition hover:border-[color:var(--panel-line-strong)] hover:text-[color:var(--graphite-text)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          prev
        </button>
        <span className="min-w-20 text-center text-[11px] text-[color:var(--graphite-text-faint)]">
          page {props.currentPage} / {props.pageCount}
        </span>
        <button
          type="button"
          disabled={props.currentPage >= props.pageCount}
          onClick={() => props.onPageChange(props.currentPage + 1)}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[color:var(--panel-line)] bg-[color:var(--panel-1)] px-3 text-[12px] font-medium text-[color:var(--graphite-text-muted)] transition hover:border-[color:var(--panel-line-strong)] hover:text-[color:var(--graphite-text)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          next
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function leadTypeTone(leadType: LeadType): string {
  if (leadType === "buyer") {
    return "bg-sage-soft text-qualified";
  }

  if (leadType === "seller") {
    return "bg-brass-soft text-warm";
  }

  if (leadType === "renter") {
    return "bg-clay-soft text-warm";
  }

  return "bg-[color:var(--panel-2)] text-[color:var(--graphite-text-muted)]";
}

function automationLabel(mode: ConversationAutomationMode): { className: string; label: string } {
  if (mode === "ai_on") {
    return { className: "text-qualified", label: "AI Active" };
  }

  if (mode === "human_takeover") {
    return { className: "text-warm", label: "Human" };
  }

  return { className: "text-[color:var(--graphite-text-muted)]", label: "AI Paused" };
}

function LeadListRow(props: {
  isSelected: boolean;
  lead: LeadRecord;
  onSelect: () => void;
}) {
  const automation = automationLabel(props.lead.automationMode);

  return (
    <button
      className={cn(
        "flex w-full items-start gap-4 px-6 py-4 text-left transition-colors hover:bg-white/[0.03]",
        props.isSelected && "bg-[color:var(--panel-2)]",
      )}
      onClick={props.onSelect}
      type="button"
    >
      <Avatar className="h-10 w-10 shrink-0 border border-[color:var(--panel-line)]">
        <AvatarFallback className="bg-[color:var(--panel-2)] text-sm text-[color:var(--graphite-text)]">
          {props.lead.initials}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-[color:var(--graphite-text)]">{props.lead.name}</span>
          <span className={cn("h-5 rounded-full px-2 py-0.5 text-[11px] font-medium", leadTypeTone(props.lead.leadType))}>
            {props.lead.leadType === "unknown" ? "unqualified" : props.lead.leadType}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[color:var(--graphite-text-muted)]">
          <span className="flex items-center gap-1">
            <SourceGlyph source={props.lead.source} />
            {sourceLabel(props.lead.source)}
          </span>
          <span>Score: {props.lead.score}</span>
          <span className="truncate">{props.lead.assignedTo}</span>
        </div>

        <div className="mt-2 flex flex-wrap gap-1">
          {[props.lead.stageLabel, props.lead.area, props.lead.timeline]
            .filter((value) => value.toLowerCase() !== "unknown")
            .slice(0, 3)
            .map((value) => (
              <Badge className="h-5 rounded-full border-[color:var(--panel-line)] bg-transparent text-[11px] text-[color:var(--graphite-text-muted)]" key={value} tone="neutral">
                {value}
              </Badge>
            ))}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        <span className={cn("flex items-center gap-1 text-xs", automation.className)}>
          {props.lead.automationMode === "ai_on" ? (
            <span className="h-1.5 w-1.5 rounded-full bg-qualified" />
          ) : props.lead.automationMode === "human_takeover" ? (
            <Users aria-hidden="true" className="h-3 w-3" />
          ) : (
            <Pause className="h-3 w-3" />
          )}
          {automation.label}
        </span>
        <span className="text-xs text-[color:var(--graphite-text-faint)]">{props.lead.lastTouch}</span>
      </div>
    </button>
  );
}

/**
 * Real timeline rendered from the server's `lead.timeline` array. Each entry
 * comes from a tagged source (lead capture, chat turn, or lead_event) and
 * carries an `actor` we use to pick the bubble icon + color. The visitor
 * (lead) gets the muted clock; Harwick and operator both get the Bot bubble
 * — visually identical to keep the focus on what was said, not who said it.
 *
 * Fallback: when timeline is empty (rolling deploy, or a manually-created
 * lead with no events yet) we still render the original "captured" line so
 * the panel never looks broken.
 */
function LeadTimelineList(props: {
  events: LeadTimelineEvent[];
  fallback: { lastTouch: string; message: string };
  drawerSurface: boolean;
  primaryText: string;
  mutedText: string;
  faintText: string;
}) {
  const events = props.events.length > 0
    ? props.events
    : [{
        kind: "captured" as const,
        actor: "system" as const,
        title: "Lead captured",
        description: props.fallback.message,
        occurredAt: new Date().toISOString(),
      }];

  return (
    <div className="space-y-3">
      {events.map((event, index) => {
        const isHarwick = event.actor === "harwick" || event.actor === "operator";
        return (
          <div className="flex gap-3" key={`${event.kind}-${event.occurredAt}-${index}`}>
            <div className="flex flex-col items-center">
              <div className={cn("flex h-8 w-8 items-center justify-center rounded-full", isHarwick ? "bg-primary" : props.drawerSurface ? "bg-white/[0.04]" : "bg-[color:var(--panel-2)]")}>
                {isHarwick ? (
                  <Bot className="h-4 w-4 text-primary-foreground" />
                ) : (
                  <Clock className={cn("h-4 w-4", props.mutedText)} />
                )}
              </div>
              {index === events.length - 1 ? null : <div className={cn("w-px flex-1", props.drawerSurface ? "bg-white/[0.08]" : "bg-[color:var(--panel-line)]")} />}
            </div>
            <div className="flex-1 pb-4">
              <p className={cn("text-sm font-medium", props.primaryText)}>{event.title}</p>
              {event.description.length > 0 && event.description !== event.title ? (
                <p className={cn("mt-0.5 text-xs", props.mutedText)}>{event.description}</p>
              ) : null}
              <p className={cn("mt-1 text-xs", props.faintText)}>{formatTimelineTime(event.occurredAt)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Schedule popover — opens a small date+time picker that POSTs to the
 * `schedule-callback` endpoint. Replaces the dead Schedule button.
 * Uses native datetime-local for now (works in every browser, no extra
 * deps); we can upgrade to a real calendar grid later if needed.
 */
function SchedulePopover(props: {
  lead: LeadRecord;
  triggerClassName: string;
  drawerSurface: boolean;
  onScheduled: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const defaultWhen = useMemo(() => {
    // Default to "tomorrow at 10am local" — the most common callback slot.
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, []);
  const [when, setWhen] = useState(defaultWhen);
  const [note, setNote] = useState("");

  async function handleSchedule() {
    setPending(true);
    try {
      const response = await fetch(
        `/api/leads/${props.lead.id}/schedule-callback`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            workspaceId: props.lead.workspaceId,
            scheduledFor: new Date(when).toISOString(),
            note: note.trim().length > 0 ? note.trim() : null,
          }),
        }
      );
      if (response.ok) {
        const formatted = new Date(when).toLocaleString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
        props.onScheduled(`Callback scheduled for ${formatted}.`);
        setOpen(false);
      } else {
        const body = await response.json().catch(() => ({ message: "Schedule failed." }));
        props.onScheduled(`Schedule failed: ${body.message ?? response.status}`);
      }
    } catch (error) {
      console.error(error);
      props.onScheduled("Network error scheduling callback.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button className={props.triggerClassName} size="sm" type="button" variant="outline">
          <CalendarClock className="h-4 w-4" />
          Schedule
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className={cn(
          "w-80 space-y-3 p-4",
          props.drawerSurface ? "border-white/10 bg-[#10160f] text-white" : "",
        )}
      >
        <div>
          <p className={cn("text-[10px] font-bold uppercase tracking-[0.12em]", props.drawerSurface ? "text-white/46" : "text-[color:var(--graphite-text-faint)]")}>
            schedule callback
          </p>
          <p className={cn("mt-1 text-sm font-medium", props.drawerSurface ? "text-white" : "text-[color:var(--graphite-text)]")}>
            {props.lead.name}
          </p>
        </div>
        <label className="block space-y-1">
          <span className={cn("text-[11px] uppercase tracking-[0.1em]", props.drawerSurface ? "text-white/46" : "text-[color:var(--graphite-text-faint)]")}>
            when
          </span>
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className={cn(
              "w-full rounded-[8px] border px-3 py-2 text-sm",
              props.drawerSurface
                ? "border-white/[0.1] bg-white/[0.045] text-white"
                : "border-[color:var(--panel-line)] bg-[color:var(--panel-1)] text-[color:var(--graphite-text)]",
            )}
          />
        </label>
        <label className="block space-y-1">
          <span className={cn("text-[11px] uppercase tracking-[0.1em]", props.drawerSurface ? "text-white/46" : "text-[color:var(--graphite-text-faint)]")}>
            note (optional)
          </span>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What's the call about?"
            className={cn(
              "w-full resize-none rounded-[8px] border px-3 py-2 text-sm",
              props.drawerSurface
                ? "border-white/[0.1] bg-white/[0.045] text-white placeholder:text-white/30"
                : "border-[color:var(--panel-line)] bg-[color:var(--panel-1)] text-[color:var(--graphite-text)]",
            )}
          />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button
            disabled={pending}
            onClick={() => setOpen(false)}
            size="sm"
            type="button"
            variant="ghost"
          >
            cancel
          </Button>
          <Button
            disabled={pending}
            onClick={() => void handleSchedule()}
            size="sm"
            type="button"
          >
            {pending ? "scheduling…" : "schedule"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The AI-native brief at the top of the drawer. Replaces "what does this row
 * mean" lookups across hardcoded panels with one LLM-written 2-second read
 * + suggested action buttons. Hardcoded fields move below into the
 * qualification panel which now acts as the "show raw fields" reference.
 *
 * Stale-while-revalidate: when the hook is loading the panel shows a
 * neutral skeleton so the drawer doesn't shift; when the hook errors or
 * returns low confidence the section quietly disappears and the drawer's
 * lower deterministic panels still render.
 */
function LeadBriefSection(props: {
  workspaceId: string;
  leadId: string;
  role: LeadBriefRole;
  onSuggestedAction: (action: string, payload: Record<string, unknown>) => void;
  drawerSurface: boolean;
}) {
  const state = useLeadBrief({
    leadId: props.leadId,
    workspaceId: props.workspaceId,
    role: props.role,
    destination: "harwick_drawer",
  });
  const [showRationale, setShowRationale] = useState(false);

  if (state.status === "idle") return null;

  if (state.status === "loading") {
    return (
      <div className={cn(
        "rounded-[18px] border p-4",
        props.drawerSurface
          ? "border-[var(--sage)]/22 bg-[var(--sage)]/[0.04]"
          : "border-[color:var(--panel-line)] bg-[color:var(--panel-1)]",
      )}>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--sage)]">harwick read</span>
          <span className="font-mono text-[10px] text-white/40">generating…</span>
        </div>
        <div className={cn("mt-3 h-3 w-3/4 rounded animate-pulse", props.drawerSurface ? "bg-white/[0.08]" : "bg-[color:var(--panel-2)]")} />
        <div className={cn("mt-2 h-3 w-5/6 rounded animate-pulse", props.drawerSurface ? "bg-white/[0.06]" : "bg-[color:var(--panel-2)]")} />
      </div>
    );
  }

  if (state.status === "error") return null;

  // Don't surface low-confidence outputs to the operator — the deterministic
  // panels below are still rendering, no need to add noise.
  if (state.envelope.confidence < 0.5) return null;

  return (
    <div className={cn(
      "rounded-[18px] border p-4",
      props.drawerSurface
        ? "border-[var(--sage)]/26 bg-[var(--sage)]/[0.045] shadow-[inset_0_1px_0_rgba(136,162,118,0.08)]"
        : "border-[color:var(--panel-line)] bg-[color:var(--panel-1)]",
    )}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--sage)]">harwick read</span>
        <span className="font-mono text-[10px] text-white/40">
          {state.cached ? "cached" : state.model.replace("gpt-", "")}
        </span>
      </div>
      <h3 className={cn(
        "text-[15px] font-semibold leading-snug",
        props.drawerSurface ? "text-white" : "text-[color:var(--graphite-text)]",
      )}>
        {state.envelope.brief.headline}
      </h3>
      <p className={cn(
        "mt-2 text-[13px] leading-relaxed",
        props.drawerSurface ? "text-white/75" : "text-[color:var(--graphite-text-muted)]",
      )}>
        {state.envelope.brief.body}
      </p>

      {state.envelope.suggestedActions.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {state.envelope.suggestedActions.map((action, index) => (
            <Button
              key={`${action.action}-${index}`}
              className={cn(
                "h-8 rounded-full px-3 text-[11.5px] font-semibold",
                props.drawerSurface ? "" : "",
              )}
              onClick={() => props.onSuggestedAction(action.action, action.payload)}
              size="sm"
              type="button"
              variant={index === 0 ? "default" : "outline"}
            >
              {action.label}
            </Button>
          ))}
        </div>
      ) : null}

      {state.envelope.rationale !== null && state.envelope.rationale.length > 0 ? (
        <div className="mt-3 border-t border-white/[0.06] pt-2">
          <button
            type="button"
            onClick={() => setShowRationale((v) => !v)}
            className={cn(
              "text-[10.5px] font-medium uppercase tracking-[0.1em]",
              props.drawerSurface ? "text-white/40 hover:text-white/60" : "text-[color:var(--graphite-text-faint)] hover:text-[color:var(--graphite-text-muted)]",
            )}
          >
            {showRationale ? "hide receipts" : "show receipts"}
          </button>
          {showRationale ? (
            <p className={cn(
              "mt-1 text-[11px] leading-4 italic",
              props.drawerSurface ? "text-white/50" : "text-[color:var(--graphite-text-faint)]",
            )}>
              {state.envelope.rationale}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function LeadInlineDetail(props: {
  actionStatus: string | null;
  currentMemberId: string;
  lead: LeadRecord;
  onChanged: () => void | Promise<void>;
  onClose: () => void;
  onOpenConversation: (leadId: string) => void;
  onPrimaryAction: (lead: LeadRecord) => void | Promise<void>;
  onActionStatusChange?: (status: string | null) => void;
  surface?: "panel" | "drawer";
}) {
  const automationPaused = props.lead.automationMode !== "ai_on";
  const drawerSurface = props.surface === "drawer";
  const primaryText = drawerSurface ? "text-white" : "text-[color:var(--graphite-text)]";
  const mutedText = drawerSurface ? "text-white/58" : "text-[color:var(--graphite-text-muted)]";
  const faintText = drawerSurface ? "text-white/38" : "text-[color:var(--graphite-text-faint)]";
  const bodyPadding = drawerSurface ? "space-y-5 px-6 pb-6" : "space-y-6 p-4";
  const detailActionClass = drawerSurface
    ? "h-10 justify-start gap-2 rounded-[10px] border border-white/[0.1] bg-white/[0.045] px-3 text-[12px] font-semibold text-white/75 shadow-none hover:border-white/[0.18] hover:bg-white/[0.075] hover:text-white"
    : "h-9 justify-start gap-1.5 rounded-[8px]";

  return (
    <div
      className={cn(
        "relative z-10 flex h-full min-h-0 flex-col text-[color:var(--graphite-text)]",
        drawerSurface ? "bg-transparent" : "border-l border-[color:var(--panel-line)]/50 bg-[color:var(--panel-1)]",
      )}
    >
      <div
        className={cn(
          "shrink-0 border-b",
          drawerSurface
            ? "relative flex items-start justify-between gap-3 border-white/8 px-6 pb-4 pt-3.5"
            : "flex h-[57px] items-center justify-between border-[color:var(--panel-line)]/50 px-4",
        )}
      >
        <div className="min-w-0">
          {drawerSurface ? (
            <div className="text-[10px] font-bold uppercase leading-none tracking-[0.18em] text-white/46">
              lead details
            </div>
          ) : null}
          <h2
            className={cn(
              drawerSurface
                ? "mt-2 truncate font-display text-[26px] font-medium leading-[1.05] tracking-[-0.02em] text-white"
                : "text-sm font-semibold text-[color:var(--graphite-text)]",
            )}
          >
            {drawerSurface ? props.lead.name : "Lead Details"}
          </h2>
        </div>
        <Button
          className={cn(
            drawerSurface
              ? "-mr-1 h-9 w-9 shrink-0 rounded-full border border-white/12 bg-white/[0.04] text-white/70 hover:border-white/22 hover:bg-white/[0.06] hover:text-white"
              : "h-8 w-8 rounded-[8px]",
          )}
          onClick={props.onClose}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={bodyPadding}>
          {/*
           * AI-native brief at the top — Harwick's 2-second read on this lead,
           * audience-shaped + destination-shaped. Replaces "scan a dozen
           * hardcoded fields to figure out what this row means" with one
           * LLM-written headline + body + suggested actions. The hardcoded
           * qualification panel below now acts as the "show raw" reference.
           */}
          <LeadBriefSection
            workspaceId={props.lead.workspaceId}
            leadId={props.lead.id}
            role="agent"
            drawerSurface={drawerSurface}
            onSuggestedAction={(action) => {
              if (action === "open_conversation") {
                props.onOpenConversation(props.lead.id);
                return;
              }
              if (action === "schedule_callback") {
                // The Schedule popover handles this; ensure visibility.
                props.onActionStatusChange?.("Tap the Schedule button below to set a time.");
                return;
              }
              if (action === "call_lead" && props.lead.phone !== null) {
                window.location.href = `tel:${props.lead.phone}`;
                return;
              }
              // Default: fall back to primary action (handlePrimaryAction).
              void props.onPrimaryAction(props.lead);
            }}
          />

          {drawerSurface ? (
            <div className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/46">qualification</p>
                <Badge className={cn("text-xs", leadTypeTone(props.lead.leadType))}>{props.lead.leadType}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["score", String(props.lead.score)],
                  ["intent", props.lead.intentLevel],
                  ["budget", props.lead.budget],
                  ["area", props.lead.area],
                  ["timeline", props.lead.timeline],
                  ["financing", props.lead.financingStatus],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-[12px] border border-white/[0.08] bg-white/[0.035] px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/34">{label}</div>
                    <div className="mt-1 truncate text-[12.5px] font-semibold text-white/82">{value}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 space-y-2 border-t border-white/8 pt-3">
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="h-4 w-4 text-white/44" />
                  <span className="text-white/56">No email captured</span>
                </div>
                {props.lead.phone !== null ? (
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="h-4 w-4 text-white/44" />
                    <span className="text-white/82">{props.lead.phone}</span>
                  </div>
                ) : null}
                <div className="flex items-center gap-3 text-sm">
                  <SourceGlyph source={props.lead.source} />
                  <span className="text-white/82">{props.lead.sourceDetail}</span>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-4">
                <Avatar className="h-14 w-14 border border-[color:var(--panel-line)]/60">
                  <AvatarFallback className="bg-[color:var(--panel-2)] text-lg text-[color:var(--graphite-text)]">
                    {props.lead.initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <h3 className={cn("truncate text-lg font-semibold", primaryText)}>{props.lead.name}</h3>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge className={cn("text-xs", leadTypeTone(props.lead.leadType))}>
                      {props.lead.leadType}
                    </Badge>
                    <span className={cn("text-sm", mutedText)}>Score: {props.lead.score}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-3 text-sm">
                  <Mail className={cn("h-4 w-4", mutedText)} />
                  <span className={mutedText}>No email captured</span>
                </div>
                {props.lead.phone !== null ? (
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className={cn("h-4 w-4", mutedText)} />
                    <span className={primaryText}>{props.lead.phone}</span>
                  </div>
                ) : null}
                <div className="flex items-center gap-3 text-sm">
                  <SourceGlyph source={props.lead.source} />
                  <span className={primaryText}>{props.lead.sourceDetail}</span>
                </div>
              </div>
            </>
          )}

          {/* Harwick's notes — qualification summary + timestamped doc entries.
              Surfaces the document Harwick builds up across the conversation
              so the operator doesn't have to scroll the full transcript to
              know who this person is and what they want. */}
          {(() => {
            const notes = parseHarwickNotes(props.lead.leadDocument);
            const hasSummary = props.lead.qualificationSummary !== null && props.lead.qualificationSummary.trim().length > 0;
            if (!hasSummary && notes.length === 0) return null;
            return (
              <div
                className={cn(
                  "rounded-[12px] border p-4",
                  drawerSurface
                    ? "border-white/[0.1] bg-white/[0.045] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                    : "border-[color:var(--panel-line)]/50 bg-[color:var(--panel-2)]",
                )}
              >
                <div className={cn("text-[10px] font-bold uppercase tracking-[0.18em] mb-3", faintText)}>
                  what harwick knows
                </div>
                {hasSummary ? (
                  <p className={cn("text-[13px] leading-[1.55]", primaryText)}>
                    {props.lead.qualificationSummary}
                  </p>
                ) : null}
                {notes.length > 0 ? (
                  <div className={cn("mt-3 space-y-2 border-t pt-3", drawerSurface ? "border-white/8" : "border-[color:var(--panel-line)]/50")}>
                    <div className={cn("text-[10px] font-semibold uppercase tracking-[0.14em]", faintText)}>
                      timeline · {notes.length} note{notes.length === 1 ? "" : "s"}
                    </div>
                    <ol className="space-y-2">
                      {notes.map((note, idx) => (
                        <li
                          key={`${note.at.toISOString()}-${idx}`}
                          className={cn(
                            "rounded-[10px] px-3 py-2",
                            drawerSurface
                              ? "bg-white/[0.035] border border-white/[0.08]"
                              : "bg-[color:var(--panel-1)] border border-[color:var(--panel-line)]/40",
                          )}
                        >
                          <div className={cn("text-[10px] font-medium uppercase tracking-[0.12em]", faintText)}>
                            {formatNoteTimestamp(note.at)}
                          </div>
                          <div className={cn("mt-1 text-[12.5px] leading-[1.5]", primaryText)}>
                            {note.body}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}
              </div>
            );
          })()}

          <div
            className={cn(
              "rounded-[12px] border p-4",
              drawerSurface
                ? "border-white/[0.1] bg-white/[0.045] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                : "border-[color:var(--panel-line)]/50 bg-[color:var(--panel-2)]",
            )}
          >
            <div className="mb-3 flex min-w-0 items-center gap-3">
              <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]", automationPaused ? "bg-clay-soft" : "bg-sage-soft")}>
                {automationPaused ? (
                  <Pause className="h-5 w-5 text-warm" />
                ) : (
                  <Bot className="h-5 w-5 text-qualified" />
                )}
              </div>
              <div className="min-w-0">
                <p className={cn("text-sm font-medium", primaryText)}>{automationModeLabel(props.lead.automationMode)}</p>
                <p className={cn("truncate text-xs", mutedText)}>{props.lead.automationReason}</p>
              </div>
            </div>
            <LeadActionToolbar
              workspaceId={props.lead.workspaceId}
              leadId={props.lead.id}
              automationMode={props.lead.automationMode}
              assignedMemberId={props.lead.assignedMemberId ?? null}
              currentMemberId={props.currentMemberId}
              {...(drawerSurface ? { appearance: "dark" as const } : {})}
              showAgentSteps={false}
              showComposer={false}
              onChanged={props.onChanged}
            />
          </div>

          <div>
            <p className={cn("mb-2 text-xs font-medium uppercase tracking-[0.12em]", faintText)}>
              Assigned To
            </p>
            <div className="flex items-center justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className={cn("text-xs", drawerSurface ? "bg-white/[0.04] text-white/74" : "bg-[color:var(--panel-2)] text-[color:var(--graphite-text)]")}>
                    {props.lead.assignedTo
                      .split(" ")
                      .filter(Boolean)
                      .map((part) => part[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase() || "HW"}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className={cn("truncate text-sm font-medium", primaryText)}>{props.lead.assignedTo}</p>
                  <p className={cn("text-xs", mutedText)}>Current routing owner</p>
                </div>
              </div>
              <Button className={cn("h-8 text-xs", drawerSurface ? "text-white/62 hover:bg-white/[0.06] hover:text-white" : "")} size="sm" type="button" variant="ghost">
                Reassign
              </Button>
            </div>
          </div>

          <div>
            <p className={cn("mb-2 text-xs font-medium uppercase tracking-[0.12em]", faintText)}>
              Actions
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button className={detailActionClass} onClick={() => props.onOpenConversation(props.lead.id)} size="sm" type="button" variant="outline">
                <MessageSquare className="h-4 w-4" />
                Message
              </Button>
              {props.lead.phone === null || props.lead.phone.trim().length === 0 ? (
                <Button className={cn(detailActionClass, "opacity-50")} disabled size="sm" type="button" variant="outline">
                  <Phone className="h-4 w-4" />
                  No phone
                </Button>
              ) : (
                <Button asChild className={detailActionClass} size="sm" type="button" variant="outline">
                  <a href={`tel:${props.lead.phone}`}>
                    <Phone className="h-4 w-4" />
                    Call {props.lead.phone}
                  </a>
                </Button>
              )}
              <SchedulePopover
                lead={props.lead}
                triggerClassName={detailActionClass}
                drawerSurface={drawerSurface}
                onScheduled={(message) => props.onActionStatusChange?.(message)}
              />
              <Button className={detailActionClass} onClick={() => void props.onPrimaryAction(props.lead)} size="sm" type="button" variant="outline">
                <Bot className="h-4 w-4" />
                AI Action
              </Button>
            </div>
          </div>

          <div>
            <p className={cn("mb-3 text-xs font-medium uppercase tracking-[0.12em]", faintText)}>
              Activity Timeline
            </p>
            <LeadTimelineList
              events={props.lead.timelineEvents}
              fallback={{
                lastTouch: props.lead.lastTouch,
                message: props.lead.message,
              }}
              drawerSurface={drawerSurface}
              primaryText={primaryText}
              mutedText={mutedText}
              faintText={faintText}
            />
          </div>

          {props.actionStatus ? <div className={cn("text-xs", faintText)}>{props.actionStatus}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function LeadsPageContent(props: { workspaceId: string; workspaceName: string; currentMemberId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const leadIdParam = searchParams.get("leadId");
  const [qualificationFilter, setQualificationFilter] = useState<LeadQualificationFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<LeadPageSource | "all">("all");
  const [sortBy, setSortBy] = useState<SortBy>("newest");
  const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban");
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState("");
  const [leadRecords, setLeadRecords] = useState<LeadRecord[]>([]);
  const [leadsLoadState, setLeadsLoadState] = useState<LeadsLoadState>("loading");
  const [selectedLead, setSelectedLead] = useState<LeadRecord | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);

  function replaceLeadQuery(leadId: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (leadId === null) {
      params.delete("leadId");
    } else {
      params.set("leadId", leadId);
    }
    const query = params.toString();
    router.replace(query.length > 0 ? `/leads?${query}` : "/leads");
  }

  async function handlePrimaryAction(lead: LeadRecord) {
    if (!lead.reviewId) {
      router.push(`/conversations?leadId=${lead.id}`);
      return;
    }

    setActionStatus("Sending...");

    try {
      const response = await fetch(
        `/api/workspaces/${lead.workspaceId}/social-queue/${lead.reviewId}/action`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "send",
            reply: lead.draft,
          }),
        }
      );

      if (!response.ok) {
        setActionStatus("Send failed. Check backend logs.");
        return;
      }

      setActionStatus("Reply sent successfully!");
      router.push(`/conversations?leadId=${lead.id}`);
    } catch (error) {
      setActionStatus("Network error sending reply.");
      console.error(error);
    }
  }

  const refreshLeads = useCallback(async () => {
    setLeadsLoadState((current) => (current === "ready" ? current : "loading"));

    try {
      const response = await fetch(`/api/leads?workspaceId=${props.workspaceId}&limit=50`, {
        cache: "no-store",
      });

      if (!response.ok) {
        setLeadRecords([]);
        setLeadsLoadState("error");
        return;
      }

      const body: unknown = await response.json();
      const items =
        typeof body === "object" && body !== null && "items" in body && Array.isArray((body as { items?: unknown }).items)
          ? ((body as { items: unknown[] }).items.filter(isLeadPageItem).map(mapLeadPageItemToRecord))
          : [];

      setLeadRecords(items);
      setLeadsLoadState("ready");
    } catch {
      setLeadRecords([]);
      setLeadsLoadState("error");
    }
  }, [props.workspaceId]);

  useEffect(() => {
    void refreshLeads();
  }, [refreshLeads]);

  useEffect(() => {
    if (leadIdParam === null) {
      if (selectedLead !== null) {
        setSelectedLead(null);
      }
      return;
    }

    const matchedLead = leadRecords.find((lead) => lead.id === leadIdParam) ?? null;
    if (matchedLead !== selectedLead) {
      setSelectedLead(matchedLead);
    }
  }, [leadIdParam, leadRecords, selectedLead]);

  useEffect(() => {
    setActionStatus(null);
  }, [selectedLead?.id]);

  // Mirror selectedLead → URL in an effect, not inside onOpenChange.
  // Calling router.replace synchronously alongside setSelectedLead in the
  // close handler causes the URL update + re-render to land in the same React
  // commit as vaul's data-state="closed" flip, which produces a one-frame
  // flash before the close transition takes hold.
  useEffect(() => {
    const desired = selectedLead?.id ?? null;
    if (desired === leadIdParam) return;
    replaceLeadQuery(desired);
  }, [selectedLead?.id]);

  const filtered = useMemo(() => {
    let rows = [...leadRecords];

    if (qualificationFilter === "buyer" || qualificationFilter === "seller") {
      rows = rows.filter((row) => row.leadType === qualificationFilter);
    }

    if (qualificationFilter === "unqualified") {
      rows = rows.filter((row) => row.leadType === "unknown");
    }

    if (sourceFilter !== "all") {
      rows = rows.filter((row) => row.source === sourceFilter);
    }

    if (search.trim()) {
      const query = search.trim().toLowerCase();
      rows = rows.filter((row) =>
        [row.name, row.listing, row.area, row.intent, row.assignedTo].some((field) =>
          field.toLowerCase().includes(query),
        ),
      );
    }

    if (sortBy === "score") {
      rows.sort((left, right) => right.score - left.score);
    }

    if (sortBy === "uncontacted") {
      rows.sort((left, right) => Number(left.subStatus !== "Not contacted") - Number(right.subStatus !== "Not contacted"));
    }

    return rows;
  }, [leadRecords, qualificationFilter, search, sortBy, sourceFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / leadsPageSize));
  const safeCurrentPage = clampPage(currentPage, pageCount);
  const pagedLeads = useMemo(
    () => filtered.slice((safeCurrentPage - 1) * leadsPageSize, safeCurrentPage * leadsPageSize),
    [filtered, safeCurrentPage],
  );
  const hasActiveFilters = qualificationFilter !== "all" || sourceFilter !== "all" || search.trim().length > 0;
  const emptyTitle =
    leadsLoadState === "loading"
      ? "Loading leads"
      : leadsLoadState === "error"
        ? "Leads could not be loaded"
        : hasActiveFilters
          ? "No leads match this view"
          : "No active leads yet";
  const emptyBody =
    leadsLoadState === "loading"
      ? "Fetching the current workspace lead list."
      : leadsLoadState === "error"
        ? "The API did not return a usable lead list. Retry or check system health before launch validation."
        : hasActiveFilters
          ? "Clear filters to return to the full workspace lead list."
          : "New qualified inbound, voice, and public listing leads will appear here once Harwick captures them.";

  useEffect(() => {
    setCurrentPage(1);
  }, [qualificationFilter, sourceFilter, sortBy, search, leadRecords.length]);

  useEffect(() => {
    if (currentPage !== safeCurrentPage) {
      setCurrentPage(safeCurrentPage);
    }
  }, [currentPage, safeCurrentPage]);

  const totalLeads = leadRecords.length;
  const hotLeadsCount = leadRecords.filter((lead) => lead.score >= 80).length;
  const autoQualified = leadRecords.filter((lead) => lead.stage !== "unrouted" && lead.subStatus !== "Not contacted").length;
  const counts = {
    all: leadRecords.length,
    buyer: leadRecords.filter((l) => l.leadType === "buyer").length,
    seller: leadRecords.filter((l) => l.leadType === "seller").length,
    unqualified: leadRecords.filter((l) => l.leadType === "unknown").length,
  } as const;

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden bg-[color:var(--panel-1)] text-[color:var(--graphite-text)]">
      <section className="flex min-w-0 flex-1 flex-col">
        {/* Desktop header — mobile uses the AppShell top bar's "Leads" title */}
        <div className="hidden flex-wrap items-end justify-between gap-4 border-b border-[color:var(--panel-line-soft)] px-6 py-5 md:flex">
          <div>
            <h1 className="font-display text-[34px] font-semibold leading-[1.02] tracking-[-0.025em] text-[color:var(--graphite-text)] md:text-[42px]">
              Leads
            </h1>
            <p className="mt-2 text-[13px] leading-5 text-[color:var(--graphite-text-muted)]">
              <span className="font-semibold text-[color:var(--graphite-text)]">{totalLeads}</span> active ·{" "}
              <span className="font-semibold text-[var(--oxblood)]">{hotLeadsCount}</span> hot · Harwick auto-qualified{" "}
              <span className="font-semibold text-[color:var(--graphite-text)]">{autoQualified}</span> this week
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button className="h-8 gap-1.5 rounded-[8px] border-[color:var(--panel-line)] bg-[color:var(--panel-2)] text-[12px] font-semibold text-[color:var(--graphite-text)] hover:border-[color:var(--panel-line-strong)] hover:bg-[color:var(--panel-3)]" size="sm" type="button" variant="outline">
              Filter
            </Button>
            <Button className="h-8 gap-1.5 rounded-[8px] border-[color:var(--panel-line)] bg-[color:var(--panel-2)] text-[12px] font-semibold text-[color:var(--graphite-text)] hover:border-[color:var(--panel-line-strong)] hover:bg-[color:var(--panel-3)]" size="sm" type="button" variant="outline">
              Export
            </Button>
            <Button className="h-8 gap-1.5 rounded-[8px] bg-white text-[12px] font-semibold text-[color:var(--panel-0)] shadow-[var(--panel-inset-top)] hover:bg-white/92" size="sm" type="button">
              <Plus className="size-3.5" />
              New lead
            </Button>
          </div>
        </div>

        {/* Mobile header — eyebrow + display title to match listings rhythm */}
        <div className="flex items-end justify-between gap-3 border-b border-[color:var(--panel-line-soft)] px-5 pb-4 pt-5 md:hidden">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[color:var(--graphite-text-faint)]">
              Pipeline
            </p>
            <h1 className="mt-1 font-display text-[26px] font-medium leading-none tracking-[-0.02em] text-[color:var(--graphite-text)]">
              Leads
            </h1>
            <p className="mt-1.5 text-[12px] leading-5 text-[color:var(--graphite-text-muted)] tabular-nums">
              <span className="font-semibold text-[color:var(--graphite-text)]">{totalLeads}</span> active ·{" "}
              <span className="font-semibold text-[var(--oxblood)]">{hotLeadsCount}</span> hot
            </p>
          </div>
          <Button className="h-8 shrink-0 gap-1 rounded-[8px] bg-white px-2.5 text-[12px] font-semibold text-[color:var(--panel-0)] shadow-[var(--panel-inset-top)]" size="sm" type="button">
            <Plus className="size-3.5" />
            New
          </Button>
        </div>

        <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-[color:var(--panel-line-soft)] px-5 py-3 md:flex-wrap md:gap-3 md:overflow-visible md:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="relative w-[180px] shrink-0 md:w-auto md:min-w-[220px] md:flex-1 md:max-w-sm">
            <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[color:var(--graphite-text-faint)]" />
            <input
              className="h-9 w-full rounded-[var(--panel-radius-xs)] border border-[color:var(--panel-line)] bg-[color:var(--panel-2)] pl-9 pr-4 text-[12.5px] text-[color:var(--graphite-text)] outline-none placeholder:text-[color:var(--graphite-text-faint)] focus:border-[color:var(--panel-line-strong)]"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search leads..."
              type="text"
              value={search}
            />
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {(["all", "buyer", "seller", "unqualified"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setQualificationFilter(value)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
                  qualificationFilter === value
                    ? "border-[color:var(--panel-line-strong)] bg-[color:var(--panel-3)] text-[color:var(--graphite-text)]"
                    : "border-[color:var(--panel-line)] bg-[color:var(--panel-2)] text-[color:var(--graphite-text-muted)] hover:border-[color:var(--panel-line-strong)] hover:text-[color:var(--graphite-text)]",
                )}
              >
                <span className="capitalize">{value === "all" ? "All" : value}</span>
                <span className={cn(
                  "rounded-full px-1 font-mono text-[9.5px]",
                  qualificationFilter === value ? "bg-white/10 text-[color:var(--graphite-text)]" : "bg-[color:var(--panel-3)] text-[color:var(--graphite-text-faint)]",
                )}>
                  {counts[value]}
                </span>
              </button>
            ))}
          </div>

          <div className="hidden items-center gap-1 xl:flex">
            {(["all", "instagram", "facebook", "voice"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setSourceFilter(value)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
                  sourceFilter === value
                    ? "border-[color:var(--panel-line-strong)] bg-[color:var(--panel-3)] text-[color:var(--graphite-text)]"
                    : "border-[color:var(--panel-line)] bg-[color:var(--panel-2)] text-[color:var(--graphite-text-muted)] hover:border-[color:var(--panel-line-strong)] hover:text-[color:var(--graphite-text)]",
                )}
              >
                {value === "all" ? "All sources" : sourceLabel(value)}
              </button>
            ))}
          </div>

          <Button
            className="size-8 rounded-[8px] border-[color:var(--panel-line)] bg-[color:var(--panel-2)] text-[color:var(--graphite-text-muted)] hover:border-[color:var(--panel-line-strong)] hover:bg-[color:var(--panel-3)] hover:text-[color:var(--graphite-text)]"
            onClick={() => setSortBy((current) => current === "newest" ? "score" : current === "score" ? "uncontacted" : "newest")}
            size="icon"
            type="button"
            variant="outline"
          >
            <SortAsc className="size-3.5" />
          </Button>
          <div className="hidden rounded-[8px] border border-[color:var(--panel-line)] bg-[color:var(--panel-2)] p-0.5 md:inline-flex">
            <button
              type="button"
              onClick={() => setViewMode("kanban")}
              className={cn(
                "rounded-[6px] px-2 py-1 text-[11px] font-semibold transition",
                viewMode === "kanban" ? "bg-white text-[color:var(--panel-0)]" : "text-[color:var(--graphite-text-muted)] hover:text-[color:var(--graphite-text)]",
              )}
            >
              Board
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={cn(
                "rounded-[6px] px-2 py-1 text-[11px] font-semibold transition",
                viewMode === "table" ? "bg-white text-[color:var(--panel-0)]" : "text-[color:var(--graphite-text-muted)] hover:text-[color:var(--graphite-text)]",
              )}
            >
              Table
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {viewMode === "kanban" ? (
            <>
              <div className="hidden p-4 md:block">
                <LeadsKanban
                  leads={filtered}
                  onLeadSelect={(leadId) => {
                    const matched = leadRecords.find((entry) => entry.id === leadId) ?? null;
                    if (matched !== null) {
                      setSelectedLead(matched);
                    }
                    replaceLeadQuery(leadId);
                  }}
                />
              </div>
              <div className="divide-y divide-[color:var(--panel-line-soft)] md:hidden">
                {pagedLeads.map((lead) => (
                  <LeadListRow
                    isSelected={selectedLead?.id === lead.id}
                    key={lead.id}
                    lead={lead}
                    onSelect={() => {
                      setSelectedLead(lead);
                      replaceLeadQuery(lead.id);
                    }}
                  />
                ))}
              </div>
            </>
          ) : filtered.length === 0 ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center px-6 py-12 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[color:var(--panel-2)] text-[color:var(--graphite-text-muted)]">
                <MessageSquare aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <div className="mt-4 text-[15px] font-semibold text-[color:var(--graphite-text)]">{emptyTitle}</div>
              <div className="mt-2 max-w-[420px] text-[12px] leading-5 text-[color:var(--graphite-text-muted)]">{emptyBody}</div>
              {actionStatus ? <div className="mt-3 text-[11px] leading-5 text-[color:var(--graphite-text-faint)]">{actionStatus}</div> : null}
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {leadsLoadState === "error" ? (
                  <Button className="rounded-[8px] px-4 text-[11px]" onClick={() => void refreshLeads()} size="sm" type="button">
                    Retry
                  </Button>
                ) : null}
                {hasActiveFilters ? (
                  <Button
                    className="rounded-[8px] px-4 text-[11px]"
                    onClick={() => {
                      setQualificationFilter("all");
                      setSourceFilter("all");
                      setSearch("");
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Clear filters
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="divide-y divide-[color:var(--panel-line-soft)]">
              {pagedLeads.map((lead) => (
                <LeadListRow
                  isSelected={selectedLead?.id === lead.id}
                  key={lead.id}
                  lead={lead}
                  onSelect={() => {
                    setSelectedLead(lead);
                    replaceLeadQuery(lead.id);
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {filtered.length > 0 ? (
          <div className="border-t border-[color:var(--panel-line-soft)] px-6 pb-4">
            <LeadsPaginationFooter
              currentPage={safeCurrentPage}
              itemCount={filtered.length}
              pageCount={pageCount}
              pageSize={leadsPageSize}
              onPageChange={setCurrentPage}
            />
          </div>
        ) : null}
      </section>

      <aside className="hidden w-[440px] shrink-0 lg:block">
        {selectedLead ? (
          <LeadInlineDetail
            actionStatus={actionStatus}
            currentMemberId={props.currentMemberId}
            lead={selectedLead}
            onChanged={() => void refreshLeads()}
            onClose={() => {
              setSelectedLead(null);
              replaceLeadQuery(null);
            }}
            onOpenConversation={(leadId) => router.push(`/conversations?leadId=${leadId}`)}
            onPrimaryAction={(lead) => void handlePrimaryAction(lead)}
            onActionStatusChange={setActionStatus}
          />
        ) : (
          <div className="flex h-full flex-col border-l border-[color:var(--panel-line)]/50 bg-[color:var(--panel-1)] p-6">
            <div className="mt-10 rounded-[10px] border border-[color:var(--panel-line)] bg-background p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[color:var(--panel-2)] text-[color:var(--graphite-text-muted)]">
                <UserPlus className="h-5 w-5" />
              </div>
              <h2 className="mt-4 text-sm font-semibold text-[color:var(--graphite-text)]">Select a lead</h2>
              <p className="mt-1 text-sm leading-5 text-[color:var(--graphite-text-muted)]">
                The v0 detail surface opens here with Harwick reasoning, the live draft, assignment, and timeline.
              </p>
            </div>
          </div>
        )}
      </aside>

      {/*
       * Mobile + tablet drawer. The desktop aside is hidden below `lg`, so on
       * smaller screens we surface the same LeadInlineDetail body inside a
       * bottom-anchored vaul drawer driven by the same URL state. Closing the
       * drawer drops the leadId from the URL so refresh/back behaves.
       */}
      <Drawer.Root
        noBodyStyles
        open={selectedLead !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedLead(null);
        }}
      >
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-40 bg-[rgba(8,12,8,0.62)] backdrop-blur-[18px] backdrop-saturate-125 lg:hidden" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex h-[94vh] max-w-[760px] flex-col overflow-hidden rounded-t-[32px] border border-b-0 border-white/8 bg-[#0c130e] text-white shadow-[0_-32px_80px_-12px_rgba(6,12,8,0.55)] outline-none lg:hidden">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-t-[32px]"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 86% 4%, rgba(136,162,118,0.22), transparent 40%), linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0) 22%)",
              }}
            />
            <Drawer.Title className="sr-only">{selectedLead?.name ?? "Lead detail"}</Drawer.Title>
            <Drawer.Description className="sr-only">Lead detail and routing controls</Drawer.Description>
            <div className="relative mt-2.5 flex justify-center">
              <div className="h-[5px] w-[44px] rounded-full bg-white/22" aria-hidden="true" />
            </div>
            {selectedLead !== null ? (
              <LeadInlineDetail
                actionStatus={actionStatus}
                currentMemberId={props.currentMemberId}
                lead={selectedLead}
                onChanged={() => void refreshLeads()}
                onClose={() => {
                  setSelectedLead(null);
                  replaceLeadQuery(null);
                }}
                onOpenConversation={(leadId) => router.push(`/conversations?leadId=${leadId}`)}
                onPrimaryAction={(lead) => void handlePrimaryAction(lead)}
                onActionStatusChange={setActionStatus}
                surface="drawer"
              />
            ) : null}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  );
}

