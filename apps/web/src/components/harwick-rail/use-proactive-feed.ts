"use client";

import {
  ConversationsInboxResponseSchema,
  FollowUpBossConflictQueueResponseSchema,
  OperationsFailureQueueResponseSchema,
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
import { useCallback, useEffect, useState } from "react";

export type ProactiveKind = "alert" | "insight" | "routing" | "draft" | "prep" | "trend";

export type ProactiveAction = {
  label: string;
  href?: string;
};

export type ProactiveCard = {
  id: string;
  kind: ProactiveKind;
  title: string;
  body: string;
  badge?: string | null;
  actions: ProactiveAction[];
};

export type ProactiveFeedState = {
  cards: ProactiveCard[];
  team: TeamPresenceMember[];
  loaded: boolean;
  refresh: () => Promise<void>;
};

type Tier = "owner" | "lead" | "agent" | "ops";

function toTier(role: WorkspaceRole): Tier {
  if (role === "owner" || role === "admin") return "owner";
  if (role === "team_lead" || role === "lead_manager") return "lead";
  if (role === "operator") return "ops";
  return "agent";
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function minutesSince(iso: string | null): number | null {
  if (iso === null) return null;
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  return Math.floor((Date.now() - parsed) / 60_000);
}

function buildCards(params: {
  tier: Tier;
  ownerQueue: OwnerHomeQueueItem[];
  routing: RoutingDeskItem[];
  recentLeads: RecentLeadItem[];
  fubConflictCount: number;
  operationsFailureCount: number;
  conversationCount: number;
  threadsWithDrafts: number;
  staleConversations: ConversationInboxThread[];
  unrespondedHotLeads: RecentLeadItem[];
  team: TeamPresenceMember[];
}): ProactiveCard[] {
  const cards: ProactiveCard[] = [];

  const urgent = params.ownerQueue.filter((item) => item.priority === "urgent");
  if (urgent.length > 0) {
    cards.push({
      id: "urgent-queue",
      kind: "alert",
      title: `${urgent.length} urgent item${urgent.length === 1 ? "" : "s"} blocking work`,
      body: urgent
        .slice(0, 3)
        .map((item) => item.title)
        .join(" · "),
      badge: "urgent",
      actions: [
        { label: "Open queue", href: "/queue" },
      ],
    });
  }

  if (params.fubConflictCount > 0) {
    cards.push({
      id: "fub-conflicts",
      kind: "alert",
      title: `${params.fubConflictCount} FUB sync conflict${params.fubConflictCount === 1 ? "" : "s"}`,
      body: "Follow Up Boss back-sync has at least one record that needs reconciliation before automation continues.",
      badge: "blocked",
      actions: [{ label: "Open conflicts", href: "/queue" }],
    });
  }

  if (params.operationsFailureCount > 0) {
    cards.push({
      id: "ops-failures",
      kind: "alert",
      title: `${params.operationsFailureCount} workflow failure${params.operationsFailureCount === 1 ? "" : "s"}`,
      body: "Background jobs or provider syncs need retry. Harwick can replay the safe ones once you approve.",
      badge: "ops",
      actions: [{ label: "Review failures", href: "/queue" }],
    });
  }

  const routingPending = params.routing.filter((item) => item.decision.status !== "assigned");
  if (routingPending.length > 0 && (params.tier === "lead" || params.tier === "owner" || params.tier === "ops")) {
    const top = routingPending[0];
    cards.push({
      id: "routing-pending",
      kind: "routing",
      title: `${routingPending.length} routing decision${routingPending.length === 1 ? "" : "s"} waiting`,
      body: top === undefined
        ? "Harwick has suggestions ready for each pending lead."
        : `Next up: ${top.leadName} → ${top.decision.assignedDisplayName ?? "needs an owner"}. ${top.decision.reasons[0] ?? ""}`,
      badge: "routing",
      actions: [
        { label: "Open routing", href: "/queue" },
      ],
    });
  }

  if (params.threadsWithDrafts > 0) {
    cards.push({
      id: "drafts-pending",
      kind: "draft",
      title: `${params.threadsWithDrafts} AI draft${params.threadsWithDrafts === 1 ? "" : "s"} pending approval`,
      body: "Harwick prepared replies that are waiting on a human nod before they ship.",
      actions: [
        { label: "Review drafts", href: "/conversations" },
      ],
    });
  }

  if (params.staleConversations.length > 0) {
    const oldest = params.staleConversations[0];
    cards.push({
      id: "stale-conversations",
      kind: "alert",
      title: `${params.staleConversations.length} conversation${params.staleConversations.length === 1 ? "" : "s"} need a reply`,
      body: oldest === undefined
        ? "Inbound DMs are sitting longer than the latency target."
        : `Oldest: ${oldest.name} via ${oldest.sourceLabel} ${oldest.channelLabel} — last touched ${oldest.lastTouchLabel}.`,
      badge: "latency",
      actions: [{ label: "Open conversations", href: "/conversations" }],
    });
  }

  if (params.unrespondedHotLeads.length > 0) {
    const top = params.unrespondedHotLeads[0];
    cards.push({
      id: "hot-leads",
      kind: "trend",
      title: `${params.unrespondedHotLeads.length} hot lead${params.unrespondedHotLeads.length === 1 ? "" : "s"} sitting`,
      body: top === undefined
        ? "Recently captured leads in qualified/new without a touch in the last cycle."
        : `${top.name} (${top.sourceLabel}) — ${top.lastTouchLabel}. Convert before this signal cools.`,
      actions: [{ label: "Open leads", href: "/leads" }],
    });
  }

  const overCapacity = params.team.filter((member) => member.activeLeadCount >= 18);
  if (overCapacity.length > 0 && (params.tier === "lead" || params.tier === "owner")) {
    const top = overCapacity[0];
    cards.push({
      id: "capacity",
      kind: "routing",
      title: `${overCapacity.length} teammate${overCapacity.length === 1 ? "" : "s"} near capacity`,
      body: top === undefined
        ? "Workload distribution is skewed. Consider rebalancing before the next intake."
        : `${top.name} is carrying ${top.activeLeadCount} active leads. Lighter teammates available.`,
      actions: [{ label: "Open team", href: "/team" }],
    });
  }

  if (cards.length === 0) {
    cards.push({
      id: "calm",
      kind: "insight",
      title: "Harwick is keeping it quiet",
      body: "No urgent signals across queue, routing, conversations, or sync. I'll surface the next thing that needs you.",
      actions: [{ label: "Open queue", href: "/queue" }],
    });
  }

  return cards;
}

export function useProactiveFeed(workspaceId: string, role: WorkspaceRole): ProactiveFeedState {
  const [cards, setCards] = useState<ProactiveCard[]>([]);
  const [team, setTeam] = useState<TeamPresenceMember[]>([]);
  const [loaded, setLoaded] = useState(false);
  const tier = toTier(role);

  const refresh = useCallback(async () => {
    try {
      const [homeRes, ownerRes] = await Promise.all([
        fetch(`/api/home?workspaceId=${workspaceId}`, { cache: "no-store" }),
        fetch(`/api/home/owner-queue?workspaceId=${workspaceId}`, { cache: "no-store" }),
      ]);

      if (!homeRes.ok) {
        setLoaded(true);
        return;
      }

      const home = readObject(await homeRes.json());
      if (home === null) {
        setLoaded(true);
        return;
      }

      const ownerPayload = ownerRes.ok ? readObject(await ownerRes.json()) : null;
      const ownerParsed = OwnerHomeQueueResponseSchema.safeParse(ownerPayload);
      const ownerQueue = ownerParsed.success ? ownerParsed.data.items : [];

      const routingParsed = RoutingDeskResponseSchema.safeParse(home["routingDesk"]);
      const routing = routingParsed.success ? routingParsed.data.items : [];

      const recentParsed = RecentLeadsResponseSchema.safeParse(home["recentLeads"]);
      const recentLeads = recentParsed.success ? recentParsed.data.items : [];

      const fubParsed = FollowUpBossConflictQueueResponseSchema.safeParse(home["fubConflicts"]);
      const fubConflictCount = fubParsed.success ? fubParsed.data.items.length : 0;

      const opsParsed = OperationsFailureQueueResponseSchema.safeParse(home["operationsFailures"]);
      const operationsFailureCount = opsParsed.success ? opsParsed.data.items.length : 0;

      const conversationsParsed = ConversationsInboxResponseSchema.safeParse(home["conversations"]);
      const conversations = conversationsParsed.success ? conversationsParsed.data.threads : [];

      const teamParsed = TeamPresenceResponseSchema.safeParse(home["teamPresence"]);
      const teamMembers = teamParsed.success ? teamParsed.data.members : [];

      const threadsWithDrafts = conversations.filter((thread) =>
        thread.messages.some((message) => message.kind === "ai_action"),
      ).length;

      const staleConversations = conversations
        .filter((thread) => {
          if (thread.messages.length === 0) return false;
          const last = thread.messages[thread.messages.length - 1];
          if (last === undefined || last.kind === "sent") return false;
          const since = minutesSince(last.occurredAt);
          return since !== null && since > 30;
        })
        .sort((a, b) => {
          const aLast = a.messages[a.messages.length - 1]?.occurredAt ?? "";
          const bLast = b.messages[b.messages.length - 1]?.occurredAt ?? "";
          return Date.parse(aLast) - Date.parse(bLast);
        });

      const unrespondedHotLeads = recentLeads.filter((lead) => {
        const since = minutesSince(lead.lastTouchAt);
        return (lead.stage === "new" || lead.stage === "qualified") && (since === null || since > 60);
      });

      const nextCards = buildCards({
        tier,
        ownerQueue,
        routing,
        recentLeads,
        fubConflictCount,
        operationsFailureCount,
        conversationCount: conversations.length,
        threadsWithDrafts,
        staleConversations,
        unrespondedHotLeads,
        team: teamMembers,
      });

      setTeam(teamMembers);
      setCards(nextCards);
      setLoaded(true);
    } catch {
      setLoaded(true);
    }
  }, [tier, workspaceId]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    }, 60_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  return { cards, team, loaded, refresh };
}
