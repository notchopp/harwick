"use client";

import {
  AlertTriangle,
  Brain,
  Calendar,
  CalendarClock,
  CheckCircle2,
  CircleHelp,
  Database,
  FileText,
  Hash,
  HelpCircle,
  Lightbulb,
  MapPin,
  MessageSquareReply,
  Notebook,
  Send,
  Sparkles,
  Tag,
} from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

/**
 * Compact card renderers for the new smart-tool result shapes. Returns null
 * when the output doesn't match a known kind, so callers fall through to the
 * raw JSON fallback.
 */

type ToolOutput = Record<string, unknown> & { kind?: unknown };

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asBool(value: unknown): boolean {
  return value === true;
}

function StatusPill({ tone, label }: { tone: "good" | "warn" | "neutral" | "alert"; label: string }) {
  const palette = tone === "good"
    ? "border-[var(--sage)]/35 bg-[var(--sage-soft)] text-[var(--sage)]"
    : tone === "warn"
      ? "border-[var(--clay)]/40 bg-[var(--clay-soft)] text-[var(--clay)]"
      : tone === "alert"
        ? "border-[var(--oxblood)]/40 bg-[var(--oxblood-soft)] text-[var(--oxblood)]"
        : "border-white/[0.08] bg-white/[0.04] text-white/68";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]", palette)}>
      {label}
    </span>
  );
}

function Card(props: { icon: ReactNode; title: string; subtitle?: string | null; children?: ReactNode; tone?: "good" | "warn" | "neutral" | "alert" }) {
  const ring = props.tone === "good"
    ? "ring-1 ring-inset ring-[var(--sage)]/22"
    : props.tone === "warn"
      ? "ring-1 ring-inset ring-[var(--clay)]/22"
      : props.tone === "alert"
        ? "ring-1 ring-inset ring-[var(--oxblood)]/30"
        : "";
  return (
    <div className={cn(
      "max-w-full overflow-hidden rounded-[12px] border border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-white/[0.012] p-3",
      ring,
    )}>
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[7px] bg-white/[0.05] text-white/78">
          {props.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-semibold text-white">{props.title}</div>
          {props.subtitle === null || props.subtitle === undefined || props.subtitle.length === 0 ? null : (
            <div className="mt-0.5 text-[11px] leading-5 text-white/64">{props.subtitle}</div>
          )}
          {props.children !== undefined ? <div className="mt-1.5">{props.children}</div> : null}
        </div>
      </div>
    </div>
  );
}

function MemoryStoredCard({ output }: { output: ToolOutput }) {
  const title = asString(output["title"]) ?? "Stored a memory";
  const subtitle = `kind: ${asString(output["kindStored"]) ?? "operator_note"}${asBool(output["embedded"]) ? " · embedded" : ""}`;
  return <Card icon={<Brain className="size-3.5" aria-hidden="true" />} title={title} subtitle={subtitle} tone="good" />;
}

function OperatorPreferenceCard({ output }: { output: ToolOutput }) {
  const id = asString(output["memoryId"]) ?? "stored";
  return <Card icon={<Lightbulb className="size-3.5" aria-hidden="true" />} title="Captured a preference" subtitle={`Memory ${id.slice(0, 8)}…`} tone="good" />;
}

function MemoryRecallCard({ output }: { output: ToolOutput }) {
  const memories = asArray(output["memories"]);
  const mode = asString(output["searchMode"]) ?? "vector";
  if (memories.length === 0) {
    return <Card icon={<Brain className="size-3.5" aria-hidden="true" />} title="No matching memories" subtitle={`mode: ${mode}`} />;
  }
  return (
    <Card icon={<Brain className="size-3.5" aria-hidden="true" />} title={`Recalled ${memories.length} memor${memories.length === 1 ? "y" : "ies"}`} subtitle={`mode: ${mode}`}>
      <ul className="space-y-1">
        {memories.slice(0, 4).map((entry, index) => {
          const row = entry as ToolOutput;
          return (
            <li key={asString(row["id"]) ?? `memory-${index}`} className="rounded-[7px] border border-white/[0.05] bg-white/[0.018] px-2 py-1">
              <div className="truncate text-[11.5px] font-medium text-white/88">{asString(row["title"]) ?? "Untitled"}</div>
              <div className="line-clamp-2 text-[10.5px] leading-4 text-white/56">{asString(row["body"]) ?? ""}</div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function SimilarLeadsCard({ output }: { output: ToolOutput }) {
  const matches = asArray(output["matches"]);
  if (matches.length === 0) {
    return <Card icon={<Sparkles className="size-3.5" aria-hidden="true" />} title="No similar leads found" />;
  }
  return (
    <Card icon={<Sparkles className="size-3.5" aria-hidden="true" />} title={`${matches.length} similar lead${matches.length === 1 ? "" : "s"}`} >
      <ul className="space-y-1">
        {matches.slice(0, 5).map((entry, index) => {
          const row = entry as ToolOutput;
          const name = asString(row["name"]) ?? "Unknown";
          const status = asString(row["status"]) ?? "?";
          const area = asString(row["targetArea"]);
          const budget = asString(row["budget"]);
          return (
            <li key={asString(row["leadId"]) ?? `match-${index}`} className="flex items-center gap-2 rounded-[7px] border border-white/[0.05] bg-white/[0.018] px-2 py-1.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-semibold text-white">{name}</div>
                <div className="truncate text-[10.5px] text-white/56">{[area, budget].filter(Boolean).join(" · ")}</div>
              </div>
              <StatusPill tone="neutral" label={status} />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function ListingsCard({ output }: { output: ToolOutput }) {
  const listings = asArray(output["listings"]);
  if (listings.length === 0) {
    return <Card icon={<MapPin className="size-3.5" aria-hidden="true" />} title="No listings matched" />;
  }
  return (
    <Card icon={<MapPin className="size-3.5" aria-hidden="true" />} title={`${listings.length} listing${listings.length === 1 ? "" : "s"}`}>
      <ul className="space-y-1">
        {listings.slice(0, 5).map((entry, index) => {
          const row = entry as ToolOutput;
          const address = asString(row["address"]) ?? "Unknown address";
          const price = asNumber(row["price"]);
          const beds = asNumber(row["beds"]);
          const baths = asNumber(row["baths"]);
          const status = asString(row["status"]);
          const meta = [
            price === null ? null : `$${price.toLocaleString()}`,
            beds === null ? null : `${beds}bd`,
            baths === null ? null : `${baths}ba`,
            status,
          ].filter(Boolean).join(" · ");
          return (
            <li key={asString(row["id"]) ?? `listing-${index}`} className="rounded-[7px] border border-white/[0.05] bg-white/[0.018] px-2 py-1.5">
              <div className="truncate text-[12px] font-semibold text-white">{address}</div>
              {meta.length === 0 ? null : <div className="truncate text-[10.5px] text-white/56">{meta}</div>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function CompsCard({ output }: { output: ToolOutput }) {
  const anchor = output["anchor"] as ToolOutput | undefined;
  const comps = asArray(output["comps"]);
  return (
    <Card
      icon={<MapPin className="size-3.5" aria-hidden="true" />}
      title="Comparable listings"
      subtitle={anchor === undefined ? null : `vs ${asString(anchor["address"]) ?? "anchor"}`}
    >
      <ul className="space-y-1">
        {comps.slice(0, 5).map((entry, index) => {
          const row = entry as ToolOutput;
          const price = asNumber(row["price"]);
          return (
            <li key={asString(row["listingId"]) ?? `comp-${index}`} className="flex items-center gap-2 rounded-[7px] border border-white/[0.05] bg-white/[0.018] px-2 py-1">
              <div className="min-w-0 flex-1 truncate text-[11.5px] text-white/82">{asString(row["address"]) ?? "?"}</div>
              <div className="shrink-0 font-mono text-[10.5px] text-white/64">{price === null ? "—" : `$${price.toLocaleString()}`}</div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function AvailabilityCard({ output }: { output: ToolOutput }) {
  const busy = asArray(output["busy"]);
  const tz = asString(output["timezone"]) ?? "calendar";
  const note = asString(output["note"]);
  if (note !== null) {
    return <Card icon={<CalendarClock className="size-3.5" aria-hidden="true" />} title="Availability unavailable" subtitle={note} tone="warn" />;
  }
  return (
    <Card icon={<CalendarClock className="size-3.5" aria-hidden="true" />} title={`${busy.length} busy block${busy.length === 1 ? "" : "s"}`} subtitle={`tz: ${tz}`}>
      <div className="text-[10.5px] text-white/56">
        The calendar is otherwise free in the queried window.
      </div>
    </Card>
  );
}

function ShowingSlotsCard({ output }: { output: ToolOutput }) {
  const slots = asArray(output["slots"]);
  if (slots.length === 0) {
    return <Card icon={<Calendar className="size-3.5" aria-hidden="true" />} title="No slots fit the window" tone="warn" />;
  }
  return (
    <Card icon={<Calendar className="size-3.5" aria-hidden="true" />} title={`${slots.length} candidate slot${slots.length === 1 ? "" : "s"}`}>
      <ul className="space-y-1">
        {slots.map((entry, index) => {
          const row = entry as ToolOutput;
          return (
            <li key={asString(row["startIso"]) ?? `slot-${index}`} className="rounded-[7px] border border-white/[0.05] bg-white/[0.018] px-2 py-1 text-[11.5px] text-white/82">
              {asString(row["humanLabel"]) ?? asString(row["startIso"]) ?? "slot"}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function ShowingEventCard({ output }: { output: ToolOutput }) {
  const created = asBool(output["created"]);
  const tone = created ? "good" : "alert";
  const summary = asString(output["summary"]) ?? "Showing event";
  const link = asString(output["htmlLink"]);
  return (
    <Card icon={<Calendar className="size-3.5" aria-hidden="true" />} title={created ? `Booked: ${summary}` : "Could not book"} tone={tone} subtitle={asString(output["error"])}>
      {link === null ? null : (
        <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--sage)]/35 bg-[var(--sage-soft)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--sage)]">
          Open in calendar
        </a>
      )}
    </Card>
  );
}

function LeadMutationCard({ output, label, icon }: { output: ToolOutput; label: string; icon: ReactNode }) {
  const ok = asBool(output["updated"]) || asBool(output["created"]) || asBool(output["sent"]) || asBool(output["posted"]);
  const tone = ok ? "good" : "alert";
  const subtitle = asString(output["error"]) ?? asString(output["note"]) ?? asString(output["reason"]) ?? asString(output["status"]);
  const leadName = asString(output["leadName"]);
  return <Card icon={icon} title={leadName === null ? label : `${label}: ${leadName}`} subtitle={subtitle} tone={tone} />;
}

function UncertaintyFlagCard({ output }: { output: ToolOutput }) {
  const confidence = asNumber(output["confidence"]);
  const topic = asString(output["topic"]) ?? "Uncertain";
  return (
    <Card icon={<AlertTriangle className="size-3.5" aria-hidden="true" />} title={`Harwick flagged uncertainty: ${topic}`} tone="warn" subtitle={confidence === null ? null : `confidence ${(confidence * 100).toFixed(0)}%`}>
      <p className="text-[11.5px] leading-5 text-white/72">{asString(output["why"])}</p>
      {asString(output["wouldHelpResolve"]) === null ? null : (
        <p className="mt-1 text-[10.5px] leading-4 text-white/56">Would help: {asString(output["wouldHelpResolve"])}</p>
      )}
    </Card>
  );
}

function ClarificationCard({ output, onPick }: { output: ToolOutput; onPick?: (value: string) => void }) {
  const options = asArray(output["options"]);
  return (
    <Card icon={<HelpCircle className="size-3.5" aria-hidden="true" />} title={asString(output["question"]) ?? "Quick question"} subtitle={asString(output["ambiguity"])}>
      <div className="flex flex-wrap gap-1.5">
        {options.map((entry, index) => {
          const opt = entry as ToolOutput;
          const value = asString(opt["value"]) ?? "";
          const label = asString(opt["label"]) ?? value;
          return (
            <button
              key={`${value}-${index}`}
              type="button"
              onClick={() => onPick?.(value)}
              className="rounded-[7px] border border-white/[0.1] bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-white/82 transition hover:border-white/[0.18] hover:bg-white/[0.07] hover:text-white"
            >
              {label}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function BriefingCard({ output, label }: { output: ToolOutput; label: string }) {
  const hotLeads = asArray(output["hotLeads"]);
  const unassigned = asArray(output["unassigned"] ?? output["unassignedLeads"]);
  const routing = asArray(output["routingDesk"] ?? output["pendingRoutingDecisions"]);
  return (
    <Card icon={<Notebook className="size-3.5" aria-hidden="true" />} title={label}>
      <div className="grid grid-cols-3 gap-1.5 text-[10.5px]">
        <div className="rounded-[7px] border border-white/[0.05] bg-white/[0.018] p-1.5 text-center">
          <div className="font-mono text-[14px] text-white">{hotLeads.length}</div>
          <div className="text-white/56">hot</div>
        </div>
        <div className="rounded-[7px] border border-white/[0.05] bg-white/[0.018] p-1.5 text-center">
          <div className="font-mono text-[14px] text-white">{unassigned.length}</div>
          <div className="text-white/56">unassigned</div>
        </div>
        <div className="rounded-[7px] border border-white/[0.05] bg-white/[0.018] p-1.5 text-center">
          <div className="font-mono text-[14px] text-white">{routing.length}</div>
          <div className="text-white/56">routing</div>
        </div>
      </div>
    </Card>
  );
}

function WorkspaceQueryCard({ output }: { output: ToolOutput }) {
  const rows = asArray(output["rows"]);
  const table = asString(output["table"]) ?? "rows";
  return (
    <Card icon={<Database className="size-3.5" aria-hidden="true" />} title={`Read ${rows.length} ${table}`} subtitle={asString(output["error"])}>
      <details className="rounded-[7px] border border-white/[0.05] bg-white/[0.012] p-1.5 text-[10.5px]">
        <summary className="cursor-pointer text-white/56">preview</summary>
        <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words text-white/72">{JSON.stringify(rows.slice(0, 3), null, 2)}</pre>
      </details>
    </Card>
  );
}

function DelegatedTaskCard({ output }: { output: ToolOutput }) {
  const created = asBool(output["created"]);
  const href = asString(output["openHref"]);
  return (
    <Card
      icon={<FileText className="size-3.5" aria-hidden="true" />}
      title={asString(output["title"]) ?? "Delegated work item"}
      subtitle={created ? `priority: ${asString(output["priority"]) ?? "normal"}` : asString(output["error"])}
      tone={created ? "good" : "alert"}
    >
      {href === null ? null : (
        <a href={href} className="inline-flex items-center gap-1 rounded-[6px] border border-white/[0.1] bg-white/[0.035] px-2 py-0.5 text-[10.5px] font-medium text-white/82">
          Open in queue
        </a>
      )}
    </Card>
  );
}

function ChannelCard({ output }: { output: ToolOutput }) {
  const created = asBool(output["created"]);
  return (
    <Card
      icon={<Hash className="size-3.5" aria-hidden="true" />}
      title={created ? `Created channel: ${asString(output["name"]) ?? "?"}` : "Could not create channel"}
      subtitle={created ? `${asNumber(output["memberCount"]) ?? 1} member${asNumber(output["memberCount"]) === 1 ? "" : "s"}` : asString(output["error"])}
      tone={created ? "good" : "alert"}
    >
      {asString(output["openChannelHref"]) === null ? null : (
        <a href={asString(output["openChannelHref"])!} className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--sage)]/35 bg-[var(--sage-soft)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--sage)]">
          Open channel
        </a>
      )}
    </Card>
  );
}

/**
 * Try to render a known kind. Returns null if we don't have a card for this
 * shape — caller (ToolResultCard) falls back to the raw JSON details view.
 */
export function tryRenderSmartCard(output: unknown): ReactNode | null {
  if (output === null || typeof output !== "object") return null;
  const obj = output as ToolOutput;
  switch (obj["kind"]) {
    case "memory_stored":
      return <MemoryStoredCard output={obj} />;
    case "operator_preference_stored":
      return <OperatorPreferenceCard output={obj} />;
    case "memory_recall":
      return <MemoryRecallCard output={obj} />;
    case "similar_leads":
      return <SimilarLeadsCard output={obj} />;
    case "listings":
      return <ListingsCard output={obj} />;
    case "comps":
      return <CompsCard output={obj} />;
    case "availability":
      return <AvailabilityCard output={obj} />;
    case "showing_slots":
      return <ShowingSlotsCard output={obj} />;
    case "showing_event":
      return <ShowingEventCard output={obj} />;
    case "focus_block":
      return <ShowingEventCard output={obj} />;
    case "lead_stage_update":
      return <LeadMutationCard output={obj} label="Stage updated" icon={<CheckCircle2 className="size-3.5" aria-hidden="true" />} />;
    case "lead_followup":
      return <LeadMutationCard output={obj} label="Follow-up set" icon={<CalendarClock className="size-3.5" aria-hidden="true" />} />;
    case "lead_closed":
      return <LeadMutationCard output={obj} label="Lead closed" icon={<CircleHelp className="size-3.5" aria-hidden="true" />} />;
    case "lead_tag":
      return <LeadMutationCard output={obj} label={`Tag: ${asString(obj["tag"]) ?? "?"}`} icon={<Tag className="size-3.5" aria-hidden="true" />} />;
    case "lead_note":
      return <LeadMutationCard output={obj} label="Note recorded" icon={<Notebook className="size-3.5" aria-hidden="true" />} />;
    case "qualification_summary":
      return <LeadMutationCard output={obj} label="Summary updated" icon={<FileText className="size-3.5" aria-hidden="true" />} />;
    case "sms_action":
      return <LeadMutationCard output={obj} label={asBool(obj["sent"]) ? "SMS sent" : asBool(obj["drafted"]) ? "SMS drafted" : "SMS"} icon={<MessageSquareReply className="size-3.5" aria-hidden="true" />} />;
    case "email_draft":
      return <LeadMutationCard output={obj} label="Email drafted" icon={<Send className="size-3.5" aria-hidden="true" />} />;
    case "call_script":
      return <Card icon={<FileText className="size-3.5" aria-hidden="true" />} title="Call script drafted" subtitle={asString(obj["purpose"])} />;
    case "call_summary":
      return <Card icon={<MessageSquareReply className="size-3.5" aria-hidden="true" />} title="Call history" subtitle={asBool(obj["found"]) ? `${asNumber(obj["callCount"]) ?? 0} recent call(s)` : asString(obj["note"])} />;
    case "uncertainty_flag":
      return <UncertaintyFlagCard output={obj} />;
    case "clarification_request":
      return <ClarificationCard output={obj} />;
    case "morning_briefing":
      return <BriefingCard output={obj} label="Morning briefing snapshot" />;
    case "end_of_day":
      return <BriefingCard output={obj} label="End-of-day snapshot" />;
    case "handoff_brief":
      return <BriefingCard output={obj} label="Handoff brief" />;
    case "workspace_query":
      return <WorkspaceQueryCard output={obj} />;
    case "delegated_task":
      return <DelegatedTaskCard output={obj} />;
    case "channel_card":
      return <ChannelCard output={obj} />;
    case "channel_message":
      return <LeadMutationCard output={obj} label={asBool(obj["posted"]) ? "Posted to channel" : "Channel post"} icon={<Send className="size-3.5" aria-hidden="true" />} />;
    case "proposed_action":
      return <Card icon={<CheckCircle2 className="size-3.5" aria-hidden="true" />} title={`Proposed: ${asString(obj["tool"]) ?? "action"}`} subtitle={asString(obj["reason"])} tone={asBool(obj["requiresApproval"]) ? "warn" : "good"} />;
    default:
      return null;
  }
}
