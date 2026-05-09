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
  Play,
  Plus,
  Search,
  SortAsc,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FacebookGlyph, InstagramGlyph, PhoneGlyph } from "../../components/harwick-icons";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";
import type { LeadPageItem, LeadPageSource, LeadPageStage } from "./leads-data";

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
  return source === "voice" ? "Voice" : source.charAt(0).toUpperCase() + source.slice(1);
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
    && typeof item["leadType"] === "string"
    && typeof item["intentLevel"] === "string"
    && typeof item["score"] === "number"
    && typeof item["budget"] === "string"
    && typeof item["area"] === "string"
    && typeof item["timeline"] === "string"
    && typeof item["propertyType"] === "string"
    && typeof item["financingStatus"] === "string"
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

  return "bg-surface-muted text-muted";
}

function automationLabel(mode: ConversationAutomationMode): { className: string; label: string } {
  if (mode === "ai_on") {
    return { className: "text-qualified", label: "AI Active" };
  }

  if (mode === "human_takeover") {
    return { className: "text-warm", label: "Human" };
  }

  return { className: "text-muted", label: "AI Paused" };
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
        "flex w-full items-start gap-4 px-6 py-4 text-left transition-colors hover:bg-surface-muted/70",
        props.isSelected && "bg-surface-muted",
      )}
      onClick={props.onSelect}
      type="button"
    >
      <Avatar className="h-10 w-10 shrink-0 border border-border">
        <AvatarFallback className="bg-surface-muted text-sm text-foreground">
          {props.lead.initials}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-foreground">{props.lead.name}</span>
          <span className={cn("h-5 rounded-full px-2 py-0.5 text-[11px] font-medium", leadTypeTone(props.lead.leadType))}>
            {props.lead.leadType === "unknown" ? "unqualified" : props.lead.leadType}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
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
              <Badge className="h-5 rounded-full border-border bg-transparent text-[11px] text-muted" key={value} tone="neutral">
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
        <span className="text-xs text-muted-subtle">{props.lead.lastTouch}</span>
      </div>
    </button>
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
}) {
  const [automationMode, setAutomationMode] = useState<ConversationAutomationMode>(props.lead.automationMode);

  useEffect(() => {
    setAutomationMode(props.lead.automationMode);
  }, [props.lead]);

  const automationPaused = automationMode !== "ai_on";

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-border/50 bg-surface">
      <div className="flex h-[57px] items-center justify-between border-b border-border/50 px-4">
        <h2 className="text-sm font-medium text-foreground">Lead Details</h2>
        <Button className="h-8 w-8 rounded-[8px]" onClick={props.onClose} size="icon" type="button" variant="ghost">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-6 p-4">
          <div className="flex items-start gap-4">
            <Avatar className="h-14 w-14 border border-border/60">
              <AvatarFallback className="bg-surface-muted text-lg text-foreground">
                {props.lead.initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-lg font-semibold text-foreground">{props.lead.name}</h3>
              <div className="mt-1 flex items-center gap-2">
                <Badge className={cn("text-xs", leadTypeTone(props.lead.leadType))}>
                  {props.lead.leadType}
                </Badge>
                <span className="text-sm text-muted">Score: {props.lead.score}</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-3 text-sm">
              <Mail className="h-4 w-4 text-muted" />
              <span className="text-muted">No email captured</span>
            </div>
            {props.lead.phone !== null ? (
              <div className="flex items-center gap-3 text-sm">
                <Phone className="h-4 w-4 text-muted" />
                <span className="text-foreground">{props.lead.phone}</span>
              </div>
            ) : null}
            <div className="flex items-center gap-3 text-sm">
              <SourceGlyph source={props.lead.source} />
              <span className="text-foreground">{props.lead.sourceDetail}</span>
            </div>
          </div>

          <div className="rounded-[10px] border border-border/50 bg-background p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className={cn("flex h-10 w-10 items-center justify-center rounded-[8px]", automationPaused ? "bg-clay-soft" : "bg-sage-soft")}>
                  {automationPaused ? (
                    <Pause className="h-5 w-5 text-warm" />
                  ) : (
                    <Bot className="h-5 w-5 text-qualified" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{automationModeLabel(automationMode)}</p>
                  <p className="truncate text-xs text-muted">{props.lead.automationReason}</p>
                </div>
              </div>

              {automationMode !== "human_takeover" ? (
                <Button
                  className="h-8 gap-1.5 rounded-[8px]"
                  onClick={() => setAutomationMode((current) => current === "ai_on" ? "paused_by_rule" : "ai_on")}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {automationPaused ? (
                    <>
                      <Play className="h-3.5 w-3.5" />
                      Resume
                    </>
                  ) : (
                    <>
                      <Pause className="h-3.5 w-3.5" />
                      Pause
                    </>
                  )}
                </Button>
              ) : null}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-subtle">
              Assigned To
            </p>
            <div className="flex items-center justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-surface-muted text-xs text-foreground">
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
                  <p className="truncate text-sm font-medium text-foreground">{props.lead.assignedTo}</p>
                  <p className="text-xs text-muted">Current routing owner</p>
                </div>
              </div>
              <Button className="h-8 text-xs" size="sm" type="button" variant="ghost">
                Reassign
              </Button>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-subtle">
              Actions
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button className="h-9 justify-start gap-1.5 rounded-[8px]" onClick={() => props.onOpenConversation(props.lead.id)} size="sm" type="button" variant="outline">
                <MessageSquare className="h-4 w-4" />
                Message
              </Button>
              <Button className="h-9 justify-start gap-1.5 rounded-[8px]" size="sm" type="button" variant="outline">
                <CalendarClock className="h-4 w-4" />
                Schedule
              </Button>
              <Button className="h-9 justify-start gap-1.5 rounded-[8px]" size="sm" type="button" variant="outline">
                <ExternalLink className="h-4 w-4" />
                View in FUB
              </Button>
              <Button className="h-9 justify-start gap-1.5 rounded-[8px]" onClick={() => void props.onPrimaryAction(props.lead)} size="sm" type="button" variant="outline">
                <Bot className="h-4 w-4" />
                AI Action
              </Button>
            </div>
          </div>

          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.12em] text-muted-subtle">
              Activity Timeline
            </p>
            <div className="space-y-3">
              {[
                { title: "Lead captured", description: props.lead.message, actor: "lead", time: props.lead.lastTouch },
                { title: "Qualification updated", description: `${props.lead.intent} / ${props.lead.area} / ${props.lead.budget}`, actor: "harwick", time: "live" },
                { title: "Routing checked", description: props.lead.routeReason, actor: "harwick", time: props.lead.assignedTo },
              ].map((event, index) => (
                <div className="flex gap-3" key={`${event.title}-${index}`}>
                  <div className="flex flex-col items-center">
                    <div className={cn("flex h-8 w-8 items-center justify-center rounded-full", event.actor === "harwick" ? "bg-primary" : "bg-surface-muted")}>
                      {event.actor === "harwick" ? (
                        <Bot className="h-4 w-4 text-primary-foreground" />
                      ) : (
                        <Clock className="h-4 w-4 text-muted" />
                      )}
                    </div>
                    {index === 2 ? null : <div className="w-px flex-1 bg-border" />}
                  </div>
                  <div className="flex-1 pb-4">
                    <p className="text-sm font-medium text-foreground">{event.title}</p>
                    <p className="mt-0.5 text-xs text-muted">{event.description}</p>
                    <p className="mt-1 text-xs text-muted-subtle">{event.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {props.actionStatus ? <div className="text-xs text-muted-subtle">{props.actionStatus}</div> : null}
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

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden bg-background">
      <section className="flex min-w-0 flex-1 flex-col bg-surface">
        <div className="flex items-center justify-between border-b border-border/50 px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Leads</h1>
            <p className="text-sm text-muted">{filtered.length} leads</p>
          </div>
          <Button className="h-8 gap-1.5 rounded-[8px]" size="sm" type="button" variant="outline">
            <Plus className="h-3.5 w-3.5" />
            Add Lead
          </Button>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border/50 px-6 py-3">
          <div className="relative min-w-[220px] flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              className="h-9 w-full rounded-[8px] border border-input bg-background pl-9 pr-4 text-sm text-foreground outline-none placeholder:text-muted-subtle focus:border-border-strong"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search leads..."
              type="text"
              value={search}
            />
          </div>

          <div className="flex items-center gap-1">
            {(["all", "buyer", "seller", "unqualified"] as const).map((value) => (
              <Button
                className="h-8 rounded-[8px] text-xs capitalize"
                key={value}
                onClick={() => setQualificationFilter(value)}
                size="sm"
                type="button"
                variant={qualificationFilter === value ? "secondary" : "ghost"}
              >
                {value === "all" ? "All" : value}
              </Button>
            ))}
          </div>

          <div className="hidden items-center gap-1 xl:flex">
            {(["all", "instagram", "facebook", "voice"] as const).map((value) => (
              <FilterChip
                active={sourceFilter === value}
                key={value}
                onClick={() => setSourceFilter(value)}
              >
                {value === "all" ? "All sources" : sourceLabel(value)}
              </FilterChip>
            ))}
          </div>

          <Button
            className="h-8 w-8 rounded-[8px]"
            onClick={() => setSortBy((current) => current === "newest" ? "score" : current === "score" ? "uncontacted" : "newest")}
            size="icon"
            type="button"
            variant="ghost"
          >
            <SortAsc className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center px-6 py-12 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-muted text-muted">
                <MessageSquare aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <div className="mt-4 text-[15px] font-semibold text-foreground">{emptyTitle}</div>
              <div className="mt-2 max-w-[420px] text-[12px] leading-5 text-muted">{emptyBody}</div>
              {actionStatus ? <div className="mt-3 text-[11px] leading-5 text-muted-subtle">{actionStatus}</div> : null}
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
            <div className="divide-y divide-border/50">
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
          <div className="border-t border-border/50 px-6 pb-4">
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
          />
        ) : (
          <div className="flex h-full flex-col border-l border-border/50 bg-surface p-6">
            <div className="mt-10 rounded-[10px] border border-border bg-background p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-surface-muted text-muted">
                <UserPlus className="h-5 w-5" />
              </div>
              <h2 className="mt-4 text-sm font-semibold text-foreground">Select a lead</h2>
              <p className="mt-1 text-sm leading-5 text-muted">
                The v0 detail surface opens here with Harwick reasoning, the live draft, assignment, and timeline.
              </p>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

