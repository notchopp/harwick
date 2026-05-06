"use client";

import {
  automationModeLabel,
  FollowUpBossConflictQueueResponseSchema,
  HarwickHomeWorkItemsResponseSchema,
  OperationsFailureQueueResponseSchema,
  RecentLeadsResponseSchema,
  RoutingDeskResponseSchema,
  TeamPresenceResponseSchema,
  type ConversationAutomationMode,
  type HarwickHomeWorkItem,
  type RecentLeadItem,
  type RoutingDeskItem,
  type TeamPresenceMember,
  type WorkspaceRole,
} from "@realty-ops/core";
import { Bot, CalendarClock, CheckCircle2, ClipboardCheck, GitBranch, Home, ListChecks, MessageSquare, PauseCircle, Phone, UsersRound } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useState } from "react";

import { AppShell } from "../../components/app-shell";
import { LeadActionToolbar } from "../conversations/lead-action-toolbar";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../../components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group";
import { WorkspaceTopbar } from "../../components/workspace-topbar";
import { cn } from "../../lib/utils";

type Source = "instagram" | "facebook";
type Tone = "green" | "red" | "amber" | "stone";
type QueueFilter = "all" | "instagram" | "facebook" | "calls" | "insights" | "verify" | "crm";
type WorkItem = { kind: "reply"; item: Reply } | { kind: "task"; item: Task };

type LoopToolCallDetail = {
  tool: string;
  reason: string;
  requiresApproval: boolean;
};

type LoopDetail = {
  outputMode?: string;
  draftBody?: string;
  agentLoopBrief?: string;
  audienceReason?: string;
  notificationMode?: string;
  notificationReason?: string;
  proposedToolCalls: LoopToolCallDetail[];
};

type Reply = {
  workspaceId?: string;
  reviewId?: string;
  leadId?: string;
  automationMode: ConversationAutomationMode;
  helper: string;
  source: Source;
  lead: string;
  time: string;
  message: string;
  draft: string;
  primaryAction: string;
  secondaryAction: string;
};

type Task = {
  workspaceId?: string;
  handoffId?: string;
  backsyncEventId?: string;
  followUpBossContactId?: string;
  fubEventType?: string;
  operationsFailureResourceId?: string;
  operationsFailureItemType?: "workflow_job" | "crm_sync" | "provider_error";
  operationsFailureRetryable?: boolean;
  workItemId?: string;
  leadId?: string;
  workItemType?: HarwickHomeWorkItem["type"];
  type: "callback" | "listing" | "crm" | "insight";
  label: string;
  title: string;
  detail: string;
  reason?: string;
  time: string;
  action: string;
  tone: Tone;
  icon: typeof Phone;
  loopDetail?: LoopDetail;
};

type CoAgentPresence = TeamPresenceMember;

type OperatorContext = {
  name: string;
  role: WorkspaceRole;
  workspace: string;
  summary: string;
};

type DashboardMetric = { value: string; label: string; delta: string; tone: "green" | "amber" | "red" };

type DashboardHealthRow = { label: string; value: string; tone: "green" | "amber" | "red"; detail?: string | null };

const roleViews: Record<WorkspaceRole, { label: string; scope: string }> = {
  owner: {
    label: "owner",
    scope: "workspace health, billing, team access",
  },
  admin: {
    label: "admin",
    scope: "integrations, listings, routing",
  },
  team_lead: {
    label: "team lead",
    scope: "team routing, approvals, capacity",
  },
  lead_manager: {
    label: "lead manager",
    scope: "queue triage, approvals, callbacks",
  },
  operator: {
    label: "operator",
    scope: "queue triage, callbacks, handoffs",
  },
  agent: {
    label: "agent",
    scope: "assigned leads, calls, follow-ups",
  },
  viewer: {
    label: "viewer",
    scope: "read-only workspace context",
  },
};

function buildOperatorSummary(params: {
  urgentReplies: number;
  callbacks: number;
  recentLeadCount: number;
}): string {
  const parts: string[] = [];
  if (params.urgentReplies > 0) {
    parts.push(`${params.urgentReplies} ${params.urgentReplies === 1 ? "reply" : "replies"} need approval`);
  }
  if (params.callbacks > 0) {
    parts.push(`${params.callbacks} ${params.callbacks === 1 ? "callback" : "callbacks"} pending`);
  }
  if (params.recentLeadCount > 0 && parts.length === 0) {
    parts.push(`${params.recentLeadCount} recent ${params.recentLeadCount === 1 ? "lead" : "leads"} on the desk`);
  }

  if (parts.length === 0) {
    return "";
  }

  return parts.join(", ") + ".";
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function readNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" ? value : null;
}

function readBoolean(record: Record<string, unknown>, key: string): boolean | null {
  const value = record[key];
  return typeof value === "boolean" ? value : null;
}

function mapHarwickLoopPayloadToDetail(payload: Record<string, unknown>): LoopDetail | null {
  const signalType = readString(payload, "signalType");
  const actionPlan = readObject(payload["actionPlan"]);
  const intelligence = readObject(payload["intelligence"]);
  const audience = readObject(intelligence?.["audience"] ?? null);
  const notification = readObject(intelligence?.["notification"] ?? null);
  const outputMode = readString(payload, "outputMode");
  const draftBody = readString(payload, "draftBody");
  const agentLoopBrief = readString(actionPlan ?? {}, "executionBrief") ?? readString(payload, "agentLoopBrief");
  const proposedRaw = Array.isArray(actionPlan?.["proposedToolCalls"])
    ? actionPlan["proposedToolCalls"]
    : Array.isArray(payload["proposedToolCalls"])
      ? payload["proposedToolCalls"]
      : [];
  const proposedToolCalls = proposedRaw.flatMap((item): LoopToolCallDetail[] => {
    const record = readObject(item);
    if (record === null) return [];
    const tool = readString(record, "tool");
    if (tool === null) return [];

    return [{
      tool,
      reason: readString(record, "reason") ?? "proposed Harwick step",
      requiresApproval: readBoolean(record, "requiresApproval") ?? true,
    }];
  });
  const audienceReason = readString(audience ?? {}, "reason");
  const notificationMode = readString(notification ?? {}, "mode");
  const notificationReason = readString(notification ?? {}, "reason");

  if (
    signalType === null
    && outputMode === null
    && draftBody === null
    && agentLoopBrief === null
    && proposedToolCalls.length === 0
    && audienceReason === null
    && notificationReason === null
  ) {
    return null;
  }

  return {
    ...(outputMode === null ? {} : { outputMode }),
    ...(draftBody === null ? {} : { draftBody }),
    ...(agentLoopBrief === null ? {} : { agentLoopBrief }),
    ...(audienceReason === null ? {} : { audienceReason }),
    ...(notificationMode === null ? {} : { notificationMode }),
    ...(notificationReason === null ? {} : { notificationReason }),
    proposedToolCalls,
  };
}

function mapHomePayloadToMetrics(payload: Record<string, unknown>): DashboardMetric[] | null {
  const operations = readObject(payload["operations"]);
  if (operations === null) return null;

  const openTasks = readNumber(operations, "openTasks") ?? 0;
  const urgentTasks = readNumber(operations, "urgentTasks") ?? 0;
  const failedCrmSyncs = readNumber(operations, "failedCrmSyncs") ?? 0;
  const providerErrors24h = readNumber(operations, "providerErrors24h") ?? 0;

  const metrics: DashboardMetric[] = [
    { value: String(openTasks), label: "Open tasks", delta: `${urgentTasks} urgent`, tone: urgentTasks > 0 ? "amber" : "green" },
    { value: String(Math.max(openTasks - urgentTasks, 0)), label: "Ready", delta: "operator queue", tone: "green" },
    { value: String(providerErrors24h), label: "Provider errors", delta: "24h", tone: providerErrors24h > 0 ? "amber" : "green" },
    { value: String(failedCrmSyncs), label: "CRM failed", delta: failedCrmSyncs > 0 ? "needs review" : "All clear", tone: failedCrmSyncs > 0 ? "amber" : "green" },
  ];
  return metrics;
}

function mapHomePayloadToHealth(payload: Record<string, unknown>): DashboardHealthRow[] | null {
  const readiness = readObject(payload["readiness"]);
  const items = Array.isArray(readiness?.["items"]) ? readiness["items"] : null;
  if (items === null) return null;

  return items.flatMap((item) => {
    const row = readObject(item);
    if (row === null) return [];
    const label = readString(row, "label");
    const status = readString(row, "status");
    const detail = readString(row, "detail");
    if (label === null || status === null) return [];
    const tone: "green" | "amber" = status === "ready" ? "green" : "amber";
    return [{
      label,
      value: status === "ready" ? "Live" : status === "degraded" ? "Review" : "Setup",
      tone,
      detail,
    }];
  });
}

function mapHomePayloadToWorkItems(payload: Record<string, unknown>): WorkItem[] | null {
  const socialQueue = readObject(payload["socialQueue"]);
  const voiceQueue = readObject(payload["voiceQueue"]);
  const socialItems = Array.isArray(socialQueue?.["items"]) ? socialQueue["items"] : [];
  const voiceItems = Array.isArray(voiceQueue?.["items"]) ? voiceQueue["items"] : [];
  const harwickWorkItemsParsed = HarwickHomeWorkItemsResponseSchema.safeParse(payload["harwickWorkItems"]);
  const fubConflictsParsed = FollowUpBossConflictQueueResponseSchema.safeParse(payload["fubConflicts"]);
  const operationsFailuresParsed = OperationsFailureQueueResponseSchema.safeParse(payload["operationsFailures"]);

  const mappedSocial: WorkItem[] = socialItems.flatMap((item) => {
    const row = readObject(item);
    if (row === null) return [];
    const inboundText = readString(row, "inboundText") ?? "New social message";
    const channel = readString(row, "channel") ?? "instagram_dm";
    const createdAt = readString(row, "createdAt") ?? "now";
    const suggestedReply = readString(row, "suggestedReply") ?? "Ask one qualifying question before routing.";
    const leadId = readString(row, "leadId");
    const workspaceId = readString(row, "workspaceId");
    const reviewId = readString(row, "id");
    return [{
      kind: "reply" as const,
      item: {
        ...(workspaceId === null ? {} : { workspaceId }),
        ...(reviewId === null ? {} : { reviewId }),
        ...(leadId === null ? {} : { leadId }),
        automationMode: readString(row, "automationMode") === "human_takeover" ? "human_takeover" : readString(row, "automationMode") === "paused_by_rule" ? "paused_by_rule" : "ai_on",
        helper: readString(row, "automationReason") ?? "Harwick is using the latest social event and lead context.",
        source: channel.startsWith("facebook") ? "facebook" : "instagram",
        lead: `Lead ${leadId?.slice(0, 8) ?? "pending"} - ${channel.replace("_", " ")}`,
        time: createdAt,
        message: inboundText,
        draft: suggestedReply,
        primaryAction: "send reply",
        secondaryAction: "take over",
      },
    }];
  });

  const mappedVoice: WorkItem[] = voiceItems.flatMap((item) => {
    const row = readObject(item);
    if (row === null) return [];
    const workspaceId = readString(row, "workspaceId");
    const handoffId = readString(row, "id");
    const leadId = readString(row, "leadId");
    return [{
      kind: "task" as const,
      item: {
        ...(workspaceId === null ? {} : { workspaceId }),
        ...(handoffId === null ? {} : { handoffId }),
        ...(leadId === null ? {} : { leadId }),
        type: "callback" as const,
        label: "Callback Required",
        title: `${readString(row, "callerName") ?? "Voice lead"} - ${readString(row, "urgency") ?? "callback"}`,
        detail: readString(row, "summary") ?? "Voice handoff is waiting for review.",
        time: readString(row, "createdAt") ?? "now",
        action: "Call Back",
        tone: readString(row, "urgency") === "hot" ? "red" : "amber",
        icon: Phone,
      },
    }];
  });

  const mappedHarwick: WorkItem[] = harwickWorkItemsParsed.success
    ? harwickWorkItemsParsed.data.items.map(mapHarwickWorkItemToQueueItem)
    : [];

  const mappedFubConflicts: WorkItem[] = fubConflictsParsed.success
    ? fubConflictsParsed.data.items.map((item): WorkItem => {
      const backsyncEventId = item.id.startsWith("fub_conflict:")
        ? item.id.slice("fub_conflict:".length)
        : item.id;

      return {
        kind: "task",
        item: {
          workspaceId: item.workspaceId,
          leadId: item.leadId,
          backsyncEventId,
          workItemId: item.id,
          followUpBossContactId: item.followUpBossContactId,
          fubEventType: item.eventType,
          type: "crm",
          label: "FUB conflict",
          title: `Follow Up Boss ${item.eventType}`,
          detail: item.detail ?? `Contact ${item.followUpBossContactId} changed in Follow Up Boss while this lead is assigned.`,
          reason: "Replay queues the back-sync reconciler; ignore keeps this CRM event out of the operator queue.",
          time: item.occurredAt,
          action: "Replay sync",
          tone: item.status === "failed" ? "red" : "amber",
          icon: GitBranch,
        },
      };
    })
    : [];

  const mappedOperationsFailures: WorkItem[] = operationsFailuresParsed.success
    ? operationsFailuresParsed.data.items.map((item): WorkItem => {
      const [prefix, ...rest] = item.id.split(":");
      const resourceId = rest.join(":") || item.id;
      const label = item.itemType === "crm_sync"
        ? "CRM retry"
        : item.itemType === "workflow_job"
          ? "Worker failure"
          : "Provider error";
      return {
        kind: "task",
        item: {
          workspaceId: item.workspaceId ?? operationsFailuresParsed.data.workspaceId,
          workItemId: item.id,
          operationsFailureResourceId: resourceId,
          operationsFailureItemType: item.itemType,
          operationsFailureRetryable: item.retryable,
          type: "crm",
          label,
          title: item.title,
          detail: item.detail ?? `${item.provider ?? "Provider"} ${item.operation ?? prefix} needs review.`,
          reason: `Status: ${item.status}${item.provider === null ? "" : ` / Provider: ${item.provider}`}${item.operation === null ? "" : ` / Operation: ${item.operation}`}`,
          time: item.occurredAt,
          action: item.retryable ? "Retry now" : "Review",
          tone: item.retryable ? "red" : "amber",
          icon: GitBranch,
        },
      };
    })
    : [];

  return mappedHarwick.length > 0 || mappedSocial.length > 0 || mappedVoice.length > 0 || mappedFubConflicts.length > 0 || mappedOperationsFailures.length > 0
    ? [...mappedHarwick, ...mappedOperationsFailures, ...mappedFubConflicts, ...mappedSocial, ...mappedVoice]
    : null;
}

function toneFromHarwickPriority(priority: HarwickHomeWorkItem["priority"]): Tone {
  if (priority === "urgent") return "red";
  if (priority === "high") return "amber";
  if (priority === "low") return "stone";
  return "green";
}

function mapHarwickWorkItemToQueueItem(item: HarwickHomeWorkItem): WorkItem {
  const loopDetail = mapHarwickLoopPayloadToDetail(item.payload);
  return {
    kind: "task",
    item: {
      workspaceId: item.workspaceId,
      workItemId: item.id,
      ...(item.leadId === null ? {} : { leadId: item.leadId }),
      workItemType: item.type,
      type: "insight",
      label: item.type === "approval"
        ? "Harwick approval"
        : item.priority === "urgent"
          ? "Urgent Harwick insight"
          : "Harwick insight",
      title: item.title,
      detail: item.summary,
      reason: item.reason,
      time: item.dueAt ?? item.createdAt,
      action: item.recommendedAction,
      tone: toneFromHarwickPriority(item.priority),
      icon: ListChecks,
      ...(loopDetail === null ? {} : { loopDetail }),
    },
  };
}

const primaryPillClass =
  "h-[25px] rounded-full bg-[#2e6b4f] px-[12px] text-[10.75px] font-medium text-white shadow-none hover:bg-[#285e45]";

const darkPillClass =
  "h-[27px] rounded-full bg-[#1a1916] px-[13px] text-[11px] font-medium text-white shadow-none hover:bg-[#2c2a26]";

const outlinePillClass =
  "h-[25px] rounded-full border border-[rgba(26,25,22,0.10)] bg-transparent px-[12px] text-[10.75px] font-medium text-[#6b6860] shadow-none hover:border-[rgba(26,25,22,0.16)] hover:bg-transparent hover:text-[#1a1916]";

function getWorkItemKey(entry: WorkItem): string {
  return entry.kind === "reply" ? `reply:${entry.item.lead}` : `task:${entry.item.workItemId ?? entry.item.title}`;
}

function getWorkItemLeadName(entry: WorkItem): string {
  const title = entry.kind === "reply" ? entry.item.lead : entry.item.title;
  return title.split(" - ")[0]?.trim() ?? title;
}

function getWorkItemChannel(entry: WorkItem): string {
  if (entry.kind === "reply") {
    return entry.item.source === "instagram" ? "Instagram comment" : "Facebook DM";
  }

  if (entry.item.type === "callback") {
    return "Voice call";
  }

  if (entry.item.type === "listing") {
    return "Listing verification";
  }

  if (entry.item.type === "insight") {
    return "Harwick insight";
  }

  return "CRM sync";
}

function SourceBadge(props: { source: Source }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-[3px] text-[10px] font-semibold uppercase tracking-[0.08em]",
        props.source === "instagram"
          ? "bg-[#f5e5f5] text-[#7b2d7b]"
          : "bg-[#e5ebf5] text-[#1a3a6b]",
      )}
    >
      <SourceIcon source={props.source} />
      {props.source}
    </span>
  );
}

function SourceIcon(props: { source: Source }) {
  if (props.source === "facebook") {
    return (
      <svg aria-hidden="true" className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
        <path d="M14.2 8.1V6.7c0-.7.5-.9.9-.9h2.1V2.3L14.3 2c-3.2 0-4.7 1.9-4.7 4.5v1.6H6.8v3.9h2.8v10h4.1v-10h3l.5-3.9h-3Z" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="h-3 w-3" fill="none" viewBox="0 0 24 24">
      <rect height="17" rx="5" stroke="currentColor" strokeWidth="2" width="17" x="3.5" y="3.5" />
      <circle cx="12" cy="12" r="3.6" stroke="currentColor" strokeWidth="2" />
      <circle cx="17.2" cy="6.8" fill="currentColor" r="1.1" />
    </svg>
  );
}

function presenceTone(status: CoAgentPresence["status"]) {
  if (status === "in_call") {
    return "bg-warm";
  }

  if (status === "away") {
    return "bg-muted-subtle";
  }

  return "bg-qualified";
}

function CoAgentAvatar(props: {
  className?: string;
  member: CoAgentPresence;
  statusClassName?: string;
}) {
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-muted font-semibold text-foreground",
        props.className,
      )}
      title={`${props.member.name} - ${props.member.lastSeen}`}
    >
      {props.member.avatarUrl === null ? (
        props.member.initials
      ) : (
        <img
          alt=""
          className="h-full w-full object-cover"
          src={props.member.avatarUrl}
        />
      )}
      <span className={cn("absolute rounded-full border-2 border-surface", presenceTone(props.member.status), props.statusClassName)} />
    </span>
  );
}

function CoAgentRosterSheet(props: {
  members: CoAgentPresence[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <Sheet onOpenChange={props.onOpenChange} open={props.open}>
      <SheetContent className="w-[min(460px,calc(100vw-24px))] gap-0 overflow-y-auto bg-background p-0 sm:max-w-none">
        <SheetHeader className="border-b border-border bg-surface px-6 py-5">
          <div className="flex items-center gap-3 pr-8">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-harwick-ink text-white">
              <UsersRound aria-hidden="true" className="h-5 w-5" />
            </div>
            <div>
              <SheetTitle className="font-display text-[24px] font-medium leading-none">team presence</SheetTitle>
              <SheetDescription className="mt-1.5 text-[12px] text-muted">
                who is online, where capacity is tight, and who has admin visibility.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <div className="space-y-3 p-5">
          {props.members.map((member) => (
            <div className="rounded-[16px] border border-border bg-surface p-4" key={member.name}>
              <div className="flex items-start gap-3">
                <CoAgentAvatar className="h-11 w-11 text-[12px]" member={member} statusClassName="-bottom-0.5 -right-0.5 h-3 w-3" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="truncate text-[13px] font-semibold text-foreground">{member.name}</div>
                    <Badge className="rounded-full px-2 py-0.5 text-[10px]" tone={member.role === "owner" || member.role === "admin" ? "warm" : "neutral"}>
                      {member.role.replace("_", " ")}
                    </Badge>
                  </div>
                  <div className="mt-1 text-[11.5px] text-muted">{member.roleLabel} / {member.lastSeen}</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-[12px] bg-surface-muted px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-muted-subtle">active leads</div>
                  <div className="mt-1 text-[13px] font-semibold text-foreground">{member.activeLeadCount}</div>
                </div>
                <div className="rounded-[12px] bg-surface-muted px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-muted-subtle">open work</div>
                  <div className="mt-1 text-[13px] font-semibold text-foreground">{member.openWork}</div>
                </div>
              </div>
              {member.role === "owner" || member.role === "admin" ? (
                <div className="mt-3 rounded-[12px] border border-harwick-brass/20 bg-brass-soft/50 px-3 py-2 text-[11.5px] leading-5 text-muted">
                  admin view: can see routing conflicts, paused AI threads, and workspace sync health.
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function CoAgentPresenceStrip(props: { members: CoAgentPresence[] }) {
  const [open, setOpen] = useState(false);
  const visibleMembers = props.members.slice(0, 3);
  const overflowCount = Math.max(props.members.length - visibleMembers.length, 0);

  return (
    <>
      <button
        aria-label="open team presence"
        className="flex items-center rounded-full border border-border bg-surface px-2 py-1.5 shadow-[0_10px_24px_rgba(31,42,34,0.05)]"
        onClick={() => setOpen(true)}
        type="button"
      >
        <span className="flex -space-x-2">
          {visibleMembers.map((member) => (
            <CoAgentAvatar
              className="h-8 w-8 border-2 border-surface text-[10px]"
              key={member.id}
              member={member}
              statusClassName="-bottom-0.5 -right-0.5 h-2.5 w-2.5"
            />
          ))}
        </span>
        {overflowCount > 0 ? (
          <span className="ml-2 rounded-full bg-surface-muted px-2 py-1 text-[11px] font-semibold text-muted">
            +{overflowCount}
          </span>
        ) : null}
      </button>
      <CoAgentRosterSheet members={props.members} onOpenChange={setOpen} open={open} />
    </>
  );
}

function OperatorBrief(props: {
  members: CoAgentPresence[];
  operator: OperatorContext;
}) {
  const currentRole = roleViews[props.operator.role];

  return (
    <section className="mb-5 px-0 py-1">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[280px] flex-1">
          <div className="font-display text-[23px] font-medium leading-none text-foreground">
            hey {props.operator.name.toLowerCase()}
          </div>
          {props.operator.summary.length === 0 ? null : (
            <div className="mt-2 max-w-[680px] text-[12.5px] leading-5 text-muted">
              {props.operator.summary}
            </div>
          )}
        </div>
        <CoAgentPresenceStrip members={props.members} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-subtle">
        <span>{props.operator.workspace}</span>
        <span aria-hidden="true">/</span>
        <span>{currentRole.scope}</span>
      </div>
    </section>
  );
}

function openOnEnter(event: KeyboardEvent, onOpen: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onOpen();
  }
}

function ReplyCard(props: { reply: Reply; onOpen: () => void }) {
  return (
    <Card
      className="mb-3 cursor-pointer overflow-hidden transition-all duration-150 hover:-translate-y-px hover:border-border-strong hover:shadow-[0_4px_18px_rgba(31,42,34,0.06)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-harwick-brass"
      onClick={props.onOpen}
      onKeyDown={(event) => openOnEnter(event, props.onOpen)}
      role="button"
      tabIndex={0}
    >
      <CardHeader>
        <SourceBadge source={props.reply.source} />
        <div className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-foreground">
          {props.reply.lead}
        </div>
        <div className="shrink-0 text-[11px] text-muted-subtle">{props.reply.time}</div>
      </CardHeader>
      <CardContent>
        <p className="mb-[11px] text-[12.5px] italic leading-[1.5] text-muted">
          "{props.reply.message}"
        </p>
        <div className="mb-3 rounded-[10px] bg-surface-muted px-[13px] py-[11px] text-[12px] leading-[1.55] text-foreground">
          <div className="mb-[7px] flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-subtle">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sage/25 bg-sage-soft px-2 py-0.5 normal-case tracking-normal text-qualified">
              <Bot aria-hidden="true" className="h-3 w-3" strokeWidth={1.8} />
              {automationModeLabel(props.reply.automationMode)}
            </span>
            next action
          </div>
          {props.reply.draft}
        </div>
        <div className="mb-3 flex items-start gap-2 rounded-[10px] border border-border bg-surface px-3 py-2 text-[11.5px] leading-5 text-muted">
          <ClipboardCheck aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-harwick-brass" strokeWidth={1.8} />
          {props.reply.helper}
        </div>
        <div className="flex gap-2" onClick={(event) => event.stopPropagation()}>
          <Button className={primaryPillClass} variant="ghost">
            {props.reply.primaryAction}
          </Button>
          <Button className={outlinePillClass} variant="ghost">
            {props.reply.secondaryAction}
          </Button>
          <Button className={outlinePillClass} variant="ghost">
            Open convo
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TaskCard(props: { task: Task; onOpen: () => void }) {
  const Icon = props.task.icon;
  const toneClasses = {
    green: {
      icon: "bg-sage-soft text-qualified",
      time: "text-muted-subtle",
    },
    red: {
      icon: "bg-oxblood-soft text-hot",
      time: "text-hot",
    },
    amber: {
      icon: "bg-clay-soft text-warm",
      time: "text-muted-subtle",
    },
    stone: {
      icon: "bg-stone-soft text-syncing",
      time: "text-muted-subtle",
    },
  } satisfies Record<Tone, { icon: string; time: string }>;
  const tone = toneClasses[props.task.tone];

  return (
    <Card
      className="mb-3 flex cursor-pointer gap-3.5 overflow-hidden px-[18px] py-[15px] transition-all duration-150 hover:-translate-y-px hover:border-border-strong hover:shadow-[0_4px_18px_rgba(31,42,34,0.045)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-harwick-brass"
      onClick={props.onOpen}
      onKeyDown={(event) => openOnEnter(event, props.onOpen)}
      role="button"
      tabIndex={0}
    >
      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]", tone.icon)}>
        <Icon aria-hidden="true" className="h-[17px] w-[17px]" strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-[3px] text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-subtle">
          {props.task.label}
        </div>
        <div className="mb-1 truncate text-[13px] font-semibold text-foreground">
          {props.task.title}
        </div>
        <div className="text-[11.5px] text-muted">{props.task.detail}</div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2" onClick={(event) => event.stopPropagation()}>
        <div className={cn("text-[11px] font-medium", tone.time)}>{props.task.time}</div>
        <Button
          className={cn(
            props.task.type === "crm" ? outlinePillClass : darkPillClass,
          )}
          onClick={props.onOpen}
          variant="ghost"
        >
          {props.task.action}
        </Button>
      </div>
    </Card>
  );
}

function matchesQueueFilter(
  entry: { kind: "reply"; item: Reply } | { kind: "task"; item: Task },
  filter: QueueFilter,
): boolean {
  if (filter === "all") {
    return true;
  }

  if (entry.kind === "reply") {
    return entry.item.source === filter;
  }

  if (filter === "calls") {
    return entry.item.type === "callback";
  }

  if (filter === "insights") {
    return entry.item.type === "insight";
  }

  if (filter === "verify") {
    return entry.item.type === "listing";
  }

  if (filter === "crm") {
    return entry.item.type === "crm";
  }

  return false;
}

function QueueSwitch(props: {
  activeFilter: QueueFilter;
  items: WorkItem[];
  onFilterChange: (filter: QueueFilter) => void;
}) {
  const queueFilters: Array<{ value: QueueFilter; label: string; count: number }> = [
    { value: "all", label: "all", count: props.items.length },
    { value: "instagram", label: "instagram", count: props.items.filter((entry) => entry.kind === "reply" && entry.item.source === "instagram").length },
    { value: "facebook", label: "facebook", count: props.items.filter((entry) => entry.kind === "reply" && entry.item.source === "facebook").length },
    { value: "calls", label: "callbacks", count: props.items.filter((entry) => entry.kind === "task" && entry.item.type === "callback").length },
    { value: "insights", label: "insights", count: props.items.filter((entry) => entry.kind === "task" && entry.item.type === "insight").length },
    { value: "verify", label: "verify", count: props.items.filter((entry) => entry.kind === "task" && entry.item.type === "listing").length },
    { value: "crm", label: "crm", count: props.items.filter((entry) => entry.kind === "task" && entry.item.type === "crm").length },
  ];

  return (
    <ToggleGroup
      aria-label="filter work queue"
      className="flex max-w-full flex-wrap gap-1 rounded-full border border-border bg-surface/55 p-1 shadow-[0_8px_24px_rgba(31,42,34,0.045)]"
      onValueChange={(value) => {
        if (value !== "") {
          props.onFilterChange(value as QueueFilter);
        }
      }}
      spacing={1}
      type="single"
      value={props.activeFilter}
      variant="default"
    >
      {queueFilters.map((filter) => (
        <ToggleGroupItem
          aria-label={`show ${filter.label} work`}
          className="harwick-toggle-item h-[28px] !rounded-full border border-transparent px-3 text-[11px] font-semibold text-muted-subtle shadow-none transition hover:bg-surface-muted hover:text-foreground"
          key={filter.value}
          value={filter.value}
        >
          <span>{filter.label}</span>
          <span className="ml-1.5 rounded-full bg-black/[0.055] px-1.5 py-px text-[9.5px] text-inherit">
            {filter.count}
          </span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function DetailSection(props: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-[14px] border border-border bg-surface px-4 py-4", props.className)}>
      <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-subtle">
        {props.title}
      </div>
      {props.children}
    </section>
  );
}

function KvRow(props: { label: string; value: string; tone?: "green" | "amber" | "red" }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-2 last:border-b-0">
      <span className="text-[11.5px] text-muted-subtle">{props.label}</span>
      <span
        className={cn(
          "max-w-[190px] text-right text-[12px] font-semibold text-foreground",
          props.tone === "green" && "text-qualified",
          props.tone === "amber" && "text-warm",
          props.tone === "red" && "text-hot",
        )}
      >
        {props.value}
      </span>
    </div>
  );
}

function MessageBubble(props: { label: string; text: string; align?: "left" | "right"; tone?: "draft" }) {
  const alignRight = props.align === "right";

  return (
    <div className={cn("flex flex-col gap-1", alignRight && "items-end")}>
      <div className="text-[10.5px] font-medium text-muted-subtle">{props.label}</div>
      <div
        className={cn(
          "max-w-[86%] rounded-[13px] px-3.5 py-2.5 text-[12.5px] leading-5",
          alignRight
            ? "bg-harwick-ink text-white"
            : "border border-border bg-surface-muted text-foreground",
          props.tone === "draft" && "border border-dashed border-harwick-brass bg-brass-soft text-foreground",
        )}
      >
        {props.text}
      </div>
    </div>
  );
}

function ActivityTimeline(props: { entry: WorkItem }) {
  const leadName = getWorkItemLeadName(props.entry);
  const items = props.entry.kind === "reply"
    ? [
      { title: "AI draft ready for approval", meta: `${props.entry.item.time} - queue review`, tone: "amber" as const },
      { title: "Lead context hydrated", meta: `${getWorkItemChannel(props.entry)} - listing/post matched`, tone: "green" as const },
      { title: `${leadName} entered the queue`, meta: "source event captured", tone: "stone" as const },
    ]
    : [
      { title: `${props.entry.item.label.toLowerCase()} task created`, meta: `${props.entry.item.time} - operator queue`, tone: props.entry.item.tone },
      { title: "Qualification summary attached", meta: "Harwick extracted intent, area, budget, and next action", tone: "green" as const },
      { title: `${leadName} matched to workspace`, meta: `${getWorkItemChannel(props.entry)} source`, tone: "stone" as const },
    ];

  return (
    <DetailSection title="activity timeline">
      <div className="space-y-0">
        {items.map((item, index) => (
          <div className="flex gap-3" key={item.title}>
            <div className="flex w-3 flex-col items-center">
              <span
                className={cn(
                  "mt-1.5 h-2.5 w-2.5 rounded-full",
                  item.tone === "green" && "bg-qualified",
                  item.tone === "amber" && "bg-warm",
                  item.tone === "red" && "bg-hot",
                  item.tone === "stone" && "bg-muted-subtle",
                )}
              />
              {index === items.length - 1 ? null : <span className="mt-1 h-11 w-px bg-border" />}
            </div>
            <div className="pb-4">
              <div className="text-[12.5px] font-semibold text-foreground">{item.title}</div>
              <div className="mt-0.5 text-[11px] text-muted-subtle">{item.meta}</div>
            </div>
          </div>
        ))}
      </div>
    </DetailSection>
  );
}

function ReplyDetail(props: {
  actionStatus: string | null;
  reply: Reply;
  workspaceId: string;
  currentMemberId: string;
  onChanged?: () => void | Promise<void>;
}) {
  const leadName = getWorkItemLeadName({ kind: "reply", item: props.reply });
  const canActOnReal = props.reply.workspaceId !== undefined && props.reply.leadId !== undefined;

  return (
    <div className="space-y-4">
      <DetailSection title="conversation">
        <div className="space-y-3">
          <MessageBubble label={`${leadName} - ${props.reply.time}`} text={props.reply.message} />
          <MessageBubble
            align="right"
            label={`Harwick next action - ${automationModeLabel(props.reply.automationMode)}`}
            text={props.reply.draft}
            tone="draft"
          />
        </div>
        <div className="mt-4 rounded-[13px] border border-border bg-surface-muted px-4 py-3">
          <div className="flex items-center gap-2 text-[11.5px] font-semibold text-foreground">
            {props.reply.automationMode === "ai_on" ? (
              <Bot aria-hidden="true" className="h-4 w-4 text-qualified" strokeWidth={1.8} />
            ) : (
              <PauseCircle aria-hidden="true" className="h-4 w-4 text-warm" strokeWidth={1.8} />
            )}
            helper while {props.reply.automationMode === "ai_on" ? "ai works" : "ai is paused"}
          </div>
          <div className="mt-1.5 text-[12px] leading-5 text-muted">{props.reply.helper}</div>
        </div>
        {props.actionStatus === null ? null : (
          <div className="mt-3 rounded-[11px] border border-border bg-surface px-3 py-2 text-[11.5px] text-muted">
            {props.actionStatus}
          </div>
        )}
        {canActOnReal ? (
          <div className="mt-4">
            <LeadActionToolbar
              workspaceId={props.reply.workspaceId!}
              leadId={props.reply.leadId!}
              automationMode={props.reply.automationMode}
              assignedMemberId={null}
              currentMemberId={props.currentMemberId}
              draft={props.reply.draft}
              reviewId={props.reply.reviewId ?? null}
              {...(props.onChanged === undefined ? {} : { onChanged: props.onChanged })}
            />
          </div>
        ) : (
          <div className="mt-4 rounded-[11px] border border-dashed border-border bg-surface px-3 py-3 text-[11.5px] text-muted">
            this work item is missing its lead reference, so the toolbar cannot reach the backend.
          </div>
        )}
      </DetailSection>
      <ActivityTimeline entry={{ kind: "reply", item: props.reply }} />
    </div>
  );
}

function TaskDetail(props: {
  actionStatus: string | null;
  onTaskAction: (action: "callback" | "reviewed" | "dismiss", task: Task) => void;
  task: Task;
}) {
  const leadName = getWorkItemLeadName({ kind: "task", item: props.task });

  return (
    <div className="space-y-4">
      <DetailSection title="task brief">
        <div className="rounded-[12px] bg-surface-muted px-4 py-3">
          <div className="text-[13px] font-semibold text-foreground">{props.task.title}</div>
          <div className="mt-1.5 text-[12px] leading-5 text-muted">{props.task.detail}</div>
          {props.task.reason === undefined ? null : (
            <div className="mt-3 rounded-[10px] border border-border bg-surface px-3 py-2 text-[11.5px] leading-5 text-muted">
              {props.task.reason}
            </div>
          )}
        </div>
        {props.task.loopDetail === undefined ? null : (
          <div className="mt-3 space-y-2">
            {props.task.loopDetail.draftBody === undefined ? null : (
              <div className="rounded-[11px] border border-border bg-surface px-3 py-3">
                <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-muted-subtle">draft output</div>
                <div className="whitespace-pre-wrap text-[12px] leading-5 text-foreground">{props.task.loopDetail.draftBody}</div>
              </div>
            )}
            {props.task.loopDetail.agentLoopBrief === undefined ? null : (
              <div className="rounded-[11px] border border-border bg-surface px-3 py-3">
                <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-muted-subtle">execution brief</div>
                <div className="text-[12px] leading-5 text-foreground">{props.task.loopDetail.agentLoopBrief}</div>
              </div>
            )}
            {props.task.loopDetail.audienceReason === undefined ? null : (
              <div className="rounded-[11px] border border-border bg-surface px-3 py-3">
                <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-muted-subtle">owner logic</div>
                <div className="text-[12px] leading-5 text-foreground">{props.task.loopDetail.audienceReason}</div>
              </div>
            )}
            {props.task.loopDetail.notificationReason === undefined ? null : (
              <div className="rounded-[11px] border border-border bg-surface px-3 py-3">
                <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-muted-subtle">notification</div>
                <div className="text-[12px] leading-5 text-foreground">
                  {props.task.loopDetail.notificationReason}
                  {props.task.loopDetail.notificationMode === undefined ? null : ` (${props.task.loopDetail.notificationMode.replace(/_/g, " ")})`}
                </div>
              </div>
            )}
            {props.task.loopDetail.proposedToolCalls.length === 0 ? null : (
              <div className="rounded-[11px] border border-border bg-surface px-3 py-3">
                <div className="mb-2 text-[10px] uppercase tracking-[0.12em] text-muted-subtle">proposed tools</div>
                <div className="space-y-2">
                  {props.task.loopDetail.proposedToolCalls.map((toolCall, index) => (
                    <div className="flex items-start justify-between gap-3 text-[12px]" key={`${toolCall.tool}-${index}`}>
                      <div>
                        <div className="font-medium text-foreground">{toolCall.tool}</div>
                        <div className="mt-0.5 text-[11.5px] leading-5 text-muted">{toolCall.reason}</div>
                      </div>
                      <span className="shrink-0 rounded-full border border-border bg-surface-muted px-2 py-[2px] text-[10px] text-muted">
                        {toolCall.requiresApproval ? "approval" : "internal"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-[11px] border border-border px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.12em] text-muted-subtle">lead</div>
            <div className="mt-1 text-[12px] font-semibold">{leadName}</div>
          </div>
          <div className="rounded-[11px] border border-border px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.12em] text-muted-subtle">source</div>
            <div className="mt-1 text-[12px] font-semibold">{getWorkItemChannel({ kind: "task", item: props.task })}</div>
          </div>
          <div className="rounded-[11px] border border-border px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.12em] text-muted-subtle">sla</div>
            <div className={cn("mt-1 text-[12px] font-semibold", props.task.tone === "red" && "text-hot")}>
              {props.task.time}
            </div>
          </div>
        </div>
        {props.actionStatus === null ? null : (
          <div className="mt-3 rounded-[11px] border border-border bg-surface px-3 py-2 text-[11.5px] text-muted">
            {props.actionStatus}
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            className={cn(
              props.task.type === "crm" || props.task.type === "insight" ? outlinePillClass : darkPillClass,
              "flex-1 min-w-[100px]"
            )}
            onClick={() => props.onTaskAction(props.task.type === "callback" ? "callback" : "reviewed", props.task)}
            variant="ghost"
          >
            {props.task.action}
          </Button>
          <Button
            className={cn(outlinePillClass, "flex-1 min-w-[80px]")}
            disabled={(props.task.type === "insight" || props.task.type === "crm") && props.task.leadId === undefined}
            onClick={() => {
              if ((props.task.type === "insight" || props.task.type === "crm") && props.task.leadId !== undefined) {
                window.location.href = `/leads?leadId=${props.task.leadId}`;
              }
            }}
            variant="ghost"
          >
            {props.task.type === "insight" || props.task.type === "crm" ? props.task.leadId === undefined ? "Workspace" : "Open lead" : "Assign"}
          </Button>
          <Button 
            className={cn(outlinePillClass, "flex-1 min-w-[80px]")} 
            onClick={() => props.onTaskAction("dismiss", props.task)} 
            variant="ghost"
          >
            {props.task.type === "crm"
              ? props.task.backsyncEventId === undefined
                ? props.task.operationsFailureItemType === "workflow_job" ? "Dismiss" : "Review"
                : "Ignore"
              : "Dismiss"}
          </Button>
        </div>
      </DetailSection>
      <ActivityTimeline entry={{ kind: "task", item: props.task }} />
    </div>
  );
}

function DetailSideRail(props: { entry: WorkItem }) {
  const leadName = getWorkItemLeadName(props.entry);
  const status = props.entry.kind === "reply" ? "reply approval" : props.entry.item.label.toLowerCase();
  const nextAction = props.entry.kind === "reply"
    ? "Approve the draft or edit it before Harwick replies in-channel."
    : props.entry.item.type === "callback"
      ? "Call this lead back and attach the outcome to the timeline."
      : props.entry.item.type === "listing"
        ? "Verify listing status before the AI references it again."
        : props.entry.item.type === "insight"
          ? props.entry.item.action
          : "Resolve assignment mismatch before the next FUB sync.";
  const leadId = props.entry.kind === "reply" ? props.entry.item.leadId : props.entry.item.leadId;
  const initials = leadName.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "LD";

  return (
    <div className="space-y-3">
      <DetailSection title="lead context">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-muted font-semibold text-muted">
            {initials}
          </div>
          <div>
            <div className="text-[14px] font-semibold text-foreground">{leadName}</div>
            <div className="text-[11px] text-muted-subtle">{getWorkItemChannel(props.entry)}</div>
          </div>
        </div>
        <KvRow label="status" value={status} />
        {leadId === undefined ? null : (
          <div className="mt-2 text-[11px]">
            <a className="text-qualified underline-offset-2 hover:underline" href={`/leads?leadId=${leadId}`}>
              open full lead context
            </a>
          </div>
        )}
      </DetailSection>

      <DetailSection title="next action">
        <div className="flex items-start gap-2 text-[12px] leading-5 text-muted">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-qualified" aria-hidden="true" />
          <span>{nextAction}</span>
        </div>
      </DetailSection>
    </div>
  );
}

function WorkItemDetailSheet(props: {
  actionStatus: string | null;
  entry: WorkItem | null;
  onOpenChange: (open: boolean) => void;
  onTaskAction: (action: "callback" | "reviewed" | "dismiss", task: Task) => void;
  workspaceId: string;
  workspaceName: string;
  currentMemberId: string;
  onChanged?: () => void | Promise<void>;
}) {
  const entry = props.entry;
  const leadName = entry === null ? "" : getWorkItemLeadName(entry);
  const channel = entry === null ? "" : getWorkItemChannel(entry);

  return (
    <Sheet onOpenChange={props.onOpenChange} open={entry !== null}>
      <SheetContent className="w-[min(1120px,calc(100vw-24px))] gap-0 overflow-y-auto bg-background p-0 sm:max-w-none">
        {entry === null ? null : (
          <>
            <SheetHeader className="border-b border-border bg-surface px-6 py-5">
              <div className="flex flex-wrap items-start gap-3 pr-8">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-harwick-ink text-white">
                  {entry.kind === "reply" ? (
                    <MessageSquare aria-hidden="true" className="h-5 w-5" />
                  ) : entry.item.type === "callback" ? (
                    <Phone aria-hidden="true" className="h-5 w-5" />
                  ) : entry.item.type === "listing" ? (
                    <Home aria-hidden="true" className="h-5 w-5" />
                  ) : (
                    <ListChecks aria-hidden="true" className="h-5 w-5" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <SheetTitle className="font-display text-[24px] font-medium leading-none text-foreground">
                    {leadName}
                  </SheetTitle>
                  <SheetDescription className="mt-1.5 text-[12px] text-muted">
                    {channel} / {entry.kind === "reply" ? entry.item.time : entry.item.time}
                  </SheetDescription>
                </div>
                <Badge className="rounded-full border-0 bg-sage-soft px-2.5 py-1 text-[10.5px] text-qualified" tone="neutral">
                  {entry.kind === "reply" ? "reply ready" : entry.item.label.toLowerCase()}
                </Badge>
              </div>
            </SheetHeader>

            <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_330px]">
              <div>
                <div className="mb-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[13px] border border-border bg-surface px-3 py-3">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-muted-subtle">
                      <CalendarClock aria-hidden="true" className="h-3.5 w-3.5" />
                      sla
                    </div>
                    <div className="mt-1.5 text-[13px] font-semibold text-foreground">
                      {entry.kind === "reply" ? entry.item.time : entry.item.time}
                    </div>
                  </div>
                  <div className="rounded-[13px] border border-border bg-surface px-3 py-3">
                    <div className="text-[10px] uppercase tracking-[0.12em] text-muted-subtle">workspace</div>
                    <div className="mt-1.5 text-[13px] font-semibold text-foreground">{props.workspaceName}</div>
                  </div>
                  <div className="rounded-[13px] border border-border bg-surface px-3 py-3">
                    <div className="text-[10px] uppercase tracking-[0.12em] text-muted-subtle">system state</div>
                    <div className="mt-1.5 text-[13px] font-semibold text-qualified">ready</div>
                  </div>
                </div>

                {entry.kind === "reply" ? (
                  <ReplyDetail
                    actionStatus={props.actionStatus}
                    reply={entry.item}
                    workspaceId={props.workspaceId}
                    currentMemberId={props.currentMemberId}
                    {...(props.onChanged === undefined ? {} : { onChanged: props.onChanged })}
                  />
                ) : (
                  <TaskDetail actionStatus={props.actionStatus} onTaskAction={props.onTaskAction} task={entry.item} />
                )}
              </div>
              <DetailSideRail entry={entry} />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Dot(props: { tone?: "green" | "amber" | "red" }) {
  return (
    <span
      className={cn(
        "h-1.5 w-1.5 shrink-0 rounded-full",
        (props.tone ?? "green") === "green" && "bg-qualified",
        props.tone === "amber" && "bg-warm",
        props.tone === "red" && "bg-hot",
      )}
    />
  );
}

function StatusPillsDisplay(props: { pills: StatusPill[] }) {
  return (
    <div className="ml-auto flex items-center gap-[10px]">
      {props.pills.map((pill) => (
        <div
          className={cn(
            "flex items-center gap-[5px] rounded-full border px-[9px] py-1 text-[11px]",
            pill.status === "ready"
              ? "border-border bg-surface-muted text-muted"
              : "border-warm/30 bg-warm-soft text-warm",
          )}
          key={pill.key}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              pill.status === "ready" ? "bg-qualified" : "bg-warm",
            )}
          />
          {pill.label}
        </div>
      ))}
    </div>
  );
}

function RoutingDecisionPanel(props: { items: RoutingDeskItem[] }) {
  const [activeDecisionIndex, setActiveDecisionIndex] = useState(0);
  const statusCopy = {
    assigned: "assigned",
    unrouted: "owner review",
    hold_for_qualification: "qualify first",
  } as const;

  if (props.items.length === 0) {
    return (
      <Card className="mb-4 p-5">
        <div className="mb-[15px] flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-sage-soft text-qualified">
            <GitBranch aria-hidden="true" className="h-[17px] w-[17px]" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="font-display text-[15px]">Routing Desk</CardTitle>
            <div className="mt-1 text-[11.5px] leading-5 text-muted">
              Area, specialty, price, capacity, then round-robin only when tied.
            </div>
          </div>
        </div>
        <div className="rounded-[12px] border border-dashed border-border bg-surface/45 px-3 py-6 text-center text-[12px] text-muted">
          No leads in routing yet. Routing decisions appear here once leads have qualification data and the workspace has agent routing profiles.
        </div>
      </Card>
    );
  }

  const normalizedIndex = Math.min(activeDecisionIndex, props.items.length - 1);
  const activeDecision = props.items[normalizedIndex] ?? props.items[0];
  if (activeDecision === undefined) {
    return null;
  }
  const stackedDecisions = props.items.filter((_, index) => index !== normalizedIndex);

  const isAssigned = activeDecision.decision.status === "assigned";
  const isUnrouted = activeDecision.decision.status === "unrouted";
  const statusClass = isAssigned
    ? "bg-sage-soft text-qualified"
    : isUnrouted
      ? "bg-oxblood-soft text-hot"
      : "bg-brass-soft text-warm";

  return (
    <Card className="mb-4 p-5">
      <div className="mb-[15px] flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-sage-soft text-qualified">
          <GitBranch aria-hidden="true" className="h-[17px] w-[17px]" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <CardTitle className="font-display text-[15px]">Routing Desk</CardTitle>
          <div className="mt-1 text-[11.5px] leading-5 text-muted">
            Area, specialty, price, capacity, then round-robin only when tied.
          </div>
        </div>
      </div>

      <div className="relative pb-12">
        <div className="relative z-20 rounded-[12px] border border-border bg-surface px-3 py-3 shadow-[0_16px_34px_rgba(31,42,34,0.08)]">
          <div className="mb-2 flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-semibold text-foreground">
                {activeDecision.leadName}
              </div>
              <div className="mt-0.5 text-[11px] leading-4 text-muted">
                {activeDecision.summary}
              </div>
            </div>
            <Badge className={cn("rounded-full border-0 px-2 py-[3px] text-[10px]", statusClass)} tone="neutral">
              {statusCopy[activeDecision.decision.status]}
            </Badge>
          </div>

          <div className="grid gap-1.5 text-[11px] text-muted">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-subtle">route</span>
              <span className="truncate text-right font-semibold text-foreground">
                {activeDecision.decision.assignedDisplayName ?? "owner review"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-subtle">source credit</span>
              <span className="truncate text-right font-medium text-foreground">{activeDecision.sourceOwnerLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-subtle">source</span>
              <span className="truncate text-right font-medium text-foreground">{activeDecision.source}</span>
            </div>
          </div>

          <div className="mt-2 rounded-[9px] bg-surface-muted px-2.5 py-2 text-[10.75px] leading-4 text-muted">
            {activeDecision.decision.reasons.slice(0, 2).join(" / ")}
          </div>
        </div>

        {stackedDecisions.slice(0, 2).map((entry, stackIndex) => {
          const originalIndex = props.items.findIndex((candidate) => candidate.leadId === entry.leadId);
          return (
            <button
              aria-label={`show routing card for ${entry.leadName}`}
              className={cn(
                "absolute left-2 right-2 z-10 flex items-center justify-between gap-3 rounded-[12px] border border-border bg-surface px-3 py-3 text-left shadow-[0_10px_26px_rgba(31,42,34,0.05)] transition hover:-translate-y-0.5 hover:border-border-strong",
                stackIndex === 0 ? "bottom-5 opacity-90" : "bottom-0 opacity-75",
              )}
              key={entry.leadId}
              onClick={() => setActiveDecisionIndex(originalIndex)}
              type="button"
            >
              <span className="min-w-0">
                <span className="block truncate text-[11.5px] font-semibold text-foreground">{entry.leadName}</span>
                <span className="block truncate text-[10.5px] text-muted-subtle">
                  {entry.decision.assignedDisplayName ?? statusCopy[entry.decision.status]}
                </span>
              </span>
              <span className="rounded-full bg-surface-muted px-2 py-1 text-[10px] font-semibold text-muted">
                {stackIndex + 2}/{props.items.length}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function MetricPanel(props: { metrics: DashboardMetric[] }) {
  return (
    <Card className="mb-4 p-5">
      <CardTitle className="mb-[15px] font-display text-[15px]">Today</CardTitle>
      <div className="grid grid-cols-2 gap-2.5">
        {props.metrics.map((metric) => (
          <div className="rounded-[10px] bg-surface-muted p-[13px]" key={metric.label}>
            <div className="font-display text-[28px] font-medium leading-none text-foreground">
              {metric.value}
            </div>
            <div className="mt-[3px] text-[11px] text-muted-subtle">{metric.label}</div>
            <div
              className={cn(
                "mt-0.5 text-[11px]",
                metric.tone === "amber" ? "text-warm" : "text-qualified",
              )}
            >
              {metric.delta}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function HealthPanel(props: { health: DashboardHealthRow[] }) {
  return (
    <Card className="mb-4 p-5">
      <CardTitle className="mb-[15px] font-display text-[15px]">System Health</CardTitle>
      <div>
        {props.health.map((row) => (
          <div className="flex items-center gap-[9px] border-b border-border py-2 last:border-b-0 last:pb-0" key={row.label}>
            <Dot tone={row.tone === "amber" ? "amber" : "green"} />
            <div className="flex-1 text-[12px] text-muted">{row.label}</div>
            <div
              className={cn(
                "text-[11px] font-semibold",
                row.tone === "amber" ? "text-warm" : "text-qualified",
              )}
            >
              {row.value}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function LeadStage(props: { lead: RecentLeadItem }) {
  const className =
    props.lead.stage === "qualified"
      ? "bg-sage-soft text-qualified"
      : props.lead.stage === "nurture"
        ? "bg-surface-muted text-muted-subtle"
        : props.lead.stage === "lost"
          ? "bg-oxblood-soft text-hot"
          : "bg-brass-soft text-warm";

  return (
    <Badge className={cn("shrink-0 rounded-full border-0 px-2 py-[3px] text-[10px]", className)} tone="neutral">
      {props.lead.stageLabel}
    </Badge>
  );
}

function RecentLeadsPanel(props: { leads: RecentLeadItem[] }) {
  return (
    <Card className="p-5">
      <CardTitle className="mb-[15px] font-display text-[15px]">Recent Leads</CardTitle>
      {props.leads.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-border bg-surface/45 px-3 py-5 text-center text-[11.5px] text-muted">
          New leads will appear here once the workspace starts receiving messages or calls.
        </div>
      ) : (
        <div>
          {props.leads.map((lead) => (
            <a
              className="flex items-center gap-[11px] border-b border-border py-[9px] last:border-b-0 last:pb-0 hover:bg-surface-muted/45"
              href={`/leads?leadId=${lead.id}`}
              key={lead.id}
            >
              <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-surface-muted text-[11px] font-semibold text-muted">
                {lead.initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-semibold text-foreground">{lead.name}</div>
                <div className="truncate text-[11px] text-muted-subtle">
                  {lead.sourceLabel} {lead.channelLabel} - {lead.lastTouchLabel}
                </div>
              </div>
              <LeadStage lead={lead} />
            </a>
          ))}
        </div>
      )}
    </Card>
  );
}

export type HomePageProps = {
  workspaceId: string;
  workspaceName: string;
  operatorName: string;
  operatorRole: WorkspaceRole;
  operatorMemberId: string;
};

type StatusPill = {
  key: string;
  label: string;
  status: "ready" | "degraded" | "needs_setup";
};

export function HomePage(props: HomePageProps) {
  const [activeFilter, setActiveFilter] = useState<QueueFilter>("all");
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetric[]>([]);
  const [dashboardHealth, setDashboardHealth] = useState<DashboardHealthRow[]>([]);
  const [dashboardWorkItems, setDashboardWorkItems] = useState<WorkItem[]>([]);
  const [recentLeads, setRecentLeads] = useState<RecentLeadItem[]>([]);
  const [routingDeskItems, setRoutingDeskItems] = useState<RoutingDeskItem[]>([]);
  const [selectedWorkItem, setSelectedWorkItem] = useState<WorkItem | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [presenceMembers, setPresenceMembers] = useState<CoAgentPresence[]>([]);
  const [statusPills, setStatusPills] = useState<StatusPill[]>([]);
  const filteredWorkItems = useMemo(
    () => dashboardWorkItems.filter((entry) => matchesQueueFilter(entry, activeFilter)),
    [activeFilter, dashboardWorkItems],
  );
  const operator: OperatorContext = useMemo(
    () => ({
      name: props.operatorName,
      role: props.operatorRole,
      workspace: props.workspaceName,
      summary: buildOperatorSummary({
        urgentReplies: dashboardWorkItems.filter((entry) => entry.kind === "reply").length,
        callbacks: dashboardWorkItems.filter((entry) => entry.kind === "task" && entry.item.type === "callback").length,
        recentLeadCount: recentLeads.length,
      }),
    }),
    [dashboardWorkItems, props.operatorName, props.operatorRole, props.workspaceName, recentLeads.length],
  );

  async function refreshHomeData() {
    const response = await fetch(`/api/home?workspaceId=${props.workspaceId}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      return;
    }

    const body: unknown = await response.json();
    const payload = readObject(body);
    if (payload === null) {
      return;
    }

    const nextMetrics = mapHomePayloadToMetrics(payload);
    const nextHealth = mapHomePayloadToHealth(payload);
    const nextWorkItems = mapHomePayloadToWorkItems(payload);
    setDashboardMetrics(nextMetrics ?? []);
    setDashboardHealth(nextHealth ?? []);
    setDashboardWorkItems(nextWorkItems ?? []);

    const presenceParsed = TeamPresenceResponseSchema.safeParse(payload["teamPresence"]);
    setPresenceMembers(presenceParsed.success ? presenceParsed.data.members : []);

    const recentLeadsParsed = RecentLeadsResponseSchema.safeParse(payload["recentLeads"]);
    setRecentLeads(recentLeadsParsed.success ? recentLeadsParsed.data.items : []);

    const routingDeskParsed = RoutingDeskResponseSchema.safeParse(payload["routingDesk"]);
    setRoutingDeskItems(routingDeskParsed.success ? routingDeskParsed.data.items : []);

    // Parse readiness items into status pills
    const readiness = readObject(payload["readiness"]);
    const readinessItems = Array.isArray(readiness?.["items"]) ? readiness["items"] : [];
    const pills = readinessItems.flatMap((item) => {
      const row = readObject(item);
      if (row === null) return [];
      const key = readString(row, "key");
      const label = readString(row, "label");
      const status = readString(row, "status");
      if (key === null || label === null || status === null) return [];
      const pillStatus: StatusPill["status"] = status === "ready" ? "ready" : status === "degraded" ? "degraded" : "needs_setup";
      return [{
        key,
        label,
        status: pillStatus,
      }];
    });
    setStatusPills(pills);
  }

  async function handleTaskAction(action: "callback" | "reviewed" | "dismiss", task: Task) {
    if (task.type === "insight") {
      if (task.workspaceId === undefined || task.workItemId === undefined) {
        setActionStatus("this Harwick insight is missing its backend work item row.");
        return;
      }

      try {
        setActionStatus("working...");
        const response = await fetch(`/api/workspaces/${task.workspaceId}/harwick-work-items/${task.workItemId}/action`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(action === "dismiss"
            ? { action: "dismiss", feedbackLabel: "not_relevant" }
            : task.workItemType === "approval"
              ? { action: "approve", feedbackLabel: "useful" }
              : { action: "mark_seen", feedbackLabel: "useful" }),
        });

        if (response.status === 403) {
          setActionStatus("auth is required to update this Harwick insight.");
          return;
        }

        if (!response.ok) {
          setActionStatus("the backend rejected this Harwick insight action.");
          return;
        }

        setActionStatus(action === "dismiss"
          ? "Harwick insight dismissed."
          : task.workItemType === "approval"
            ? "Harwick loop approved and queued."
            : "Harwick insight marked seen.");
        await refreshHomeData();
      } catch {
        setActionStatus("could not reach the Harwick insight endpoint.");
      }
      return;
    }

    if (task.type === "crm") {
      if (task.operationsFailureItemType !== undefined) {
        if (task.workspaceId === undefined || task.operationsFailureResourceId === undefined) {
          setActionStatus("this operations item is missing its backend failure row.");
          return;
        }

        if (task.operationsFailureItemType === "provider_error" || task.operationsFailureRetryable === false) {
          setActionStatus("provider errors are surfaced here for visibility; resolve the provider config or retry the linked job when one exists.");
          return;
        }

        if (action === "dismiss" && task.operationsFailureItemType !== "workflow_job") {
          setActionStatus("CRM sync failures cannot be ignored from home. Retry the sync or resolve it from the operations queue.");
          return;
        }

        const endpoint = task.operationsFailureItemType === "workflow_job"
          ? `/api/workspaces/${task.workspaceId}/operations/workflow-jobs/${task.operationsFailureResourceId}/action`
          : `/api/workspaces/${task.workspaceId}/operations/crm-syncs/${task.operationsFailureResourceId}/action`;

        try {
          setActionStatus("working...");
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(action === "dismiss" ? { action: "dismiss" } : { action: "retry_now" }),
          });

          if (response.status === 403) {
            setActionStatus("auth is required to update this operations failure.");
            return;
          }

          if (!response.ok) {
            setActionStatus("the backend rejected this operations action.");
            return;
          }

          setActionStatus(action === "dismiss" ? "workflow job dismissed." : "retry queued.");
          await refreshHomeData();
        } catch {
          setActionStatus("could not reach the operations failure endpoint.");
        }
        return;
      }

      if (task.workspaceId === undefined || task.backsyncEventId === undefined) {
        setActionStatus("this FUB conflict is missing its backend event row.");
        return;
      }

      try {
        setActionStatus("working...");
        const response = await fetch(`/api/workspaces/${task.workspaceId}/operations/fub-conflicts/${task.backsyncEventId}/action`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(action === "dismiss"
            ? { action: "ignore", reason: "operator ignored from the home work queue" }
            : { action: "replay" }),
        });

        if (response.status === 403) {
          setActionStatus("auth is required to resolve this Follow Up Boss conflict.");
          return;
        }

        if (!response.ok) {
          setActionStatus("the backend rejected this Follow Up Boss conflict action.");
          return;
        }

        setActionStatus(action === "dismiss"
          ? "Follow Up Boss conflict ignored."
          : "Follow Up Boss replay queued.");
        await refreshHomeData();
      } catch {
        setActionStatus("could not reach the Follow Up Boss conflict endpoint.");
      }
      return;
    }

    if (task.workspaceId === undefined || task.handoffId === undefined || task.type !== "callback") {
      setActionStatus("this task is not connected to a backend handoff row yet.");
      return;
    }

    try {
      setActionStatus("working...");
      const response = await fetch(`/api/workspaces/${task.workspaceId}/voice-queue/${task.handoffId}/action`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          action === "callback"
            ? { action: "create_callback_task", title: task.title, description: task.detail, priority: "urgent" }
            : action === "dismiss"
              ? { action: "dismiss", reason: "operator dismissed from the work queue" }
              : { action: "mark_reviewed" },
        ),
      });

      if (response.status === 403) {
        setActionStatus("auth is required to commit this action. the endpoint is real and protected.");
        return;
      }

      if (!response.ok) {
        setActionStatus("the backend rejected this task action. check handoff state.");
        return;
      }

      setActionStatus("voice handoff updated.");
      await refreshHomeData();
    } catch {
      setActionStatus("could not reach the voice queue endpoint.");
    }
  }

  useEffect(() => {
    let ignore = false;

    async function refreshPresence() {
      try {
        if (!ignore) {
          await refreshHomeData();
        }
      } catch {
        // Keep the local demo presence if the backend is unavailable in dev.
      }
    }

    void refreshPresence();
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <AppShell
      activeItem="Work Queue"
      memberName={props.operatorName}
      memberRole={props.operatorRole}
      title={props.workspaceName}
      workspaceName={props.workspaceName}
    >
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <WorkspaceTopbar context={`work queue · ${filteredWorkItems.length} open`} workspaceName={props.workspaceName}>
          <StatusPillsDisplay pills={statusPills} />
        </WorkspaceTopbar>

        <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
          <OperatorBrief members={presenceMembers} operator={operator} />
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
            <section className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-baseline gap-2.5">
                  <h2 className="font-display text-[19px] font-medium leading-none text-foreground">
                    Needs Attention
                  </h2>
                  <div className="text-xs text-muted-subtle">
                    {filteredWorkItems.length} open {filteredWorkItems.length === 1 ? "task" : "tasks"}
                  </div>
                </div>
            <QueueSwitch activeFilter={activeFilter} items={dashboardWorkItems} onFilterChange={setActiveFilter} />
              </div>
              {filteredWorkItems.length === 0 ? (
                <div className="rounded-[14px] border border-dashed border-border bg-surface/45 px-5 py-8 text-center text-[12.5px] text-muted">
                  nothing is waiting in this lane.
                </div>
              ) : (
                filteredWorkItems.map((entry) =>
                  entry.kind === "reply" ? (
                    <ReplyCard
                      key={getWorkItemKey(entry)}
                      onOpen={() => setSelectedWorkItem(entry)}
                      reply={entry.item}
                    />
                  ) : (
                    <TaskCard
                      key={getWorkItemKey(entry)}
                      onOpen={() => setSelectedWorkItem(entry)}
                      task={entry.item}
                    />
                  ),
                )
              )}
            </section>
            <aside>
              <MetricPanel metrics={dashboardMetrics} />
              <RoutingDecisionPanel items={routingDeskItems} />
              <HealthPanel health={dashboardHealth} />
              <RecentLeadsPanel leads={recentLeads} />
            </aside>
          </div>
        </div>

        <WorkItemDetailSheet
          actionStatus={actionStatus}
          entry={selectedWorkItem}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedWorkItem(null);
              setActionStatus(null);
            }
          }}
          onTaskAction={(action, task) => {
            void handleTaskAction(action, task);
          }}
          workspaceId={props.workspaceId}
          workspaceName={props.workspaceName}
          currentMemberId={props.operatorMemberId}
          onChanged={() => {
            void refreshHomeData();
          }}
        />
      </div>
    </AppShell>
  );
}
