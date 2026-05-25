"use client";

import { type RecentLeadItem } from "@realty-ops/core";
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Clock,
  Database,
  FileText,
  GitBranch,
  Home,
  MessageSquare,
  Phone,
  ShieldAlert,
  UserRound,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState, type ComponentType, type ReactNode, type SVGProps } from "react";
import { Drawer } from "vaul";

import { FacebookGlyph, InstagramGlyph } from "../../components/harwick-icons";
import { PanelButton } from "../../components/panels/panel-button";
import { MicroLabel } from "../../components/panels/typography";
import { cn } from "../../lib/utils";
import { LeadActionToolbar } from "../conversations/lead-action-toolbar";
import { type WorkItem } from "./home-page";
import { resolveActions, type ResolvedAction } from "./work-item-actions";

type Source = "instagram" | "facebook" | "voice" | "operations" | "harwick" | "lead";
type GlyphIcon = ComponentType<SVGProps<SVGSVGElement>> | LucideIcon;
export type HomeDetailItem = WorkItem | { kind: "lead"; item: RecentLeadItem };

type QueueActionDrawerProps = {
  item: HomeDetailItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enabled?: boolean;
  currentMemberId: string;
  onRefresh?: () => Promise<void> | void;
  onStatus?: (message: string | null) => void;
};

type QueueDescriptor = {
  title: string;
  subtitle: string;
  source: Source;
  priorityLabel: string;
  priorityClassName: string;
  decisionLabel: string;
  decisionText: string;
  whyLabel: string;
  whyText: string;
  nextText: string;
  afterApprovalText: string;
  primaryHref: string | null;
  primaryHrefLabel: string;
  secondaryHref: string | null;
};

function isWorkItem(item: HomeDetailItem): item is WorkItem {
  return item.kind === "reply" || item.kind === "task";
}

// Local panel primitives that match the listings-drawer idiom:
// hairline-on-white over the drawer's #0c130e background. This is
// intentionally NOT the global Card/Inset (which use panel-token surfaces
// optimised for the page shell, not for sitting inside a drawer).
function DrawerPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-[18px] border border-white/10 bg-white/[0.03] p-4", className)}>
      {children}
    </div>
  );
}

function DrawerInset({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-[12px] border border-white/8 bg-black/20", className)}>
      {children}
    </div>
  );
}

function itemTime(item: HomeDetailItem): string {
  if (item.kind === "lead") return item.item.lastTouchLabel;
  return item.kind === "reply" ? item.item.time : item.item.time;
}

function itemLeadId(item: HomeDetailItem): string | null {
  if (item.kind === "lead") return item.item.id;
  return item.kind === "reply" ? item.item.leadId ?? null : item.item.leadId ?? null;
}

function itemWorkspaceId(item: HomeDetailItem): string | null {
  if (item.kind === "lead") return item.item.workspaceId;
  return item.item.workspaceId ?? threadFor(item)?.workspaceId ?? null;
}

function conversationHref(item: HomeDetailItem): string | null {
  const leadId = itemLeadId(item);
  if (leadId === null) return null;
  if (item.kind === "reply" && item.item.reviewId !== undefined) {
    return `/conversations?leadId=${leadId}&reviewId=${item.item.reviewId}`;
  }
  return `/conversations?leadId=${leadId}`;
}

function leadHref(item: HomeDetailItem): string | null {
  const leadId = itemLeadId(item);
  return leadId === null ? null : `/leads?leadId=${leadId}`;
}

function sourceFor(item: HomeDetailItem): Source {
  if (item.kind === "lead") return "lead";
  if (item.kind === "reply") return item.item.source;
  if (item.item.type === "callback") return "voice";
  if (item.item.type === "insight") return "harwick";
  return "operations";
}

function sourceIcon(source: Source): GlyphIcon {
  if (source === "instagram") return InstagramGlyph;
  if (source === "facebook") return FacebookGlyph;
  if (source === "voice") return Phone;
  if (source === "harwick") return Bot;
  if (source === "lead") return UserRound;
  return AlertTriangle;
}

function sourceColor(source: Source): string {
  if (source === "instagram") return "text-[#DD2A7B]";
  if (source === "facebook") return "text-[#5A8DEF]";
  if (source === "voice") return "text-[var(--clay)]";
  if (source === "harwick") return "text-[var(--sage)]";
  if (source === "lead") return "text-[var(--sage)]";
  return "text-[color:var(--graphite-text-muted)]";
}

function threadFor(item: HomeDetailItem) {
  return isWorkItem(item) ? item.item.thread : undefined;
}

function itemSubject(item: HomeDetailItem): string {
  const thread = threadFor(item);
  if (item.kind === "lead") return item.item.name;
  if (item.kind === "reply") return thread?.name ?? item.item.lead;
  return thread?.name ?? item.item.title;
}

function itemSummary(item: HomeDetailItem): string {
  const thread = threadFor(item);
  if (thread?.aiSynthesis?.handoffBrief !== null && thread?.aiSynthesis?.handoffBrief !== undefined) {
    return thread.aiSynthesis.handoffBrief;
  }
  if (thread?.preview !== undefined) return thread.preview;
  if (item.kind === "lead") {
    const assigned = item.item.assignedDisplayName === null ? "unassigned" : `assigned to ${item.item.assignedDisplayName}`;
    return `${item.item.stageLabel} lead from ${item.item.sourceLabel}; ${assigned}.`;
  }
  return item.kind === "reply" ? item.item.message : item.item.detail;
}

function priorityFor(item: HomeDetailItem): { label: string; className: string } {
  if (item.kind === "lead") {
    if (item.item.stage === "qualified") return { label: "qualified", className: "text-[var(--sage)]" };
    if (item.item.stage === "lost") return { label: "lost", className: "text-[var(--oxblood)]" };
    return { label: item.item.stageLabel.toLowerCase(), className: "text-[var(--clay)]" };
  }
  if (item.kind === "reply") {
    if (item.item.automationMode === "human_takeover") return { label: "human takeover", className: "text-[var(--oxblood)]" };
    if (item.item.automationMode === "paused_by_rule") return { label: "policy paused", className: "text-[var(--clay)]" };
    return { label: "reply review", className: "text-[var(--sage)]" };
  }
  if (item.item.tone === "red") return { label: "urgent", className: "text-[var(--oxblood)]" };
  if (item.item.tone === "amber") return { label: "needs review", className: "text-[var(--clay)]" };
  if (item.item.tone === "stone") return { label: "system", className: "text-[color:var(--graphite-text-muted)]" };
  return { label: item.item.label.toLowerCase(), className: "text-[var(--sage)]" };
}

function descriptorFor(item: HomeDetailItem): QueueDescriptor {
  const priority = priorityFor(item);
  const convo = conversationHref(item);
  const lead = leadHref(item);
  const thread = threadFor(item);
  const source = sourceFor(item);

  if (item.kind === "lead") {
    return {
      title: item.item.name,
      subtitle: `${item.item.sourceLabel} / ${item.item.channelLabel}`,
      source,
      priorityLabel: priority.label,
      priorityClassName: priority.className,
      decisionLabel: "Lead review",
      decisionText: item.item.assignedDisplayName === null
        ? "Decide who should own this lead before Harwick keeps pushing follow-up."
        : "Review this lead record and decide the next move.",
      whyLabel: "Why this is in view",
      whyText: itemSummary(item),
      nextText: item.item.assignedDisplayName === null ? "Route this lead." : "Open the lead and review the next best action.",
      afterApprovalText: "Opening the lead keeps the full timeline and routing controls in context.",
      primaryHref: lead,
      primaryHrefLabel: "Open lead",
      secondaryHref: convo,
    };
  }

  if (item.kind === "reply") {
    const hasDraft = item.item.draft.trim().length > 0;
    return {
      title: `Approve reply to ${itemSubject(item)}`,
      subtitle: thread === undefined ? "Social reply" : `${thread.sourceLabel} / ${thread.channelLabel}`,
      source,
      priorityLabel: priority.label,
      priorityClassName: priority.className,
      decisionLabel: hasDraft ? "Send decision" : "Draft decision",
      decisionText: hasDraft
        ? "Decide whether Harwick's reply is safe to send, needs edits, or should be dismissed."
        : "Harwick has a social reply item, but no draft is attached yet.",
      whyLabel: "Why Harwick paused",
      whyText: thread?.automationReason ?? item.item.helper,
      nextText: thread?.aiSynthesis?.nextAction.replace(/_/g, " ") ?? (hasDraft ? "Approve and send the reply." : "Generate a reply draft."),
      afterApprovalText: hasDraft
        ? "Approval sends the reply through the protected social queue route and refreshes the queue."
        : "Draft generation asks Harwick to prepare a reply with this lead pinned.",
      primaryHref: convo,
      primaryHrefLabel: "Open conversation",
      secondaryHref: lead,
    };
  }

  if (item.item.type === "callback") {
    return {
      title: item.item.title,
      subtitle: "Voice handoff",
      source,
      priorityLabel: priority.label,
      priorityClassName: priority.className,
      decisionLabel: "Callback decision",
      decisionText: "Decide whether to schedule the callback, mark the handoff reviewed, or dismiss it.",
      whyLabel: "Voice summary",
      whyText: item.item.detail,
      nextText: item.item.action,
      afterApprovalText: "Scheduling creates the callback task from the protected voice queue endpoint.",
      primaryHref: convo,
      primaryHrefLabel: "Open conversation",
      secondaryHref: lead,
    };
  }

  if (item.item.type === "crm") {
    const isOps = item.item.operationsFailureItemType !== undefined;
    const isFub = item.item.backsyncEventId !== undefined;
    return {
      title: item.item.title,
      subtitle: isFub ? "Follow Up Boss conflict" : isOps ? "Operations failure" : "CRM review",
      source,
      priorityLabel: priority.label,
      priorityClassName: priority.className,
      decisionLabel: isFub ? "Sync decision" : "Retry decision",
      decisionText: isFub
        ? "Decide whether to replay the back-sync or ignore this conflict."
        : "Decide whether this failed system action should retry or be dismissed.",
      whyLabel: "Provider detail",
      whyText: item.item.reason ?? item.item.detail,
      nextText: item.item.action,
      afterApprovalText: isFub
        ? "Replay queues the Follow Up Boss conflict reconciler and audits the action."
        : "Retry sends the failure back through the protected operations action route.",
      primaryHref: "/activity",
      primaryHrefLabel: "Open activity",
      secondaryHref: lead,
    };
  }

  // Subagent-produced insights get their own descriptor because they're
  // finished analytical reports, not approve/dismiss approvals. The decision
  // is "did this help" — and the report itself is the body.
  if (item.item.type === "insight" && item.item.subagentType !== undefined) {
    const subagentLabel = item.item.subagentType === "research"
      ? "Research subagent"
      : item.item.subagentType === "writer"
        ? "Writer subagent"
        : item.item.subagentType === "calendar"
          ? "Calendar subagent"
          : "Routing subagent";
    const confidence = item.item.subagentConfidence;
    const confidencePill = confidence === undefined
      ? null
      : `${Math.round(confidence * 100)}% confidence`;
    const subtitleParts = [subagentLabel];
    if (confidencePill !== null) subtitleParts.push(confidencePill);
    return {
      title: item.item.title,
      subtitle: subtitleParts.join(" · "),
      source,
      priorityLabel: priority.label,
      priorityClassName: priority.className,
      decisionLabel: "What Harwick found",
      decisionText: item.item.detail,
      whyLabel: "Why it matters",
      whyText: item.item.reason ?? "No additional reasoning recorded.",
      nextText: item.item.action,
      afterApprovalText: "Marking this useful trains future Harwick subagents on what kind of analysis you want more of. Dismiss removes it from the queue.",
      primaryHref: lead ?? "/activity",
      primaryHrefLabel: lead === null ? "Open activity" : "Open lead",
      secondaryHref: convo,
    };
  }

  return {
    title: item.item.title,
    subtitle: item.item.workItemType === "approval" ? "Harwick approval" : "Harwick insight",
    source,
    priorityLabel: priority.label,
    priorityClassName: priority.className,
    decisionLabel: item.item.workItemType === "approval" ? "Approval decision" : "Insight decision",
    decisionText: item.item.workItemType === "approval"
      ? "Decide whether Harwick should proceed with the proposed internal action."
      : "Decide whether this signal is useful, should be marked seen, or dismissed.",
    whyLabel: "Why Harwick surfaced this",
    whyText: item.item.reason ?? item.item.detail,
    nextText: item.item.action,
    afterApprovalText: item.item.loopDetail?.agentLoopBrief
      ?? item.item.loopDetail?.draftBody
      ?? "The action updates the Harwick work item through the audited work-item route.",
    primaryHref: lead ?? "/activity",
    primaryHrefLabel: lead === null ? "Open activity" : "Open lead",
    secondaryHref: convo,
  };
}

function hasRealDraft(item: WorkItem): boolean {
  if (item.kind !== "reply") return false;
  if (item.item.draft.trim().length > 0) return true;
  return item.item.thread?.messages.some((message) => message.kind === "ai_action") ?? false;
}

function detailRows(item: HomeDetailItem): Array<{ icon: LucideIcon; label: string; value: string }> {
  const thread = threadFor(item);
  if (thread !== undefined) {
    return [
      { icon: UserRound, label: "Assigned", value: thread.assignedTo },
      { icon: CheckCircle2, label: "Score", value: thread.scoreLabel },
      { icon: Home, label: "Intent", value: thread.intentType },
      { icon: Clock, label: "Timeline", value: thread.timeline },
      { icon: FileText, label: "Budget", value: thread.budget },
      { icon: MessageSquare, label: "Context", value: thread.sourceContext },
    ].filter((row) => row.value.trim().length > 0 && row.value.toLowerCase() !== "unknown");
  }

  if (item.kind === "lead") {
    return [
      { icon: UserRound, label: "Assigned", value: item.item.assignedDisplayName ?? "Unassigned" },
      { icon: MessageSquare, label: "Channel", value: `${item.item.sourceLabel} / ${item.item.channelLabel}` },
      { icon: CheckCircle2, label: "Stage", value: item.item.stageLabel },
      { icon: Clock, label: "Last touch", value: item.item.lastTouchLabel },
    ];
  }

  if (item.kind === "reply") {
    return [
      { icon: MessageSquare, label: "Channel", value: item.item.source },
      { icon: Bot, label: "Automation", value: item.item.automationMode.replace(/_/g, " ") },
      { icon: Clock, label: "Created", value: item.item.time },
    ];
  }

  const task = item.item;
  return [
    { icon: task.type === "callback" ? Phone : task.type === "crm" ? Database : Bot, label: "Type", value: task.type },
    { icon: ShieldAlert, label: "Reason", value: task.reason ?? task.detail },
    { icon: Clock, label: "Timing", value: task.time },
    { icon: Wrench, label: "Action", value: task.action },
  ];
}

function queueIcon(item: HomeDetailItem): LucideIcon {
  if (item.kind === "lead") return UserRound;
  if (item.kind === "reply") return MessageSquare;
  if (item.item.type === "callback") return Phone;
  if (item.item.type === "crm") return GitBranch;
  if (item.item.type === "listing") return Home;
  if (item.item.workItemType === "approval") return CheckCircle2;
  return Bot;
}

function actionVariant(index: number, label: string): "accent" | "ghost" | "quiet" {
  if (index === 0 && label !== "Dismiss" && label !== "Ignore") return "accent";
  if (label === "Dismiss" || label === "Ignore") return "quiet";
  return "ghost";
}

function loopToolRows(item: HomeDetailItem): Array<{ tool: string; reason: string; requiresApproval: boolean }> {
  if (item.kind !== "task") return [];
  return item.item.loopDetail?.proposedToolCalls ?? [];
}

function draftText(item: HomeDetailItem): string | null {
  if (item.kind === "reply") return item.item.draft.trim().length > 0 ? item.item.draft : null;
  if (item.kind === "task") return item.item.loopDetail?.draftBody ?? null;
  return null;
}

export function LeadDetailDrawer(props: QueueActionDrawerProps) {
  const item = props.item;
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);

  const actions = useMemo(() => {
    if (item === null || !isWorkItem(item)) return [];
    return resolveActions(item, { hasRealDraft: hasRealDraft(item) });
  }, [item]);

  if (item === null) {
    return (
      <Drawer.Root noBodyStyles open={props.open} onOpenChange={props.onOpenChange}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" />
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  const detailItem = item;
  const descriptor = descriptorFor(detailItem);
  const source = descriptor.source;
  const SourceIconCmp = sourceIcon(source) as ComponentType<SVGProps<SVGSVGElement> & { strokeWidth?: number }>;
  const QueueIcon = queueIcon(detailItem);
  const thread = threadFor(detailItem);
  const synth = thread?.aiSynthesis;
  const messages = [...(thread?.messages ?? [])].slice(-4);
  const rows = detailRows(detailItem);
  const tools = loopToolRows(detailItem);
  const draft = draftText(detailItem);
  const leadId = itemLeadId(detailItem);
  const workspaceId = itemWorkspaceId(detailItem);
  const automationMode = thread?.automationMode ?? (detailItem.kind === "reply" ? detailItem.item.automationMode : null);

  async function runAction(action: ResolvedAction) {
    if (pendingLabel !== null || props.enabled === false) return;
    if (action.label === "Edit") {
      const href = conversationHref(detailItem);
      if (href !== null) window.location.href = href;
      return;
    }
    setPendingLabel(action.label);
    props.onStatus?.(null);
    const result = await action.run();
    props.onStatus?.(result.message);
    setPendingLabel(null);
    if (result.ok) {
      await props.onRefresh?.();
      props.onOpenChange(false);
    }
  }

  return (
    <Drawer.Root noBodyStyles open={props.open} onOpenChange={props.onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-[rgba(8,12,8,0.62)] backdrop-blur-[18px] backdrop-saturate-125" />
        <Drawer.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex h-[94vh] max-w-[760px] flex-col overflow-hidden rounded-t-[32px] border border-b-0 border-white/8 bg-[#0c130e] text-white shadow-[0_-32px_80px_-12px_rgba(6,12,8,0.55)] outline-none"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-t-[32px]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 86% 4%, rgba(136,162,118,0.22), transparent 40%), linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0) 22%)",
            }}
          />

          <div className="relative mt-2.5 flex justify-center">
            <div className="h-[5px] w-[44px] rounded-full bg-white/22" aria-hidden="true" />
          </div>

          <div className="relative flex items-start justify-between gap-3 px-6 pb-4 pt-3.5">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase leading-none tracking-[0.18em]">
                <SourceIconCmp className={cn("size-3", sourceColor(source))} aria-hidden="true" strokeWidth={2} />
                <span className="text-white/46">{source}</span>
                <span className="text-white/22">·</span>
                <span className={cn(descriptor.priorityClassName)}>{descriptor.priorityLabel}</span>
              </div>
              <Drawer.Title className="mt-2 font-display text-[26px] font-medium lowercase leading-[1.05] tracking-[-0.02em] text-white">
                {descriptor.title}
              </Drawer.Title>
              <p className="mt-1.5 text-[12.5px] leading-5 text-white/56">{descriptor.subtitle}</p>
            </div>
            <Drawer.Close
              className="-mr-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] text-white/70 transition hover:border-white/22 hover:text-white"
              aria-label="close"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Drawer.Close>
          </div>

          <div className="relative min-h-0 flex-1 space-y-3 overflow-y-auto px-6 pb-6">
            <DrawerPanel>
              <div className="flex items-center gap-2">
                <QueueIcon className="size-3.5 text-[var(--sage)]" aria-hidden="true" />
                <MicroLabel className="text-[var(--sage)]">{descriptor.decisionLabel}</MicroLabel>
              </div>
              <p className="mt-2 text-[14px] font-semibold leading-6 text-[color:var(--graphite-text)]">{descriptor.decisionText}</p>
              <DrawerInset className="mt-3 px-3 py-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[color:var(--graphite-text-faint)]">after approval</div>
                <p className="mt-1 text-[12.5px] leading-5 text-[color:var(--graphite-text-muted)]">{descriptor.afterApprovalText}</p>
              </DrawerInset>
            </DrawerPanel>

            <DrawerPanel>
              <div className="mb-2 flex items-center justify-between gap-3">
                <MicroLabel>{descriptor.whyLabel}</MicroLabel>
                <span className="font-mono text-[10.5px] text-[color:var(--graphite-text-faint)]">{itemTime(detailItem)}</span>
              </div>
              <p className="text-[13px] leading-5 text-[color:var(--graphite-text)]">{descriptor.whyText}</p>
              <div className="mt-3 rounded-[10px] border border-[color:var(--panel-line-soft)] bg-[color:var(--panel-3)]/30 px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[color:var(--graphite-text-faint)]">next</div>
                <p className="mt-1 text-[12.5px] font-semibold leading-5 text-[color:var(--graphite-text)]">{descriptor.nextText}</p>
              </div>
            </DrawerPanel>

            {isWorkItem(detailItem) && detailItem.kind === "task" && detailItem.item.subagentFindings !== undefined && detailItem.item.subagentFindings.length > 0 ? (
              <DrawerPanel>
                <div className="mb-3 flex items-center gap-2">
                  <Bot className="size-3.5 text-[var(--sage)]" aria-hidden="true" />
                  <MicroLabel>findings</MicroLabel>
                </div>
                <ul className="space-y-3">
                  {detailItem.item.subagentFindings.map((finding, index) => (
                    <li key={`finding-${index}`} className="rounded-[10px] border border-[color:var(--panel-line-soft)] bg-[color:var(--panel-3)]/25 p-3">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="truncate text-[12px] font-semibold text-[color:var(--graphite-text)]">{finding.subject}</span>
                        <span className="shrink-0 font-mono text-[10px] text-[color:var(--graphite-text-faint)]">{Math.round(finding.confidence * 100)}%</span>
                      </div>
                      <p className="text-[12.5px] leading-5 text-[color:var(--graphite-text)]">{finding.observation}</p>
                      <p className="mt-1.5 text-[11.5px] leading-4 text-[color:var(--graphite-text-muted)]">{finding.implication}</p>
                    </li>
                  ))}
                </ul>
              </DrawerPanel>
            ) : null}

            {isWorkItem(detailItem) && detailItem.kind === "task" && detailItem.item.subagentNextSteps !== undefined && detailItem.item.subagentNextSteps.length > 0 ? (
              <DrawerPanel>
                <div className="mb-3 flex items-center gap-2">
                  <CheckCircle2 className="size-3.5 text-[var(--clay)]" aria-hidden="true" />
                  <MicroLabel>next steps</MicroLabel>
                </div>
                <ol className="space-y-2">
                  {detailItem.item.subagentNextSteps.map((step, index) => {
                    const urgencyLabel = step.urgency === "now"
                      ? "now"
                      : step.urgency === "this_week"
                        ? "this week"
                        : step.urgency === "this_month"
                          ? "this month"
                          : "later";
                    const urgencyClass = step.urgency === "now"
                      ? "text-[var(--oxblood)]"
                      : step.urgency === "this_week"
                        ? "text-[var(--clay)]"
                        : "text-[color:var(--graphite-text-muted)]";
                    return (
                      <li key={`step-${index}`} className="rounded-[10px] border border-[color:var(--panel-line-soft)] bg-[color:var(--panel-3)]/25 p-3">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--graphite-text-muted)]">{step.who}</span>
                          <span className={cn("text-[10.5px] font-semibold uppercase tracking-[0.08em]", urgencyClass)}>{urgencyLabel}</span>
                        </div>
                        <p className="text-[12.5px] font-semibold leading-5 text-[color:var(--graphite-text)]">{step.action}</p>
                        <p className="mt-1 text-[11.5px] leading-4 text-[color:var(--graphite-text-muted)]">{step.why}</p>
                      </li>
                    );
                  })}
                </ol>
              </DrawerPanel>
            ) : null}

            {isWorkItem(detailItem) && detailItem.kind === "task"
              && ((detailItem.item.subagentBlockers !== undefined && detailItem.item.subagentBlockers.length > 0)
                || (detailItem.item.subagentDataGaps !== undefined && detailItem.item.subagentDataGaps.length > 0)) ? (
              <DrawerPanel>
                {detailItem.item.subagentBlockers !== undefined && detailItem.item.subagentBlockers.length > 0 ? (
                  <div className="mb-3">
                    <div className="mb-2 flex items-center gap-2">
                      <ShieldAlert className="size-3.5 text-[var(--oxblood)]" aria-hidden="true" />
                      <MicroLabel>blockers</MicroLabel>
                    </div>
                    <ul className="space-y-1.5">
                      {detailItem.item.subagentBlockers.map((blocker, index) => (
                        <li key={`blocker-${index}`} className="rounded-[8px] border border-[var(--oxblood)]/30 bg-[var(--oxblood-soft)] px-2.5 py-1.5 text-[12px] leading-5 text-[color:var(--graphite-text)]">
                          {blocker}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {detailItem.item.subagentDataGaps !== undefined && detailItem.item.subagentDataGaps.length > 0 ? (
                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <Database className="size-3.5 text-[color:var(--graphite-text-muted)]" aria-hidden="true" />
                      <MicroLabel>data gaps</MicroLabel>
                    </div>
                    <ul className="space-y-1">
                      {detailItem.item.subagentDataGaps.map((gap, index) => (
                        <li key={`gap-${index}`} className="text-[11.5px] leading-4 text-[color:var(--graphite-text-muted)]">
                          — {gap}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </DrawerPanel>
            ) : null}

            <DrawerPanel>
              <div className="mb-3 flex items-center gap-2">
                <UserRound className="size-3.5 text-[color:var(--graphite-text-muted)]" aria-hidden="true" />
                <MicroLabel>context</MicroLabel>
              </div>
              <dl className="space-y-2">
                {rows.map((row) => {
                  const Icon = row.icon;
                  return (
                    <div key={row.label} className="flex items-start justify-between gap-3 text-[12px]">
                      <dt className="flex items-center gap-1.5 text-[color:var(--graphite-text-faint)]">
                        <Icon className="size-3" aria-hidden="true" />
                        {row.label}
                      </dt>
                      <dd className="max-w-[62%] text-right font-semibold leading-5 text-[color:var(--graphite-text)]">{row.value}</dd>
                    </div>
                  );
                })}
              </dl>
            </DrawerPanel>

            {draft === null ? null : (
              <DrawerPanel>
                <MicroLabel className="text-[var(--sage)]">{detailItem.kind === "reply" ? "draft" : "Harwick output"}</MicroLabel>
                <DrawerInset className="mt-2 px-3 py-2.5">
                  <p className="whitespace-pre-wrap text-[12.5px] leading-5 text-[color:var(--graphite-text)]">{draft}</p>
                </DrawerInset>
              </DrawerPanel>
            )}

            {tools.length === 0 ? null : (
              <DrawerPanel>
                <MicroLabel>proposed tool calls</MicroLabel>
                <div className="mt-3 space-y-2">
                  {tools.map((tool) => (
                    <DrawerInset key={`${tool.tool}:${tool.reason}`} className="px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[10.5px] text-[color:var(--graphite-text)]">/{tool.tool}</span>
                        <span className="text-[10px] uppercase tracking-[0.1em] text-[color:var(--graphite-text-faint)]">
                          {tool.requiresApproval ? "approval" : "ready"}
                        </span>
                      </div>
                      <p className="mt-1 text-[12px] leading-5 text-[color:var(--graphite-text-muted)]">{tool.reason}</p>
                    </DrawerInset>
                  ))}
                </div>
              </DrawerPanel>
            )}

            {synth === undefined || synth === null ? null : (
              <DrawerPanel>
                <MicroLabel>live synthesis</MicroLabel>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <DrawerInset className="px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.1em] text-[color:var(--graphite-text-faint)]">intent</div>
                    <div className="mt-0.5 text-[12px] font-semibold text-[color:var(--graphite-text)]">{synth.intent.replace(/_/g, " ")}</div>
                  </DrawerInset>
                  <DrawerInset className="px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.1em] text-[color:var(--graphite-text-faint)]">confidence</div>
                    <div className="mt-0.5 font-mono text-[12px] font-semibold text-[color:var(--graphite-text)]">{Math.round(synth.confidence * 100)}%</div>
                  </DrawerInset>
                </div>
                {synth.missingFields.length === 0 ? null : (
                  <p className="mt-3 text-[11.5px] leading-5 text-[color:var(--graphite-text-muted)]">
                    <span className="text-[color:var(--graphite-text-faint)]">missing:</span>{" "}
                    {synth.missingFields.map((field) => field.replace(/_/g, " ")).join(", ")}
                  </p>
                )}
              </DrawerPanel>
            )}

            {messages.length === 0 ? null : (
              <DrawerPanel>
                <div className="mb-3 flex items-center gap-2">
                  <MessageSquare className="size-3.5 text-[color:var(--graphite-text-muted)]" aria-hidden="true" />
                  <MicroLabel>latest thread</MicroLabel>
                </div>
                <div className="space-y-2">
                  {messages.map((message) => (
                    <div key={message.id} className="rounded-[10px] border border-[color:var(--panel-line-soft)] bg-[color:var(--panel-3)]/25 px-3 py-2">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[color:var(--graphite-text-faint)]">
                          {message.kind === "ai_action" ? "harwick" : message.kind}
                        </span>
                        <span className="truncate font-mono text-[10px] text-[color:var(--graphite-text-faint)]">{message.meta}</span>
                      </div>
                      <p className="text-[12.5px] leading-5 text-[color:var(--graphite-text)]">{message.body}</p>
                    </div>
                  ))}
                </div>
              </DrawerPanel>
            )}
          </div>

          <div
            className="relative shrink-0 border-t border-white/8 bg-[color:var(--panel-1)]/95 px-4 py-3 backdrop-blur-sm"
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
          >
            {workspaceId !== null && leadId !== null && automationMode !== null ? (
              <LeadActionToolbar
                className="mb-3"
                workspaceId={workspaceId}
                leadId={leadId}
                automationMode={automationMode}
                assignedMemberId={null}
                currentMemberId={props.currentMemberId}
                appearance="dark"
                showAgentSteps={false}
                showComposer={false}
                {...(props.onRefresh === undefined ? {} : { onChanged: props.onRefresh })}
              />
            ) : null}
            {actions.length === 0 ? (
              <div className="flex items-center gap-2">
                {descriptor.primaryHref === null ? null : (
                  <PanelButton asChild size="md" variant="accent" accent="sage" className="flex-1">
                    <a href={descriptor.primaryHref}>
                      <ArrowUpRight className="mr-1.5 size-3.5" aria-hidden="true" />
                      {descriptor.primaryHrefLabel}
                    </a>
                  </PanelButton>
                )}
                {descriptor.secondaryHref === null ? null : (
                  <PanelButton asChild size="md" variant="ghost" className="flex-1">
                    <a href={descriptor.secondaryHref}>
                      <MessageSquare className="mr-1.5 size-3.5" aria-hidden="true" />
                      Open convo
                    </a>
                  </PanelButton>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {actions.map((action, index) => (
                  <PanelButton
                    key={action.label}
                    size="md"
                    variant={actionVariant(index, action.label)}
                    accent="sage"
                    disabled={props.enabled === false || pendingLabel !== null || action.disabled === true}
                    className={index === 0 ? "flex-1" : undefined}
                    onClick={() => { void runAction(action); }}
                  >
                    {pendingLabel === action.label ? "Working..." : action.label}
                  </PanelButton>
                ))}
                {descriptor.primaryHref === null ? null : (
                  <PanelButton asChild size="md" variant="ghost">
                    <a href={descriptor.primaryHref}>
                      <ArrowUpRight className="mr-1.5 size-3.5" aria-hidden="true" />
                      Open
                    </a>
                  </PanelButton>
                )}
              </div>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
