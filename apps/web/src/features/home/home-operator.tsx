"use client";

import {
  ConversationsInboxResponseSchema,
  OwnerHomeQueueResponseSchema,
  RecentLeadsResponseSchema,
  RoutingDeskResponseSchema,
  TeamPresenceResponseSchema,
  type ConversationInboxThread,
  type OwnerHomeQueueItem,
  type RecentLeadItem,
  type RoutingDeskItem,
  type TeamPresenceMember,
  type WorkspaceRole,
} from "@realty-ops/core";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Flame,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AppShell } from "../../components/app-shell";
import { HarwickMark } from "../../components/harwick-rail/harwick-mark";
import { FeedbackButtons } from "../../components/training-signals/feedback-buttons";
import { cn } from "../../lib/utils";
import { mapHomePayloadToWorkItems, readObject, type WorkItem } from "./home-page";
import { LeadDetailDrawer, type HomeDetailItem } from "./lead-detail-drawer";
import { QueueActionCard } from "./queue-action-card";
import { SchedulePane } from "./schedule-pane";
import {
  actionsEnabled,
  filterRecentLeads,
  filterRouting,
  filterWorkItems,
  showOpsHealth,
  showRouting,
  showTeamPane,
  tierFor,
  type RoleScope,
} from "./role-scope";

function greetingFor(now: Date): string {
  const h = now.getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const cardBase =
  "rounded-[12px] border border-white/[0.07] bg-gradient-to-b from-white/[0.035] to-white/[0.012] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_8px_24px_-12px_rgba(0,0,0,0.4)]";

const rowBase =
  "border-b border-white/[0.06] last:border-b-0 transition-colors hover:bg-white/[0.025]";

const linkBtn =
  "inline-flex items-center gap-1 text-[11.5px] font-medium text-white/52 transition hover:text-white";

function SectionHead(props: { dot: string; title: string; trailing?: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex min-w-0 items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className={cn("size-1.5 rounded-full", props.dot)} aria-hidden="true" />
        <h2 className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-white/56">{props.title}</h2>
      </div>
      {props.trailing === undefined ? null : <div className="shrink-0">{props.trailing}</div>}
    </div>
  );
}

function HotLeadRow({ lead, onOpenDetail }: { lead: RecentLeadItem; onOpenDetail?: (item: HomeDetailItem) => void }) {
  const stageStyles: Record<string, string> = {
    new: "bg-[var(--clay-soft)] text-[var(--clay)]",
    qualified: "bg-[var(--sage-soft)] text-[var(--sage)]",
    nurture: "bg-white/[0.06] text-white/64",
    review: "bg-[var(--clay-soft)] text-[var(--clay)]",
    lost: "bg-[var(--oxblood-soft)] text-[var(--oxblood)]",
  };
  return (
    <a
      href={`/leads?leadId=${lead.id}`}
      onClick={(event) => {
        if (onOpenDetail === undefined) return;
        event.preventDefault();
        onOpenDetail({ kind: "lead", item: lead });
      }}
      className={cn("flex items-center gap-3 px-4 py-2.5", rowBase)}
    >
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-white/[0.07] bg-white/[0.04] text-[10.5px] font-medium text-white/68">
        {lead.initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-white">{lead.name}</div>
        <div className="flex items-center gap-1.5 text-[11px] text-white/56">
          <span>{lead.sourceLabel}</span>
          <span className="size-0.5 rounded-full bg-white/[0.18]" aria-hidden="true" />
          <span className={cn("inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium", stageStyles[lead.stage] ?? stageStyles["new"])}>{lead.stageLabel}</span>
        </div>
      </div>
      <span className="font-mono text-[10.5px] text-white/40">{lead.lastTouchLabel}</span>
    </a>
  );
}

function RoutingRow({ item, enabled }: { item: RoutingDeskItem; enabled: boolean }) {
  const decision = item.decision;
  return (
    <div className={cn("grid items-start gap-3 px-4 py-3 md:grid-cols-[1fr_1fr_auto]", rowBase)}>
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-white">{item.leadName}</div>
        <div className="mt-0.5 truncate text-[11.5px] text-white/52">
          {item.source} · {item.qualification.leadType}
        </div>
      </div>
      <div className="min-w-0 text-[12px] leading-5 text-white/60">
        <div className="font-medium text-white">→ {decision.assignedDisplayName ?? "unassigned"}</div>
        <div className="line-clamp-2">{decision.reasons[0] ?? item.summary}</div>
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <a
          href={`/leads?leadId=${item.leadId}`}
          className="inline-flex shrink-0 items-center gap-1 rounded-[8px] border border-white/[0.08] bg-white/[0.025] px-2.5 py-1.5 text-[11.5px] font-medium text-white/82 transition hover:border-white/[0.16] hover:bg-white/[0.05] hover:text-white"
        >
          Open lead
          <ArrowRight className="size-3" aria-hidden="true" />
        </a>
        <FeedbackButtons
          size="sm"
          compact
          enabled={enabled}
          label="right call?"
          target={{
            kind: "surface",
            workspaceId: item.workspaceId,
            surface: "routing_decision",
            resourceId: item.leadId,
            context: {
              leadName: item.leadName,
              assignedTo: decision.assignedDisplayName ?? null,
              status: decision.status,
              matchScore: decision.matchScore,
            },
          }}
        />
      </div>
    </div>
  );
}

function WorkloadRow({ member }: { member: TeamPresenceMember }) {
  const ratio = Math.min(1, member.activeLeadCount / 20);
  const tone = member.activeLeadCount >= 18 ? "bg-[var(--oxblood)]" : member.activeLeadCount >= 12 ? "bg-[var(--clay)]" : "bg-[var(--sage)]";

  return (
    <div className={cn("flex items-center gap-3 px-4 py-2.5", rowBase)}>
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-white/[0.07] bg-white/[0.04] text-[10.5px] font-medium text-white/68">
        {member.initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-white">{member.name}</div>
        <div className="truncate text-[11px] text-white/52">{member.roleLabel} · {member.lastSeen}</div>
      </div>
      <div className="flex w-[86px] shrink-0 items-center gap-2 sm:w-[140px]">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
          <div className={cn("h-full rounded-full", tone)} style={{ width: `${Math.round(ratio * 100)}%` }} />
        </div>
        <span className="font-mono text-[10.5px] text-white/52">{member.activeLeadCount}</span>
      </div>
    </div>
  );
}

type InsightSeed = {
  kind: "insight" | "trend" | "alert";
  text: string;
  href?: string;
};

function deriveInsights(params: {
  workItems: WorkItem[];
  recentLeads: RecentLeadItem[];
  routing: RoutingDeskItem[];
  tier: RoleScope["tier"];
}): InsightSeed[] {
  const insights: InsightSeed[] = [];
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;

  const urgent = params.workItems.filter((item) => item.kind === "task" && item.item.tone === "red");
  if (urgent.length > 0) {
    insights.push({
      kind: "alert",
      text: `${urgent.length} urgent item${urgent.length === 1 ? "" : "s"} flagged red — review before they age out.`,
      href: "/queue",
    });
  }

  const draftsPending = params.workItems.filter((item) => {
    if (item.kind !== "reply") return false;
    return item.item.thread?.messages.some((message) => message.kind === "ai_action") ?? false;
  }).length;
  if (draftsPending > 0) {
    insights.push({
      kind: "trend",
      text: `${draftsPending} AI draft${draftsPending === 1 ? "" : "s"} waiting for your approval.`,
      href: "/queue",
    });
  }

  const voiceHandoffs = params.workItems.filter((item) => item.kind === "task" && item.item.type === "callback").length;
  if (voiceHandoffs > 0) {
    insights.push({
      kind: "alert",
      text: `${voiceHandoffs} voice handoff${voiceHandoffs === 1 ? "" : "s"} from calls Harwick couldn't close.`,
      href: "/queue",
    });
  }

  const fubConflicts = params.workItems.filter((item) => item.kind === "task" && item.item.backsyncEventId !== undefined).length;
  if (fubConflicts > 0) {
    insights.push({
      kind: "alert",
      text: `${fubConflicts} Follow Up Boss sync conflict${fubConflicts === 1 ? "" : "s"} blocking automation.`,
      href: "/queue",
    });
  }

  const freshLeads = params.recentLeads.filter((lead) => {
    if (lead.lastTouchAt === null) return false;
    return Date.parse(lead.lastTouchAt) >= dayAgo;
  }).length;
  if (freshLeads > 0) {
    insights.push({
      kind: "trend",
      text: `${freshLeads} new lead${freshLeads === 1 ? "" : "s"} captured in the last 24h.`,
      href: "/leads",
    });
  }

  const staleLeads = params.recentLeads.filter((lead) => {
    if (lead.stage === "lost") return false;
    if (lead.lastTouchAt === null) return false;
    return Date.parse(lead.lastTouchAt) < dayAgo && lead.assignedDisplayName !== null;
  }).length;
  if (staleLeads > 2) {
    insights.push({
      kind: "insight",
      text: `${staleLeads} assigned leads haven't been touched in 24h+ — consider a follow-up nudge.`,
      href: "/leads",
    });
  }

  const routingPending = params.routing.filter((item) => item.decision.status !== "assigned").length;
  if (routingPending > 0 && (params.tier === "owner" || params.tier === "lead")) {
    insights.push({
      kind: "trend",
      text: `${routingPending} routing decision${routingPending === 1 ? "" : "s"} pending — Harwick proposed assignments.`,
      href: "/queue",
    });
  }

  if (insights.length === 0) {
    const text = params.tier === "agent"
      ? "You're caught up. No drafts or showings on you right now."
      : params.tier === "ops"
        ? "System looks healthy. No failed jobs or sync conflicts pending."
        : "Harwick is keeping the surface quiet — no signals to raise.";
    insights.push({ kind: "insight", text });
  }

  return insights;
}

function InsightCard({ insight }: { insight: InsightSeed }) {
  const toneClass = insight.kind === "alert"
    ? "text-[var(--oxblood)]"
    : insight.kind === "trend"
      ? "text-[var(--clay)]"
      : "text-[var(--sage)]";
  const content = (
    <div className="flex items-start gap-2.5 px-4 py-3 transition-colors group-hover:bg-white/[0.02]">
      {insight.kind === "insight" ? (
        <Bot className={cn("mt-0.5 size-3.5 shrink-0", toneClass)} aria-hidden="true" />
      ) : insight.kind === "alert" ? (
        <AlertTriangle className={cn("mt-0.5 size-3.5 shrink-0", toneClass)} aria-hidden="true" />
      ) : (
        <TrendingUp className={cn("mt-0.5 size-3.5 shrink-0", toneClass)} aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <div className={cn("text-[10px] font-semibold uppercase tracking-[0.1em]", toneClass)}>{insight.kind}</div>
        <p className="mt-0.5 text-[12.5px] leading-5 text-white/86">{insight.text}</p>
      </div>
      {insight.href === undefined ? null : (
        <ArrowRight className="mt-0.5 size-3 shrink-0 text-white/30 transition-colors group-hover:text-white/82" aria-hidden="true" />
      )}
    </div>
  );
  if (insight.href !== undefined) {
    return (
      <a href={insight.href} className={cn("group block border-b border-white/[0.06] last:border-b-0")}>
        {content}
      </a>
    );
  }
  return <div className={cn("group", rowBase)}>{content}</div>;
}

export type HomeOperatorPageProps = {
  workspaceId: string;
  workspaceName: string;
  operatorName: string;
  operatorRole: WorkspaceRole;
  operatorMemberId: string;
};

export function HomeOperatorPage(props: HomeOperatorPageProps) {
  const scope: RoleScope = useMemo(() => ({
    role: props.operatorRole,
    tier: tierFor(props.operatorRole),
    memberId: props.operatorMemberId,
    displayName: props.operatorName,
  }), [props.operatorMemberId, props.operatorName, props.operatorRole]);

  const [ownerQueue, setOwnerQueue] = useState<OwnerHomeQueueItem[]>([]);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [recentLeads, setRecentLeads] = useState<RecentLeadItem[]>([]);
  const [routing, setRouting] = useState<RoutingDeskItem[]>([]);
  const [team, setTeam] = useState<TeamPresenceMember[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [selectedWorkItem, setSelectedWorkItem] = useState<HomeDetailItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [mobileDetailEnabled, setMobileDetailEnabled] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [homeRes, ownerRes] = await Promise.all([
        fetch(`/api/home?workspaceId=${props.workspaceId}`, { cache: "no-store" }),
        scope.tier === "owner" || scope.tier === "lead"
          ? fetch(`/api/home/owner-queue?workspaceId=${props.workspaceId}`, { cache: "no-store" })
          : Promise.resolve(null),
      ]);

      if (homeRes.ok) {
        const payload = readObject(await homeRes.json());
        if (payload !== null) {
          const conversationsParsed = ConversationsInboxResponseSchema.safeParse(payload["conversations"]);
          const threads = conversationsParsed.success ? conversationsParsed.data.threads : [];
          const threadMap = new Map<string, ConversationInboxThread>(threads.map((thread) => [thread.leadId, thread]));
          setWorkItems(mapHomePayloadToWorkItems(payload, threadMap));

          const recentParsed = RecentLeadsResponseSchema.safeParse(payload["recentLeads"]);
          setRecentLeads(recentParsed.success ? recentParsed.data.items : []);

          const routingParsed = RoutingDeskResponseSchema.safeParse(payload["routingDesk"]);
          setRouting(routingParsed.success ? routingParsed.data.items : []);

          const teamParsed = TeamPresenceResponseSchema.safeParse(payload["teamPresence"]);
          setTeam(teamParsed.success ? teamParsed.data.members : []);
        }
      }

      if (ownerRes !== null && ownerRes.ok) {
        const payload = readObject(await ownerRes.json());
        const parsed = OwnerHomeQueueResponseSchema.safeParse(payload);
        setOwnerQueue(parsed.success ? parsed.data.items : []);
      } else {
        setOwnerQueue([]);
      }
    } catch {
      // swallow
    }
  }, [props.workspaceId, scope.tier]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setMobileDetailEnabled(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const firstName = props.operatorName.trim().split(/\s+/)[0] ?? props.operatorName;

  // Tier-aware slices
  const myQueue = useMemo(() => filterWorkItems(workItems, scope), [workItems, scope]);
  const myLeads = useMemo(() => filterRecentLeads(recentLeads, scope), [recentLeads, scope]);
  const myRouting = useMemo(() => filterRouting(routing, scope), [routing, scope]);

  const urgent = myQueue.filter((item) => item.kind === "task" && item.item.tone === "red").length;
  const totalQueue = myQueue.length;

  const insights = deriveInsights({ workItems: myQueue, recentLeads: myLeads, routing: myRouting, tier: scope.tier });
  // "Hot" = either (a) the lead is in the urgent work-item queue, or
  // (b) it's freshly new in the last 24h and still untouched. Skip everything
  // else so this section stops mirroring the full lead list.
  const hotLeadIdsFromQueue = new Set<string>();
  for (const entry of myQueue) {
    if (entry.kind === "task" && entry.item.tone === "red" && entry.item.leadId !== undefined && entry.item.leadId !== null) {
      hotLeadIdsFromQueue.add(entry.item.leadId);
    }
    if (entry.kind === "reply" && entry.item.leadId !== undefined && entry.item.leadId !== null) {
      hotLeadIdsFromQueue.add(entry.item.leadId);
    }
  }
  const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
  const hotLeads = myLeads
    .filter((lead) => {
      if (hotLeadIdsFromQueue.has(lead.id)) return true;
      if (lead.stage !== "new") return false;
      if (lead.lastTouchAt === null) return false;
      return Date.parse(lead.lastTouchAt) >= twentyFourHoursAgo;
    })
    .slice(0, 5);
  const enabled = actionsEnabled(scope);

  const tierCopy: Record<RoleScope["tier"], { hero: string; subhero: (counts: { total: number; urgent: number }) => React.ReactNode }> = {
    owner: {
      hero: "owner · workspace view",
      subhero: ({ total, urgent: u }) => (
        <>
          <strong className="text-white">{total} workspace item{total === 1 ? "" : "s"}</strong> need a decision today
          {u > 0 ? <> — <strong className="text-[var(--oxblood)]">{u} urgent</strong></> : null}.
        </>
      ),
    },
    lead: {
      hero: "team lead · personal + team view",
      subhero: ({ total, urgent: u }) => (
        <>
          <strong className="text-white">{total} on you</strong>
          {u > 0 ? <> — <strong className="text-[var(--oxblood)]">{u} urgent</strong></> : null}. Team approvals below.
        </>
      ),
    },
    agent: {
      hero: "agent · your work",
      subhero: ({ total, urgent: u }) => (
        <>
          {total === 0
            ? <>You're caught up. Harwick is holding the rest.</>
            : <>
                <strong className="text-white">{total} thing{total === 1 ? "" : "s"} for you today</strong>
                {u > 0 ? <> — <strong className="text-[var(--oxblood)]">{u} urgent</strong></> : null}.
              </>}
        </>
      ),
    },
    ops: {
      hero: "ops · system health view",
      subhero: ({ total, urgent: u }) => (
        <>
          <strong className="text-white">{total} ops item{total === 1 ? "" : "s"}</strong> open
          {u > 0 ? <> — <strong className="text-[var(--oxblood)]">{u} urgent</strong></> : null}.
        </>
      ),
    },
    viewer: {
      hero: "viewer · read-only",
      subhero: () => <>Read-only access. Actions are disabled for this role.</>,
    },
  };

  const heroCopy = tierCopy[scope.tier];

  const openWorkItemDetail = useCallback((item: HomeDetailItem) => {
    if (!mobileDetailEnabled) return;
    setSelectedWorkItem(item);
    setDetailOpen(true);
  }, [mobileDetailEnabled]);

  const handleDetailOpenChange = useCallback((open: boolean) => {
    setDetailOpen(open);
    if (!open) {
      setSelectedWorkItem(null);
    }
  }, []);

  return (
    <AppShell
      activeItem="Home"
      memberName={props.operatorName}
      memberRole={props.operatorRole}
      operatorRole={props.operatorRole}
      notificationCount={totalQueue}
      notificationHref="/queue"
      title="Home"
      tone="dashboardDark"
      workspaceId={props.workspaceId}
      workspaceName={props.workspaceName}
    >
      <main className="mx-auto w-full max-w-full overflow-x-hidden px-3 py-5 sm:px-5 md:max-w-[1200px] md:px-10 md:py-10">
        {/* Header */}
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-3 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/48">
              <span className="inline-flex items-center gap-2">
                <HarwickMark size={14} tone="soft" />
                {heroCopy.hero}
              </span>
              <span className="size-1 rounded-full bg-white/20" aria-hidden="true" />
              <span className="font-mono normal-case tracking-[0.04em] text-white/40">
                {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
              </span>
            </div>
            <h1 className="font-display text-[28px] font-semibold leading-[1.02] tracking-[-0.025em] text-white md:text-[44px]">
              {greetingFor(new Date())}, {firstName.toLowerCase()}<span className="italic text-white/40">.</span>
            </h1>
            <p className="mt-2 text-[13.5px] leading-6 text-white/64">
              {heroCopy.subhero({ total: totalQueue, urgent })}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {urgent > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.025] px-2.5 py-1 text-[11px] font-medium text-white/72">
                <span className="size-1.5 rounded-full bg-[var(--oxblood)]" aria-hidden="true" />
                {urgent} hot
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.025] px-2.5 py-1 text-[11px] font-medium text-white/72">
              <span className="size-1.5 rounded-full bg-[var(--sage)]" aria-hidden="true" />
              {totalQueue} queued
            </span>
          </div>
        </header>

        {status === null ? null : (
          <div className="mb-4 rounded-[10px] border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-[12px] text-white/82">
            {status}
          </div>
        )}

        {/* Tier 1: Needs you */}
        <section className="mb-8">
          <SectionHead
            dot="bg-[var(--oxblood)]"
            title={scope.tier === "agent" || scope.tier === "viewer" ? `Your queue · ${totalQueue}` : `Needs you · ${totalQueue}`}
            trailing={
              <a href="/queue" className={linkBtn}>
                Open full queue
                <ArrowRight className="size-3" aria-hidden="true" />
              </a>
            }
          />
          {myQueue.length === 0 ? (
            <div className={cn("px-5 py-12 text-center", cardBase)}>
              <div className="mx-auto mb-3 flex size-9 items-center justify-center rounded-[10px] border border-white/[0.08] bg-white/[0.03]">
                <Flame className="size-4 text-[var(--sage)]" aria-hidden="true" />
              </div>
              <p className="text-[15px] font-medium text-white">Inbox zero.</p>
              <p className="mt-1 text-[12.5px] text-white/56">
                {scope.tier === "agent"
                  ? "No drafts, voice handoffs, or showings on you right now."
                  : "Harwick is holding everything else without you."}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {myQueue.slice(0, 6).map((item, index) => (
                <motion.div
                  key={`${item.kind}-${index}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.32, delay: index * 0.05, ease: "easeOut" }}
                >
                  <QueueActionCard
                    item={item}
                    enabled={enabled}
                    onRefresh={refresh}
                    onStatus={setStatus}
                    {...(mobileDetailEnabled ? { onOpenDetail: openWorkItemDetail } : {})}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </section>

        {/* Tier 2: layout per tier */}
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="space-y-6">
            {/* Routing desk is the team-lead/owner decision surface — assign
              * each pending lead to the right agent. This replaces the old
              * "Team approvals" pane which duplicated the main queue. */}
            {showRouting(scope) ? (
              <section>
                <SectionHead
                  dot="bg-[var(--clay)]"
                  title={`Routing desk · ${myRouting.length} pending`}
                  trailing={
                    <a href="/queue" className={linkBtn}>
                      Open routing
                      <ArrowRight className="size-3" aria-hidden="true" />
                    </a>
                  }
                />
                {myRouting.length === 0 ? (
                  <div className={cn("px-4 py-6 text-center text-[12.5px] text-white/52", cardBase)}>
                    No routing calls right now — every active lead has an owner.
                  </div>
                ) : (
                  <div className={cn("overflow-hidden", cardBase)}>
                    {myRouting.slice(0, 4).map((item) => <RoutingRow key={item.leadId} item={item} enabled={enabled} />)}
                  </div>
                )}
              </section>
            ) : null}

            <section>
              <SectionHead
                dot="bg-[var(--oxblood)]"
                title={scope.tier === "agent" || scope.tier === "viewer" ? "Your hot leads" : "Hot leads"}
                trailing={
                  <a href="/leads" className={linkBtn}>
                    All leads
                    <ArrowRight className="size-3" aria-hidden="true" />
                  </a>
                }
              />
              <div className={cn("overflow-hidden", cardBase)}>
                {hotLeads.length === 0 ? (
                  <div className="px-4 py-6 text-center text-[12.5px] text-white/52">
                    {scope.tier === "agent" ? "No hot leads assigned to you." : "No hot leads in the last cycle."}
                  </div>
                ) : (
                  hotLeads.map((lead) => (
                    <HotLeadRow
                      key={lead.id}
                      lead={lead}
                      {...(mobileDetailEnabled ? { onOpenDetail: openWorkItemDetail } : {})}
                    />
                  ))
                )}
              </div>
            </section>
          </div>

          <div className="space-y-6">
            {scope.tier !== "ops" ? (
              <SchedulePane items={ownerQueue} />
            ) : null}

            {showTeamPane(scope) && team.length > 0 ? (
              <section>
                <SectionHead
                  dot="bg-[var(--sage)]"
                  title="Team workload"
                  trailing={
                    <a href="/team" className={linkBtn}>
                      Open team
                      <ArrowRight className="size-3" aria-hidden="true" />
                    </a>
                  }
                />
                <div className={cn("overflow-hidden", cardBase)}>
                  {team.slice(0, 5).map((member) => <WorkloadRow key={member.id} member={member} />)}
                </div>
              </section>
            ) : null}

            <section>
              <SectionHead dot="bg-[var(--sage)]" title="What Harwick noticed" />
              <div className={cn("overflow-hidden", cardBase)}>
                {insights.map((insight, index) => (
                  <InsightCard key={index} insight={insight} />
                ))}
              </div>
            </section>
          </div>
        </div>

        {showOpsHealth(scope) ? (
          <section className="mt-8">
            <SectionHead dot="bg-[var(--sage)]" title="System" />
            <div className={cn("flex flex-wrap gap-2 p-3", cardBase)}>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11.5px] text-white/86">
                <span className="size-1.5 rounded-full bg-[var(--sage)]" aria-hidden="true" />
                Inbound webhooks
                <span className="font-mono text-[10.5px] text-white/40">healthy</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11.5px] text-white/86">
                <span className="size-1.5 rounded-full bg-[var(--sage)]" aria-hidden="true" />
                FUB sync
                <span className="font-mono text-[10.5px] text-white/40">current</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11.5px] text-white/86">
                <span className="size-1.5 rounded-full bg-[var(--sage)]" aria-hidden="true" />
                Voice runtime
                <span className="font-mono text-[10.5px] text-white/40">p50 0.6s</span>
              </span>
              <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11.5px] text-white/52">
                <ShieldCheck className="size-3" aria-hidden="true" />
                {scope.tier === "ops" ? "Ops view" : "Owner view"}
              </span>
            </div>
            {scope.tier === "ops" ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className={cn("p-3", cardBase)}>
                  <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.1em] text-white/52">
                    <Users className="size-3" aria-hidden="true" />
                    Voice deflection
                  </div>
                  <div className="text-[15px] font-semibold text-white">11 / 12</div>
                  <p className="text-[11.5px] text-white/52">handled without handoff this week (p50 0.6s)</p>
                </div>
                <div className={cn("p-3", cardBase)}>
                  <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.1em] text-white/52">
                    <ShieldCheck className="size-3" aria-hidden="true" />
                    Auto-send guardrail
                  </div>
                  <div className="text-[15px] font-semibold text-white">0 violations</div>
                  <p className="text-[11.5px] text-white/52">no policy breaches in the last 24h</p>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}
        <LeadDetailDrawer
          item={selectedWorkItem}
          open={detailOpen}
          enabled={enabled}
          onOpenChange={handleDetailOpenChange}
          onRefresh={refresh}
          onStatus={setStatus}
        />
      </main>
    </AppShell>
  );
}
