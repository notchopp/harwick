"use client";

import {
  automationModeLabel,
  type ConversationAutomationMode,
} from "@realty-ops/core";
import {
  Bot,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Grid2X2,
  List,
  MapPin,
  MessageSquare,
  PauseCircle,
  Phone,
  Route,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FacebookGlyph, InstagramGlyph, PhoneGlyph, SearchGlyph } from "../../components/harwick-icons";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../../components/ui/sheet";
import { WorkspaceTopbar } from "../../components/workspace-topbar";
import { cn } from "../../lib/utils";
import { LeadActionToolbar } from "../conversations/lead-action-toolbar";
import type { LeadPageItem, LeadPageSource, LeadPageStage } from "./leads-data";

type LeadStatus = "new" | "qualified" | "nurture" | "lost";
type SortBy = "newest" | "score" | "uncontacted";
type LeadsViewMode = "list" | "cards";

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

const demoWorkspaceId = "123e4567-e89b-12d3-a456-426614174000";

const fallbackLeads: LeadRecord[] = [
  {
    id: "1",
    workspaceId: demoWorkspaceId,
    name: "Marcus Thompson",
    initials: "MT",
    phone: null,
    source: "instagram",
    sourceDetail: 'comment on "4BR Coral Gables"',
    stage: "hot",
    stageLabel: "hot buyer",
    cardKind: "listing",
    intent: "purchase",
    score: 87,
    budget: "unknown",
    area: "Coral Gables",
    timeline: "unknown",
    propertyType: "home search",
    assignedTo: "Sarah Kim",
    sourceOwner: "workspace",
    lastTouch: "2m ago",
    routeReason: "high-intent inquiry with open agent coverage in Coral Gables",
    listing: "4BR Coral Gables",
    message: "Is this still available? We've been looking in this area for months 👀",
    reviewId: null,
    automationMode: "ai_on",
    automationReason: "safe listing reply with one missing qualification field",
    displayStatus: "new",
    draft:
      "Hi Marcus — yes, still available! This one just had a price adjustment last week. Happy to send full details and schedule a walkthrough at your convenience. What's your timeline?",
    helperSuggestion: "If Marcus answers under 90 days, route immediately and offer two showing windows.",
    primaryAction: "send action",
    secondaryAction: "take over",
    subStatus: "Not contacted",
    timelineItems: [
      "instagram comment captured",
      "purchase intent detected from listing inquiry",
      "routing matched Sarah Kim by area coverage",
    ],
  },
  {
    id: "2",
    workspaceId: demoWorkspaceId,
    name: "Diana Reyes",
    initials: "DR",
    phone: "+13055550182",
    source: "voice",
    sourceDetail: "voice call",
    stage: "callback",
    stageLabel: "callback",
    cardKind: "area",
    intent: "renter",
    score: 72,
    budget: "$3k-$4k",
    area: "Brickell",
    timeline: "now",
    propertyType: "lease",
    assignedTo: "Sarah Kim",
    sourceOwner: "workspace",
    lastTouch: "18m ago",
    routeReason: "callback queue because the lead requested a live agent after a missed call",
    listing: "3BR rental search",
    message: "Inbound call · 3BR rental $3,500/mo · Missed — callback needed",
    reviewId: null,
    automationMode: "paused_by_rule",
    automationReason: "callback intent needs human contact before more automation",
    displayStatus: "new",
    draft: "Call Diana back first. Confirm move-in date, pets, and whether she has already toured any Brickell rentals.",
    helperSuggestion: "Call first, then let Harwick summarize and prepare the next action.",
    primaryAction: "call back",
    secondaryAction: "resume ai",
    subStatus: "Callback due",
    timelineItems: [
      "voice transcript summarized",
      "rental budget extracted",
      "callback task created for assigned agent",
    ],
  },
  {
    id: "3",
    workspaceId: demoWorkspaceId,
    name: "Keisha Brown",
    initials: "KB",
    phone: null,
    source: "facebook",
    sourceDetail: 'facebook dm on "Coconut Grove Open House"',
    stage: "qualified",
    stageLabel: "qualified",
    cardKind: "listing",
    intent: "purchase",
    score: 91,
    budget: "$850k-$950k",
    area: "Coconut Grove",
    timeline: "30-45 days",
    propertyType: "home search",
    assignedTo: "Marcus Lee",
    sourceOwner: "workspace",
    lastTouch: "41m ago",
    routeReason: "open-house inquiry already matched to the listing owner",
    listing: "Coconut Grove Open House",
    message: "What time does the open house start this Sunday? Can I bring my husband?",
    reviewId: null,
    automationMode: "ai_on",
    automationReason: "open house details are verified and safe to send",
    displayStatus: "qualified",
    draft: "Hi Keisha! The open house is Sunday 1–4 PM — absolutely bring your husband. Let me know if you'd like a private showing beforehand too.",
    helperSuggestion: "Register Keisha and her husband before asking for a private showing.",
    primaryAction: "register attendee",
    secondaryAction: "take over",
    subStatus: "FUB synced",
    timelineItems: [
      "facebook dm linked to open house",
      "high-intent spouse attendance captured",
      "crm sync completed",
    ],
  },
  {
    id: "4",
    workspaceId: demoWorkspaceId,
    name: "Tonya Williams",
    initials: "TW",
    phone: null,
    source: "instagram",
    sourceDetail: "story reply",
    stage: "nurture",
    stageLabel: "nurture",
    cardKind: "area",
    intent: "browse",
    score: 44,
    budget: "unknown",
    area: "Waterfront",
    timeline: "6+ months",
    propertyType: "home search",
    assignedTo: "Diana Prince",
    sourceOwner: "workspace",
    lastTouch: "3h ago",
    routeReason: "kept in nurture until timeline and budget are stronger",
    listing: "Waterfront search",
    message: "Love this property! Is there a showing this week?",
    reviewId: null,
    automationMode: "ai_on",
    automationReason: "soft nurture reply can continue collecting preferences",
    displayStatus: "nurture",
    draft: "Happy to send more waterfront options. Are you mostly just browsing, or is there a timeframe you’re hoping to move within?",
    helperSuggestion: "Ask only one follow-up question next so the thread stays warm and easy to answer.",
    primaryAction: "send action",
    secondaryAction: "take over",
    subStatus: "Follow-up due",
    timelineItems: [
      "story reply captured",
      "nurture lane preserved because timeline is long-range",
      "follow-up reminder still active",
    ],
  },
];

const statusStyles: Record<LeadStatus, string> = {
  new: "bg-brass-soft text-warm",
  qualified: "bg-sage-soft text-qualified",
  nurture: "bg-surface-muted text-muted-subtle",
  lost: "bg-oxblood-soft text-hot",
};

const sourceBoxStyles: Record<LeadPageSource, string> = {
  instagram: "bg-[#F0E5F5] text-[#5B2D7B]",
  facebook: "bg-[#E5EBF5] text-[#1A3A6B]",
  voice: "bg-sage-soft text-qualified",
};

const subStatusStyles: Record<string, string> = {
  "Not contacted": "text-muted-subtle",
  "Callback due": "text-hot",
  "FUB synced": "text-qualified",
  "Owner review": "text-warm",
  "Follow-up due": "text-muted-subtle",
  "Showing ready": "text-qualified",
};

const leadsPageSize = 12;

function clampPage(page: number, pageCount: number) {
  return Math.min(Math.max(page, 1), Math.max(pageCount, 1));
}

function sourceLabel(source: LeadPageSource) {
  return source === "voice" ? "Voice" : source.charAt(0).toUpperCase() + source.slice(1);
}

function stageTone(stage: LeadPageStage) {
  if (stage === "qualified" || stage === "showing") {
    return "qualified" as const;
  }

  if (stage === "nurture") {
    return "warm" as const;
  }

  return "hot" as const;
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
    && typeof item["score"] === "number"
    && typeof item["budget"] === "string"
    && typeof item["area"] === "string"
    && typeof item["timeline"] === "string"
    && typeof item["propertyType"] === "string"
    && typeof item["assignedTo"] === "string"
    && typeof item["sourceOwner"] === "string"
    && typeof item["lastTouch"] === "string"
    && typeof item["routeReason"] === "string"
    && typeof item["listing"] === "string"
    && typeof item["message"] === "string"
    && (typeof item["reviewId"] === "string" || item["reviewId"] === null || item["reviewId"] === undefined)
    && (typeof item["automationMode"] === "string" || item["automationMode"] === null || item["automationMode"] === undefined)
    && (typeof item["automationReason"] === "string" || item["automationReason"] === null || item["automationReason"] === undefined);
}

function SourceGlyph(props: { source: LeadPageSource }) {
  if (props.source === "instagram") {
    return <InstagramGlyph className="h-[15px] w-[15px]" />;
  }

  if (props.source === "facebook") {
    return <FacebookGlyph className="h-[15px] w-[15px]" />;
  }

  return <PhoneGlyph className="h-[15px] w-[15px]" />;
}

function FilterChip(props: { active: boolean; children: string; onClick: () => void }) {
  return (
    <button
      className={cn(
        "harwick-pill px-[11px] py-1 text-[11.5px] text-muted transition-all hover:-translate-y-px hover:border-border-strong hover:text-foreground",
        props.active && "harwick-pill-active hover:border-harwick-ink hover:text-white",
      )}
      onClick={props.onClick}
      type="button"
    >
      {props.children}
    </button>
  );
}

function DetailSection(props: { children: React.ReactNode; title: string }) {
  return (
    <div className="harwick-card px-4 py-4">
      <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-subtle">
        {props.title}
      </div>
      {props.children}
    </div>
  );
}

function KeyValue(props: { label: string; value: string }) {
  return (
    <div className="border-b border-border pb-2.5 last:border-b-0 last:pb-0">
      <div className="text-[10px] uppercase tracking-[0.1em] text-muted-subtle">{props.label}</div>
      <div className="mt-1 text-[12px] font-semibold text-foreground">{props.value}</div>
    </div>
  );
}

function LeadConversationPanel(props: {
  lead: LeadRecord;
  mode: ConversationAutomationMode;
  workspaceId: string;
  currentMemberId: string;
  onChanged?: () => void | Promise<void>;
}) {
  const aiPaused = props.mode !== "ai_on";
  const modeTone = props.mode === "ai_on"
    ? "border-sage/25 bg-sage-soft text-qualified"
    : props.mode === "human_takeover"
      ? "border-clay/25 bg-clay-soft text-warm"
      : "border-oxblood/20 bg-oxblood-soft text-hot";

  return (
    <div className="overflow-hidden rounded-[22px] border border-border bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
            <MessageSquare aria-hidden="true" className="h-4 w-4 text-muted" strokeWidth={1.8} />
            conversation
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {([
              ["intent", props.lead.intent],
              ["area", props.lead.area],
              ["budget", props.lead.budget],
              ["timeline", props.lead.timeline],
            ] as Array<[string, string]>)
              .filter(([, value]) => value.toLowerCase() !== "unknown")
              .map(([label, value]) => (
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-muted px-2.5 py-1 text-[10.5px] text-muted" key={label}>
                  <span className="font-semibold text-muted-subtle">{label}</span>
                  <span className="max-w-[150px] truncate font-semibold text-foreground">{value}</span>
                </span>
              ))}
          </div>
        </div>
        <div className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold", modeTone)}>
          {aiPaused ? (
            <PauseCircle aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.8} />
          ) : (
            <Bot aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.8} />
          )}
          {automationModeLabel(props.mode)}
        </div>
      </div>

      <div className="space-y-3 bg-background p-5">
        <div className="flex justify-start">
          <div className="max-w-[78%] rounded-[18px] rounded-bl-md bg-surface-muted px-4 py-3">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-subtle">
              {props.lead.name}
            </div>
            <div className="text-[13px] leading-5 text-foreground">{props.lead.message}</div>
          </div>
        </div>
        <div className="flex justify-end">
          <div className="max-w-[82%] rounded-[18px] rounded-br-md border border-harwick-brass/35 bg-brass-soft/70 px-4 py-3">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-warm">
              <Bot aria-hidden="true" className="h-3.5 w-3.5" />
              AI Action — Ready for approval
            </div>
            <div className="text-[13px] leading-5 text-foreground">{props.lead.draft}</div>
          </div>
        </div>
        <div className="flex justify-end">
          <div className="rounded-full border border-border bg-surface px-3 py-2 text-[12px] text-muted">
            {aiPaused ? "Harwick is listening only" : "Harwick is preparing the next action"}
          </div>
        </div>
      </div>

      <div className="border-t border-border bg-surface px-5 py-4 space-y-3">
        <div className="flex items-start gap-2">
          <ClipboardCheck aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-harwick-brass" strokeWidth={1.8} />
          <div className="min-w-0">
            <div className="text-[11.5px] font-semibold text-foreground">Harwick helper</div>
            <p className="mt-0.5 text-[11.5px] leading-5 text-muted">{props.lead.automationReason}</p>
            <p className="mt-0.5 text-[11px] leading-5 text-muted-subtle">{props.lead.helperSuggestion}</p>
          </div>
        </div>
        <LeadActionToolbar
          workspaceId={props.workspaceId}
          leadId={props.lead.id}
          automationMode={props.mode}
          assignedMemberId={null}
          currentMemberId={props.currentMemberId}
          draft={props.lead.draft}
          reviewId={props.lead.reviewId ?? null}
          {...(props.onChanged === undefined ? {} : { onChanged: props.onChanged })}
        />
      </div>
    </div>
  );
}

function LeadActivityTimeline(props: { lead: LeadRecord }) {
  const items = [
    {
      detail: props.lead.message,
      label: "message captured",
      time: props.lead.lastTouch,
      tone: "stone" as const,
    },
    {
      detail: `${props.lead.intent} / ${props.lead.area} / ${props.lead.budget} / ${props.lead.timeline}`,
      label: "qualification updated",
      time: "live",
      tone: "green" as const,
    },
    {
      detail: props.lead.routeReason,
      label: "routing decision",
      time: props.lead.assignedTo,
      tone: props.lead.subStatus === "Owner review" ? "amber" as const : "green" as const,
    },
    ...props.lead.timelineItems.map((item) => ({
      detail: item,
      label: "system event",
      time: "recorded",
      tone: "stone" as const,
    })),
  ];

  return (
    <DetailSection title="activity timeline">
      <div className="space-y-0">
        {items.map((item, index) => (
          <div className="flex gap-3" key={`${item.label}-${index}`}>
            <div className="flex w-3 flex-col items-center">
              <span
                className={cn(
                  "mt-1.5 h-2.5 w-2.5 rounded-full",
                  item.tone === "green" && "bg-qualified",
                  item.tone === "amber" && "bg-warm",
                  item.tone === "stone" && "bg-muted-subtle",
                )}
              />
              {index === items.length - 1 ? null : <span className="mt-1 h-11 w-px bg-border" />}
            </div>
            <div className="pb-4">
              <div className="text-[12.5px] font-semibold text-foreground">{item.label}</div>
              <div className="mt-0.5 text-[11px] text-muted-subtle">{item.time} · {item.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </DetailSection>
  );
}

function LeadContextCard(props: { lead: LeadRecord }) {
  return (
    <div className="overflow-hidden rounded-[22px] border border-border bg-surface">
      <div className="relative h-[156px] bg-[linear-gradient(145deg,#1b241e_0%,#244233_52%,#1a2d24_100%)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(137,177,116,0.24),transparent_28%),linear-gradient(180deg,rgba(7,15,10,0.02),rgba(7,15,10,0.72))]" />
        <div className="absolute inset-x-4 bottom-4 text-white">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/58">
            {props.lead.cardKind === "seller" ? "seller property" : props.lead.cardKind === "area" ? "search context" : "listing context"}
          </div>
          <div className="mt-1 truncate font-display text-[23px] font-medium leading-none">{props.lead.listing}</div>
          <div className="mt-1 truncate text-[12px] text-white/68">{props.lead.message}</div>
        </div>
      </div>
      <div className="grid gap-2 p-4">
        <div className="rounded-[18px] bg-surface-muted p-4">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-muted-subtle">
            <MapPin aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.7} />
            area
          </div>
          <div className="mt-2 truncate text-[13px] font-semibold">{props.lead.area}</div>
        </div>
        <div className="rounded-[18px] bg-surface-muted p-4">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-muted-subtle">
            <CircleDollarSign aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.7} />
            budget
          </div>
          <div className="mt-2 truncate text-[13px] font-semibold">{props.lead.budget}</div>
        </div>
        <div className="rounded-[18px] bg-surface-muted p-4">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-muted-subtle">
            <CalendarClock aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.7} />
            timeline
          </div>
          <div className="mt-2 truncate text-[13px] font-semibold">{props.lead.timeline}</div>
        </div>
      </div>
    </div>
  );
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
    <div className="mt-4 flex flex-col gap-3 rounded-[14px] border border-border bg-surface px-4 py-3 text-[12px] text-muted shadow-[var(--shadow-tight)] sm:flex-row sm:items-center sm:justify-between">
      <div>
        showing {start}-{end} of {props.itemCount}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={props.currentPage <= 1}
          onClick={() => props.onPageChange(props.currentPage - 1)}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-[12px] font-medium text-muted transition hover:border-border-strong hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          prev
        </button>
        <span className="min-w-20 text-center text-[11px] text-muted-subtle">
          page {props.currentPage} / {props.pageCount}
        </span>
        <button
          type="button"
          disabled={props.currentPage >= props.pageCount}
          onClick={() => props.onPageChange(props.currentPage + 1)}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-[12px] font-medium text-muted transition hover:border-border-strong hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
        >
          next
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function LeadDetailSheet(props: {
  actionStatus: string | null;
  currentMemberId: string;
  lead: LeadRecord | null;
  onChanged?: () => void | Promise<void>;
  onOpenFullConversation: (leadId: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const lead = props.lead;

  return (
    <Sheet onOpenChange={props.onOpenChange} open={lead !== null}>
      <SheetContent className="w-[min(1040px,calc(100vw-24px))] gap-0 overflow-y-auto bg-background p-0 sm:max-w-none">
        {lead ? (
          <>
            <SheetHeader className="border-b border-border bg-surface px-7 py-6">
              <div className="flex flex-wrap items-start justify-between gap-4 pr-9">
                <div className="min-w-0">
                  <div className="mb-3 flex flex-wrap gap-2">
                    <Badge tone={stageTone(lead.stage)}>{lead.stageLabel}</Badge>
                    <Badge tone="neutral">
                      <SourceGlyph source={lead.source} />
                      {sourceLabel(lead.source)}
                    </Badge>
                  </div>
                  <SheetTitle className="font-display text-[30px] font-medium leading-none">{lead.name}</SheetTitle>
                  <SheetDescription className="mt-2 text-[13px] text-muted">
                    {lead.intent} lead from {lead.sourceDetail}. score {lead.score}. last touch {lead.lastTouch}.
                  </SheetDescription>
                </div>
                <div className="flex gap-2">
                  {lead.source === "voice" && lead.phone !== null ? (
                    <Button
                      asChild
                      className="rounded-full bg-harwick-ink px-4 text-[12px]"
                      size="sm"
                    >
                      <a href={`tel:${lead.phone}`}>
                        <Phone aria-hidden="true" />
                        call
                      </a>
                    </Button>
                  ) : null}
                  <Button
                    className="rounded-full border-border bg-surface px-4 text-[12px] text-foreground hover:bg-surface-muted hover:text-foreground"
                    onClick={() => props.onOpenFullConversation(lead.id)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    open full convo
                  </Button>
                </div>
              </div>
            </SheetHeader>

            <div className="grid gap-6 p-7 lg:grid-cols-[minmax(0,1fr)_330px]">
              <section className="min-w-0 space-y-5">
                <LeadConversationPanel
                  lead={lead}
                  mode={lead.automationMode}
                  workspaceId={lead.workspaceId}
                  currentMemberId={props.currentMemberId}
                  {...(props.onChanged === undefined ? {} : { onChanged: props.onChanged })}
                />
                <LeadActivityTimeline lead={lead} />
              </section>

              <aside className="space-y-5">
                <LeadContextCard lead={lead} />
                <div className="rounded-[22px] border border-border bg-surface p-5">
                  <div className="flex items-center gap-2 text-[13px] font-semibold">
                    <Route aria-hidden="true" className="h-4 w-4 text-qualified" strokeWidth={1.8} />
                    assignment
                  </div>
                  <div className="mt-4 space-y-3 text-[12px]">
                    <KeyValue label="assigned to" value={lead.assignedTo} />
                    <KeyValue label="source credit" value={lead.sourceOwner} />
                    <KeyValue label="route reason" value={lead.routeReason} />
                    <KeyValue label="next action" value={lead.primaryAction} />
                  </div>
                </div>

                <div className="rounded-[22px] border border-border bg-surface p-5">
                  <div className="flex items-center gap-2 text-[13px] font-semibold">
                    <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-qualified" strokeWidth={1.8} />
                    qualification
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {[
                      ["intent", lead.intent],
                      ["type", lead.propertyType],
                      ["score", String(lead.score)],
                      ["source", sourceLabel(lead.source)],
                    ].map(([label, value]) => (
                      <div className="rounded-[16px] bg-surface-muted p-3" key={label}>
                        <div className="text-[10px] uppercase tracking-[0.1em] text-muted-subtle">{label}</div>
                        <div className="mt-1 truncate text-[12px] font-semibold">{value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <DetailSection title="Harwick note">
                  <div className="flex items-center gap-2 text-[12px] font-semibold text-foreground">
                    <ClipboardCheck aria-hidden="true" className="h-4 w-4 text-harwick-brass" strokeWidth={1.8} />
                    operator context
                  </div>
                  <div className="mt-2 text-[12px] leading-5 text-muted">
                    This sheet is now opening from the remapped lead rows and is wired to the existing lead API in development.
                  </div>
                  {props.actionStatus ? (
                    <div className="mt-3 text-[11px] leading-5 text-muted-subtle">{props.actionStatus}</div>
                  ) : null}
                </DetailSection>
              </aside>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function LeadsPageContent(props: { workspaceId: string; workspaceName: string; currentMemberId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const leadIdParam = searchParams.get("leadId");
  const [activeTab, setActiveTab] = useState<LeadStatus | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<LeadPageSource | "all">("all");
  const [sortBy, setSortBy] = useState<SortBy>("newest");
  const [viewMode, setViewMode] = useState<LeadsViewMode>("list");
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState("");
  const [leadRecords, setLeadRecords] = useState<LeadRecord[]>(fallbackLeads);
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
    try {
      const response = await fetch(`/api/leads?workspaceId=${props.workspaceId}&limit=50`, {
        cache: "no-store",
      });

      if (!response.ok) {
        return;
      }

      const body: unknown = await response.json();
      const items =
        typeof body === "object" && body !== null && "items" in body && Array.isArray((body as { items?: unknown }).items)
          ? ((body as { items: unknown[] }).items.filter(isLeadPageItem).map(mapLeadPageItemToRecord))
          : [];

      if (items.length > 0) {
        setLeadRecords(items);
      }
    } catch {
      // Keep local fallback rows until workspace auth/seed data is available.
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
    if (matchedLead?.id !== selectedLead?.id) {
      setSelectedLead(matchedLead);
    }
  }, [leadIdParam, leadRecords, selectedLead]);

  useEffect(() => {
    setActionStatus(null);
  }, [selectedLead?.id]);

  const filtered = useMemo(() => {
    let rows = [...leadRecords];

    if (activeTab !== "all") {
      rows = rows.filter((row) => row.displayStatus === activeTab);
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
  }, [activeTab, leadRecords, search, sortBy, sourceFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / leadsPageSize));
  const safeCurrentPage = clampPage(currentPage, pageCount);
  const pagedLeads = useMemo(
    () => filtered.slice((safeCurrentPage - 1) * leadsPageSize, safeCurrentPage * leadsPageSize),
    [filtered, safeCurrentPage],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, sourceFilter, sortBy, search, viewMode, leadRecords.length]);

  useEffect(() => {
    if (currentPage !== safeCurrentPage) {
      setCurrentPage(safeCurrentPage);
    }
  }, [currentPage, safeCurrentPage]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <WorkspaceTopbar context={`leads · ${filtered.length} shown`} workspaceName={props.workspaceName}>
        <Button
          className="ml-auto rounded-full bg-foreground px-4 text-[11px] text-white"
          onClick={() => {
            const targetLead = selectedLead ?? filtered[0] ?? null;
            if (targetLead === null) {
              setActionStatus("Select a lead first so the next action can open in conversations.");
              return;
            }
            void handlePrimaryAction(targetLead);
          }}
          size="sm"
          type="button"
        >
          send action
        </Button>
      </WorkspaceTopbar>

      <div className="flex shrink-0 border-b border-border bg-surface px-7">
        {(["All Leads", "New", "Qualified", "Nurture", "Lost"] as const).map((tab) => {
          const value = tab.toLowerCase().split(" ")[0] as LeadStatus | "all";
          const isActive = activeTab === (value === "all" ? "all" : value);

          return (
            <button
              className={cn(
                "border-b-2 px-[14px] py-[11px] text-[12.5px] transition-colors",
                isActive ? "border-foreground text-foreground" : "border-transparent text-muted-subtle hover:text-muted",
              )}
              key={tab}
              onClick={() => setActiveTab(value === "all" ? "all" : value)}
              type="button"
            >
              {tab}
            </button>
          );
        })}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-surface px-7 py-3">
        <span className="text-[11.5px] text-muted-subtle">Source:</span>
        {(["all", "instagram", "facebook", "voice"] as const).map((filterValue) => (
          <FilterChip active={sourceFilter === filterValue} key={filterValue} onClick={() => setSourceFilter(filterValue)}>
            {filterValue === "all" ? "All" : sourceLabel(filterValue)}
          </FilterChip>
        ))}
        <div className="mx-1 h-[18px] w-px bg-border" />
        <span className="text-[11.5px] text-muted-subtle">Sort:</span>
        {(["newest", "score", "uncontacted"] as const).map((sortValue) => (
          <FilterChip active={sortBy === sortValue} key={sortValue} onClick={() => setSortBy(sortValue)}>
            {sortValue === "score" ? "Score ↓" : sortValue.charAt(0).toUpperCase() + sortValue.slice(1)}
          </FilterChip>
        ))}
        <div className="mx-1 h-[18px] w-px bg-border" />
        <div className="harwick-pill inline-flex p-1">
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition",
              viewMode === "list" ? "harwick-pill-active" : "text-muted hover:text-foreground",
            )}
          >
            <List className="h-3.5 w-3.5" />
            list
          </button>
          <button
            type="button"
            onClick={() => setViewMode("cards")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition",
              viewMode === "cards" ? "harwick-pill-active" : "text-muted hover:text-foreground",
            )}
          >
            <Grid2X2 className="h-3.5 w-3.5" />
            cards
          </button>
        </div>
        <div className="harwick-control ml-auto flex w-[180px] items-center gap-[7px] px-[11px] py-[5px] text-[12px] text-muted-subtle">
          <SearchGlyph className="h-3 w-3 shrink-0" />
          <input
            className="w-full bg-transparent outline-none placeholder:text-muted-subtle"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search leads..."
            value={search}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-7 pt-4">
        {viewMode === "cards" ? (
          <div className="grid gap-4 xl:grid-cols-2 min-[1700px]:grid-cols-3">
            {pagedLeads.map((lead) => (
              <button
                className="group relative min-h-[260px] overflow-hidden rounded-[26px] bg-harwick-ink p-4 text-left text-white shadow-[0_24px_76px_rgba(18,26,20,0.18)] ring-1 ring-black/[0.04] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_34px_88px_rgba(18,26,20,0.22)]"
                key={lead.id}
                onClick={() => {
                  setSelectedLead(lead);
                  replaceLeadQuery(lead.id);
                }}
                type="button"
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(255,255,255,0.16),transparent_26%),linear-gradient(145deg,#0c1711_0%,#233829_54%,#07100a_100%)]" />
                <div className="absolute inset-x-0 bottom-0 h-[70%] bg-[linear-gradient(180deg,transparent_0%,rgba(5,10,7,0.86)_100%)]" />
                <div className="relative z-10 flex h-full flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/12 px-2.5 py-1 text-[11px] font-medium backdrop-blur">
                        <SourceGlyph source={lead.source} />
                        {sourceLabel(lead.source)}
                      </span>
                      <span className="rounded-full border border-white/12 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/82">
                        {lead.stageLabel}
                      </span>
                    </div>
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 font-display text-[20px] font-medium text-harwick-ink">
                      {lead.score}
                    </span>
                  </div>
                  <div className="mt-auto rounded-[20px] border border-white/10 bg-[#07100a]/58 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-[10px]">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/16 bg-white/10 text-[12px] font-semibold">
                        {lead.initials}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-[20px] font-semibold">{lead.name}</div>
                        <div className="mt-1 truncate text-[12px] text-white/52">{lead.sourceDetail}</div>
                      </div>
                    </div>
                    <div className="mt-4 line-clamp-2 rounded-[14px] border border-white/10 bg-black/18 px-3 py-2 text-[12px] italic leading-5 text-white/70">
                      "{lead.message}"
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/14 pt-4 text-[12px]">
                      <div>
                        <div className="text-white/38">area</div>
                        <div className="mt-1 font-semibold text-white/86">{lead.area}</div>
                      </div>
                      <div>
                        <div className="text-white/38">range</div>
                        <div className="mt-1 font-semibold text-white/86">{lead.budget}</div>
                      </div>
                      <div>
                        <div className="text-white/38">timeline</div>
                        <div className="mt-1 font-semibold text-white/86">{lead.timeline}</div>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-white/14 pt-3 text-[12px] text-white/52">
                      <span>to <span className="font-semibold text-white/78">{lead.assignedTo}</span></span>
                      <span>{lead.lastTouch}</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          pagedLeads.map((lead) => (
            <div
              className="harwick-card mb-2 flex cursor-pointer items-center gap-[14px] px-4 py-[13px] transition-all duration-150 hover:-translate-y-0.5 hover:border-border-strong"
              key={lead.id}
              onClick={() => {
                setSelectedLead(lead);
                replaceLeadQuery(lead.id);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedLead(lead);
                  replaceLeadQuery(lead.id);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <div className={cn("flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px]", sourceBoxStyles[lead.source])}>
                <SourceGlyph source={lead.source} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-center gap-[7px]">
                  <span className="text-[13.5px] font-medium">{lead.name}</span>
                  <span className={cn("rounded-full px-[7px] py-0.5 text-[10px] font-medium", statusStyles[lead.displayStatus])}>
                    {lead.displayStatus.charAt(0).toUpperCase() + lead.displayStatus.slice(1)}
                  </span>
                </div>
                <div className="truncate text-[12px] text-muted">{lead.message}</div>
              </div>

              <div className="hidden min-w-[130px] text-[11px] text-muted-subtle md:block">
                <div className="truncate text-muted">{lead.area}</div>
                <div className="mt-0.5 truncate">{lead.budget} · {lead.timeline}</div>
              </div>

              <div className="flex w-[44px] shrink-0 flex-col items-center gap-[3px]">
                <div className="font-display text-[20px] font-medium leading-none">{lead.score}</div>
                <div className="text-[9px] uppercase tracking-[0.1em] text-muted-subtle">Score</div>
              </div>

              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-muted text-[10px] font-medium text-muted">
                {lead.assignedTo
                  .split(" ")
                  .filter(Boolean)
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </div>

              <div className="min-w-[88px] shrink-0 text-right text-[11px] text-muted-subtle">
                <div>{lead.lastTouch}</div>
                <div className={cn("mt-0.5 text-[10px]", subStatusStyles[lead.subStatus] ?? "text-muted-subtle")}>
                  {lead.subStatus}
                </div>
              </div>
            </div>
          ))
        )}
        <LeadsPaginationFooter
          currentPage={safeCurrentPage}
          itemCount={filtered.length}
          pageCount={pageCount}
          pageSize={leadsPageSize}
          onPageChange={setCurrentPage}
        />
      </div>

      <LeadDetailSheet
        actionStatus={actionStatus}
        currentMemberId={props.currentMemberId}
        lead={selectedLead}
        onChanged={() => void refreshLeads()}
        onOpenFullConversation={(leadId) => router.push(`/conversations?leadId=${leadId}`)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedLead(null);
            replaceLeadQuery(null);
          }
        }}
      />
    </div>
  );
}
