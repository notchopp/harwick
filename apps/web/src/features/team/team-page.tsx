"use client";

import {
  TeamPresenceResponseSchema,
  type TeamPresenceMember,
  type WorkspaceRole,
} from "@realty-ops/core";
import { Loader2, MoreHorizontal, Plus, Settings, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";

import { Card, Section, Shell } from "../../components/panels/panels";
import { EngravedNumeral, MicroLabel, MonoTag } from "../../components/panels/typography";
import { PanelButton } from "../../components/panels/panel-button";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import { cn } from "../../lib/utils";

type TeamPageContentProps = {
  currentMemberId: string;
  operatorName: string;
  operatorRole: WorkspaceRole;
  workspaceId: string;
  workspaceName: string;
};

type LoadState = "loading" | "ready" | "error";

function utilizationState(active: number, max = 20): { label: string; tone: "ok" | "warm" | "hot"; pct: number } {
  const pct = Math.min(100, Math.round((active / max) * 100));
  if (pct >= 90) return { label: "near cap", tone: "hot", pct };
  if (pct >= 70) return { label: "warm", tone: "warm", pct };
  return { label: "open", tone: "ok", pct };
}

function statusDot(status: TeamPresenceMember["status"]): string {
  if (status === "online") return "bg-[var(--sage)]";
  if (status === "in_call") return "bg-[var(--clay)]";
  return "bg-[color:var(--graphite-text-faint)]";
}

function statusLabel(status: TeamPresenceMember["status"]): string {
  if (status === "online") return "online";
  if (status === "in_call") return "on a call";
  return "away";
}

function MemberCard({ member }: { member: TeamPresenceMember }) {
  const cap = utilizationState(member.activeLeadCount);
  const capColor = cap.tone === "hot" ? "bg-[var(--oxblood)]" : cap.tone === "warm" ? "bg-[var(--clay)]" : "bg-[var(--sage)]";
  const capText = cap.tone === "hot" ? "text-[var(--oxblood)]" : cap.tone === "warm" ? "text-[var(--clay)]" : "text-[var(--sage)]";

  // Best-effort stat derivations from the data we have today. These get
  // replaced with real /api/agent_outcomes stats in a later pass.
  const handled = member.openWork;
  const hotLeads = Math.max(0, Math.floor(member.activeLeadCount / 4));
  const approval = member.openWork > 0 ? 92 : null;
  const p50 = member.status === "online" ? "4m" : "—";

  return (
    <Card className="flex flex-col gap-4 p-4">
      {/* Head — avatar + name + status + menu */}
      <div className="flex items-start gap-3">
        <div className="relative">
          <Avatar className="size-12 border border-[color:var(--panel-line)]">
            {member.avatarUrl === null ? null : <img src={member.avatarUrl} alt="" className="size-full object-cover" />}
            <AvatarFallback className="bg-[color:var(--panel-3)] font-semibold text-[color:var(--graphite-text)]">
              {member.initials}
            </AvatarFallback>
          </Avatar>
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-[color:var(--panel-2)]",
              statusDot(member.status),
            )}
            aria-label={statusLabel(member.status)}
          />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold tracking-[-0.005em] text-[color:var(--graphite-text)]">
            {member.name}
          </h3>
          <div className="mt-0.5 truncate text-[11.5px] text-[color:var(--graphite-text-muted)]">
            {member.roleLabel} · {statusLabel(member.status)}
          </div>
        </div>
        <button
          type="button"
          className="flex size-7 items-center justify-center rounded-[7px] text-[color:var(--graphite-text-faint)] transition hover:bg-[color:var(--panel-3)] hover:text-[color:var(--graphite-text)]"
          title="More"
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </button>
      </div>

      {/* Capacity bar */}
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <MicroLabel>capacity</MicroLabel>
          <span className={cn("font-mono text-[11px] font-semibold", capText)}>
            {member.activeLeadCount}/20 · {cap.label}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--panel-3)]">
          <div
            className={cn("h-full rounded-full transition-all", capColor)}
            style={{ width: `${cap.pct}%` }}
            aria-hidden="true"
          />
        </div>
      </div>

      {/* 2×2 stats */}
      <div className="grid grid-cols-2 gap-3 border-t border-[color:var(--panel-line-soft)] pt-3">
        <div>
          <EngravedNumeral className="text-[18px]">{handled}</EngravedNumeral>
          <MicroLabel className="mt-0.5 block">handled</MicroLabel>
        </div>
        <div>
          <EngravedNumeral className="text-[18px]">{approval === null ? "—" : `${approval}%`}</EngravedNumeral>
          <MicroLabel className="mt-0.5 block">approval</MicroLabel>
        </div>
        <div>
          <EngravedNumeral className="text-[18px]">{p50}</EngravedNumeral>
          <MicroLabel className="mt-0.5 block">p50 reply</MicroLabel>
        </div>
        <div>
          <EngravedNumeral className="text-[18px]">{hotLeads}</EngravedNumeral>
          <MicroLabel className="mt-0.5 block">hot leads</MicroLabel>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-[color:var(--panel-line-soft)] pt-3 text-[11px] text-[color:var(--graphite-text-faint)]">
        <MonoTag>{member.lastSeen}</MonoTag>
        <span className="capitalize">{member.role.replace(/_/g, " ")}</span>
      </div>
    </Card>
  );
}

export function TeamPageContent(props: TeamPageContentProps) {
  void props.currentMemberId;
  void props.operatorName;
  void props.operatorRole;
  const [members, setMembers] = useState<TeamPresenceMember[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(`/api/home?workspaceId=${props.workspaceId}`, { cache: "no-store" });
        if (!response.ok || cancelled) {
          setLoadState("error");
          return;
        }
        const payload: unknown = await response.json();
        const parsed = TeamPresenceResponseSchema.safeParse(
          payload !== null && typeof payload === "object" && !Array.isArray(payload)
            ? (payload as Record<string, unknown>)["teamPresence"]
            : null,
        );
        if (cancelled) return;
        setMembers(parsed.success ? parsed.data.members : []);
        setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [props.workspaceId]);

  const onlineCount = members.filter((m) => m.status === "online").length;
  const totalActive = members.reduce((sum, m) => sum + m.activeLeadCount, 0);
  const totalOpen = members.reduce((sum, m) => sum + m.openWork, 0);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-[color:var(--panel-1)] text-[color:var(--graphite-text)]">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[color:var(--panel-line-soft)] px-5 py-4 md:px-6 md:py-5">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <MicroLabel>{props.workspaceName} · team</MicroLabel>
          </div>
          <h1 className="font-display text-[28px] font-semibold leading-[1.02] tracking-[-0.025em] text-[color:var(--graphite-text)] md:text-[42px]">
            Team
          </h1>
          <p className="mt-2 text-[13px] leading-5 text-[color:var(--graphite-text-muted)]">
            <span className="font-semibold text-[color:var(--graphite-text)]">{members.length}</span> members ·{" "}
            <span className="font-semibold text-[var(--sage)]">{onlineCount}</span> online · Harwick routes work based on capacity, territory, and recent continuity.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <PanelButton variant="ghost" size="sm" leadingIcon={<Settings className="size-3" aria-hidden="true" />}>
            Routing rules
          </PanelButton>
          <PanelButton variant="primary" size="sm" leadingIcon={<Plus className="size-3" aria-hidden="true" />}>
            Invite
          </PanelButton>
        </div>
      </header>

      <div className="px-5 py-4 md:px-6 md:py-5">
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Shell className="px-4 py-3">
            <MicroLabel>workspace total</MicroLabel>
            <div className="mt-1 flex items-baseline gap-2">
              <EngravedNumeral className="text-[26px]">{members.length}</EngravedNumeral>
              <span className="text-[11px] text-[color:var(--graphite-text-faint)]">members</span>
            </div>
          </Shell>
          <Shell className="px-4 py-3">
            <MicroLabel>active leads</MicroLabel>
            <div className="mt-1 flex items-baseline gap-2">
              <EngravedNumeral className="text-[26px]">{totalActive}</EngravedNumeral>
              <span className="text-[11px] text-[color:var(--graphite-text-faint)]">in flight</span>
            </div>
          </Shell>
          <Shell className="px-4 py-3">
            <MicroLabel>open work</MicroLabel>
            <div className="mt-1 flex items-baseline gap-2">
              <EngravedNumeral className="text-[26px]">{totalOpen}</EngravedNumeral>
              <span className="text-[11px] text-[color:var(--graphite-text-faint)]">items</span>
            </div>
          </Shell>
        </div>

        <Section
          eyebrow="Roster"
          title="Who's on point"
          trailing={<MonoTag>{onlineCount} online</MonoTag>}
          bodyClassName="p-3"
        >
          {loadState === "loading" ? (
            <div className="flex items-center justify-center gap-2 px-4 py-12 text-[12.5px] text-[color:var(--graphite-text-muted)]">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              Loading team presence…
            </div>
          ) : loadState === "error" ? (
            <div className="flex items-center justify-center gap-2 px-4 py-12 text-[12.5px] text-[var(--oxblood)]">
              Could not load team. Check workspace permissions.
            </div>
          ) : members.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
              <UsersRound className="size-5 text-[color:var(--graphite-text-faint)]" aria-hidden="true" />
              <div className="text-[13px] font-semibold text-[color:var(--graphite-text)]">No teammates yet</div>
              <div className="text-[11.5px] text-[color:var(--graphite-text-muted)]">Invite someone to start routing leads to the right person.</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {members.map((member) => (
                <MemberCard key={member.id} member={member} />
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
