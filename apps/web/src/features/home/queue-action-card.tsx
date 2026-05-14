"use client";

import {
  AlertTriangle,
  ArrowRight,
  GitBranch,
  MessageSquare,
  Phone,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { useState, type ComponentType, type SVGProps } from "react";

import { FacebookGlyph, InstagramGlyph } from "../../components/harwick-icons";
import { Card } from "../../components/panels/panels";
import { PanelButton } from "../../components/panels/panel-button";
import { cn } from "../../lib/utils";
import { type WorkItem } from "./home-page";

type Source = "instagram" | "facebook" | "voice" | "operations";
type GlyphIcon = ComponentType<SVGProps<SVGSVGElement>> | LucideIcon;

function sourceFor(item: WorkItem): Source {
  if (item.kind === "reply") return item.item.source;
  if (item.item.type === "callback") return "voice";
  return "operations";
}

function sourceIcon(source: Source): GlyphIcon {
  if (source === "instagram") return InstagramGlyph;
  if (source === "facebook") return FacebookGlyph;
  if (source === "voice") return Phone;
  return AlertTriangle;
}

/** Tiny transparent source glyph in card corner — no plate, no ring. */
function sourceColor(source: Source): string {
  if (source === "instagram") return "text-[#DD2A7B]";
  if (source === "facebook") return "text-[#5A8DEF]";
  if (source === "voice") return "text-[var(--clay)]";
  return "text-[color:var(--graphite-text-faint)]";
}

function leadName(item: WorkItem): string {
  if (item.kind === "reply") {
    if (item.item.thread !== undefined) return item.item.thread.name;
    if (item.item.lead.startsWith("Lead ") || item.item.lead.length === 0) return "New conversation";
    return item.item.lead;
  }
  if (item.item.thread !== undefined) return item.item.thread.name;
  return item.item.title;
}

function leadHref(item: WorkItem): string | null {
  const leadId = item.kind === "reply" ? item.item.leadId : item.item.leadId;
  return leadId !== undefined && leadId !== null ? `/leads?leadId=${leadId}` : null;
}

function conversationHref(item: WorkItem): string | null {
  if (item.kind === "reply" && item.item.leadId !== undefined) {
    return item.item.reviewId !== undefined
      ? `/conversations?leadId=${item.item.leadId}&reviewId=${item.item.reviewId}`
      : `/conversations?leadId=${item.item.leadId}`;
  }
  if (item.kind === "task" && item.item.leadId !== undefined) {
    return `/conversations?leadId=${item.item.leadId}`;
  }
  return null;
}

/** A behavioral narrative for the lead — "what happened" in one short sentence.
 * Pulls the strongest available signal: AI synthesis handoff brief > thread
 * preview > task detail. Trimmed to two clauses if too long. */
function narrativeSummary(item: WorkItem): string {
  if (item.kind === "reply") {
    const thread = item.item.thread;
    const synthesis = thread?.aiSynthesis;
    if (synthesis !== null && synthesis !== undefined && synthesis.handoffBrief !== null && synthesis.handoffBrief.length > 0) {
      return synthesis.handoffBrief;
    }
    if (thread !== undefined && thread.preview.length > 0) {
      return thread.preview;
    }
    return item.item.message;
  }
  const task = item.item;
  if (task.thread?.aiSynthesis?.handoffBrief !== null && task.thread?.aiSynthesis?.handoffBrief !== undefined && task.thread.aiSynthesis.handoffBrief.length > 0) {
    return task.thread.aiSynthesis.handoffBrief;
  }
  return task.detail;
}

function kindIcon(item: WorkItem): LucideIcon {
  if (item.kind === "reply") return MessageSquare;
  const task = item.item;
  if (task.type === "callback") return Phone;
  if (task.type === "crm") {
    if (task.operationsFailureItemType !== undefined) return ShieldAlert;
    return GitBranch;
  }
  return AlertTriangle;
}

function urgencyTint(item: WorkItem): { dot: string; label: string } | null {
  if (item.kind === "reply") {
    if (item.item.automationMode === "human_takeover") return { dot: "bg-[var(--oxblood)]", label: "human takeover" };
    if (item.item.automationMode === "paused_by_rule") return { dot: "bg-[var(--clay)]", label: "AI paused" };
    return null;
  }
  if (item.item.tone === "red") return { dot: "bg-[var(--oxblood)]", label: "urgent" };
  if (item.item.tone === "amber") return { dot: "bg-[var(--clay)]", label: "needs review" };
  return null;
}

export function QueueActionCard(props: {
  item: WorkItem;
  enabled: boolean;
  onRefresh?: () => Promise<void> | void;
  onStatus?: (message: string | null) => void;
  onOpenDetail?: (item: WorkItem) => void;
}) {
  void props.enabled;
  void props.onRefresh;
  void props.onStatus;
  const source = sourceFor(props.item);
  const SourceIconCmp = sourceIcon(source) as ComponentType<SVGProps<SVGSVGElement> & { strokeWidth?: number }>;
  const KindIconCmp = kindIcon(props.item);
  const name = leadName(props.item);
  const summary = narrativeSummary(props.item);
  const tint = urgencyTint(props.item);
  const convoHref = conversationHref(props.item);
  const leadDetailHref = leadHref(props.item);
  const [pressed, setPressed] = useState(false);

  return (
    <Card
      interactive
      className={cn(
        "flex min-h-[140px] flex-col gap-3 p-4 transition-transform",
        pressed && "scale-[0.99]",
      )}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onClick={() => props.onOpenDetail?.(props.item)}
      onKeyDown={(event) => {
        if (props.onOpenDetail === undefined) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        props.onOpenDetail(props.item);
      }}
      role={props.onOpenDetail !== undefined ? "button" : undefined}
      tabIndex={props.onOpenDetail !== undefined ? 0 : undefined}
    >
      {/* Top row — transparent source glyph + name + tiny urgency dot */}
      <div className="flex items-start gap-2.5">
        <SourceIconCmp className={cn("mt-0.5 size-4 shrink-0", sourceColor(source))} aria-hidden="true" strokeWidth={2} />
        <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[-0.005em] text-[color:var(--graphite-text)]">
          {name}
        </h3>
        {tint === null ? null : (
          <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[color:var(--graphite-text-muted)]">
            <span className={cn("size-1.5 rounded-full", tint.dot)} aria-hidden="true" />
            {tint.label}
          </span>
        )}
      </div>

      {/* Middle — narrative summary, fills remaining height */}
      <p className="flex-1 text-[13px] leading-5 text-[color:var(--graphite-text-muted)] line-clamp-3">
        {summary}
      </p>

      {/* Bottom — actions */}
      <div className="flex items-center gap-1.5 pt-1">
        {convoHref === null ? null : (
          <PanelButton
            asChild
            size="sm"
            variant="ghost"
            onClick={(event) => event.stopPropagation()}
          >
            <a href={convoHref} onClick={(event) => event.stopPropagation()}>
              <MessageSquare className="mr-1 size-3" aria-hidden="true" />
              See convo
            </a>
          </PanelButton>
        )}
        {leadDetailHref === null ? null : (
          <PanelButton
            asChild
            size="sm"
            variant="ghost"
            onClick={(event) => event.stopPropagation()}
          >
            <a href={leadDetailHref} onClick={(event) => event.stopPropagation()}>
              <KindIconCmp className="mr-1 size-3" aria-hidden="true" />
              Open lead
            </a>
          </PanelButton>
        )}
        {props.onOpenDetail === undefined ? null : (
          <span
            className="ml-auto inline-flex items-center gap-1 text-[10.5px] text-[color:var(--graphite-text-faint)]"
            aria-hidden="true"
          >
            <ArrowRight className="size-3" />
            tap for detail
          </span>
        )}
      </div>
    </Card>
  );
}
