"use client";

import type { HarwickResponseCard } from "@realty-ops/core";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Check,
  GitBranch,
  ListFilter,
  MessageSquare,
  ShieldCheck,
  Users,
} from "lucide-react";

import { cn } from "../../lib/utils";

function CardShell({ title, summary, icon: Icon, children }: {
  title: string;
  summary?: string | null;
  icon: typeof Calendar;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[12px] border border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-white/[0.012] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_4px_12px_-6px_rgba(0,0,0,0.45)]">
      <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.02] px-3 py-2">
        <Icon className="size-3.5 text-white/64" aria-hidden="true" strokeWidth={2} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11.5px] font-semibold uppercase tracking-[0.08em] text-white/72">{title}</div>
          {summary === null || summary === undefined ? null : (
            <div className="truncate text-[10.5px] text-white/52">{summary}</div>
          )}
        </div>
      </div>
      <div className="p-2.5">{children}</div>
    </div>
  );
}

function ActionLink({ label, href, intent }: { label: string; href?: string | undefined; intent: "primary" | "ghost" | "danger" }) {
  const cls = intent === "primary"
    ? "border border-[var(--sage)]/40 bg-[var(--sage-soft)] text-[var(--sage)] hover:bg-[var(--sage-soft)]/80"
    : intent === "danger"
      ? "border border-[var(--oxblood)]/40 bg-[var(--oxblood-soft)] text-[var(--oxblood)] hover:bg-[var(--oxblood-soft)]/80"
      : "border border-white/[0.08] bg-white/[0.025] text-white/72 hover:border-white/[0.16] hover:bg-white/[0.05] hover:text-white";
  return (
    <a
      href={href ?? "#"}
      className={cn("inline-flex items-center gap-1 rounded-[7px] px-2 py-1 text-[11px] font-medium transition", cls)}
    >
      {label}
      {intent === "primary" ? <ArrowRight className="size-3" aria-hidden="true" /> : null}
    </a>
  );
}

function LeadListCard({ card }: { card: Extract<HarwickResponseCard, { kind: "lead-list" }> }) {
  return (
    <CardShell title={card.title} summary={card.summary} icon={ListFilter}>
      <ul className="grid gap-1.5">
        {card.items.map((item, idx) => (
          <li
            key={`${item.leadId ?? item.name}-${idx}`}
            className="rounded-[8px] border border-white/[0.06] bg-white/[0.02] p-2 transition hover:border-white/[0.12] hover:bg-white/[0.04]"
          >
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-semibold text-white">{item.name}</div>
                <div className="mt-0.5 truncate text-[11px] text-white/60">{item.reason}</div>
              </div>
              <span className="shrink-0 rounded-full bg-white/[0.05] px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-white/56">
                {item.status}
              </span>
            </div>
            {item.actions.length === 0 ? null : (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {item.actions.map((action, actionIdx) => (
                  <ActionLink key={`${action.label}-${actionIdx}`} label={action.label} href={action.href} intent={action.intent} />
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </CardShell>
  );
}

function CalendarDayCard({ card }: { card: Extract<HarwickResponseCard, { kind: "calendar-day" }> }) {
  return (
    <CardShell title={`${card.title} · ${card.dateLabel}`} icon={Calendar}>
      {card.slots.length === 0 ? (
        <p className="px-1 py-1 text-[11.5px] text-white/56">{card.emptyMessage ?? "No events scheduled."}</p>
      ) : (
        <ul className="grid gap-1.5">
          {card.slots.map((slot, idx) => {
            const tone = slot.tone === "confirmed"
              ? "border-[var(--sage)]/30 bg-[var(--sage)]/8"
              : slot.tone === "pending"
                ? "border-[var(--clay)]/30 bg-[var(--clay)]/8"
                : "border-[var(--oxblood)]/30 bg-[var(--oxblood)]/8";
            const time = new Date(slot.startIso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
            return (
              <li key={`${slot.startIso}-${idx}`} className={cn("rounded-[8px] border p-2", tone)}>
                <div className="flex items-center justify-between gap-2">
                  <div className="font-mono text-[11px] text-white/72">{time}</div>
                  <div className="text-[10px] uppercase tracking-[0.1em] text-white/52">{slot.tone}</div>
                </div>
                <div className="mt-0.5 truncate text-[12.5px] font-semibold text-white">{slot.title}</div>
                {slot.detail === null ? null : (
                  <div className="truncate text-[11px] text-white/56">{slot.detail}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </CardShell>
  );
}

function RoutingDecisionsCard({ card }: { card: Extract<HarwickResponseCard, { kind: "routing-decisions" }> }) {
  return (
    <CardShell title={card.title} icon={GitBranch}>
      <ul className="grid gap-1.5">
        {card.items.map((item, idx) => (
          <li
            key={`${item.leadId ?? item.leadName}-${idx}`}
            className="rounded-[8px] border border-white/[0.06] bg-white/[0.02] p-2"
          >
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-semibold text-white">{item.leadName}</div>
                <div className="mt-0.5 truncate text-[11px] text-white/64">
                  → {item.toMember}
                  {item.fromMember === null ? null : <span className="text-white/40"> (from {item.fromMember})</span>}
                </div>
              </div>
              {item.requiresApproval ? (
                <span className="shrink-0 rounded-full bg-[var(--clay)]/15 px-1.5 py-0.5 text-[9.5px] uppercase tracking-[0.08em] text-[var(--clay)]">
                  approval
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-[var(--sage)]/15 px-1.5 py-0.5 text-[9.5px] uppercase tracking-[0.08em] text-[var(--sage)]">
                  ready
                </span>
              )}
            </div>
            <div className="mt-1 text-[11px] leading-4.5 text-white/60">{item.reason}</div>
            {item.leadId === null ? null : (
              <div className="mt-1.5">
                <ActionLink label="Open lead" href={`/leads?leadId=${item.leadId}`} intent="primary" />
              </div>
            )}
          </li>
        ))}
      </ul>
    </CardShell>
  );
}

function DraftReplyCard({ card }: { card: Extract<HarwickResponseCard, { kind: "draft-reply" }> }) {
  return (
    <CardShell title={card.title} summary={`${card.draft.leadName} · ${card.draft.channel}`} icon={MessageSquare}>
      <div className="rounded-[8px] border border-white/[0.08] bg-white/[0.025] p-2.5">
        <p className="text-[12.5px] italic leading-5 text-white/92">&ldquo;{card.draft.body}&rdquo;</p>
        {card.draft.rationale === null ? null : (
          <p className="mt-1.5 text-[10.5px] uppercase tracking-[0.08em] text-white/48">{card.draft.rationale}</p>
        )}
      </div>
      {card.actions.length === 0 ? null : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {card.actions.map((action, idx) => (
            <ActionLink key={`${action.label}-${idx}`} label={action.label} href={action.href} intent={action.intent} />
          ))}
        </div>
      )}
    </CardShell>
  );
}

function TeamStatusCard({ card }: { card: Extract<HarwickResponseCard, { kind: "team-status" }> }) {
  return (
    <CardShell title={card.title} icon={Users}>
      <ul className="grid gap-1">
        {card.members.map((member) => {
          const dot = member.status === "online" ? "bg-[var(--sage)]" : member.status === "away" ? "bg-[var(--clay)]" : "bg-white/[0.18]";
          return (
            <li key={member.memberId} className="flex items-center gap-2 rounded-[7px] px-2 py-1.5 transition hover:bg-white/[0.025]">
              <span className={cn("size-1.5 shrink-0 rounded-full", dot)} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-semibold text-white">{member.name}</div>
                <div className="truncate text-[10.5px] text-white/52">{member.role}</div>
              </div>
              <div className="shrink-0 font-mono text-[10.5px] text-white/56">{member.openWork} open</div>
            </li>
          );
        })}
      </ul>
    </CardShell>
  );
}

function ApprovalsCard({ card }: { card: Extract<HarwickResponseCard, { kind: "approvals" }> }) {
  return (
    <CardShell title={card.title} icon={ShieldCheck}>
      <ul className="grid gap-1.5">
        {card.items.map((item, idx) => (
          <li key={`${item.tool}-${idx}`} className="rounded-[8px] border border-[var(--clay)]/25 bg-[var(--clay)]/8 p-2">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="size-3 text-[var(--clay)]" aria-hidden="true" />
              <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-[var(--clay)]">{item.tool.replace(/_/g, " ")}</span>
            </div>
            <p className="mt-1 text-[11.5px] leading-4.5 text-white/82">{item.summary}</p>
            {item.payloadPreview === null ? null : (
              <p className="mt-0.5 truncate text-[10.5px] font-mono text-white/48">{item.payloadPreview}</p>
            )}
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <ActionLink label="Approve" intent="primary" />
              <ActionLink label="Dismiss" intent="ghost" />
            </div>
          </li>
        ))}
      </ul>
    </CardShell>
  );
}

export function ResponseCard({ card }: { card: HarwickResponseCard }) {
  if (card.kind === "lead-list") return <LeadListCard card={card} />;
  if (card.kind === "calendar-day") return <CalendarDayCard card={card} />;
  if (card.kind === "routing-decisions") return <RoutingDecisionsCard card={card} />;
  if (card.kind === "draft-reply") return <DraftReplyCard card={card} />;
  if (card.kind === "team-status") return <TeamStatusCard card={card} />;
  if (card.kind === "approvals") return <ApprovalsCard card={card} />;
  return null;
}

export function ToolCallBadge({ tool, status, reason }: { tool: string; status: "running" | "completed" | "queued"; reason?: string }) {
  const styles = status === "completed"
    ? "border-[var(--sage)]/30 bg-[var(--sage)]/8 text-[var(--sage)]"
    : status === "queued"
      ? "border-[var(--clay)]/30 bg-[var(--clay)]/8 text-[var(--clay)]"
      : "border-white/[0.1] bg-white/[0.025] text-white/72";
  const icon = status === "completed" ? <Check className="size-2.5" aria-hidden="true" /> : status === "queued" ? <AlertTriangle className="size-2.5" aria-hidden="true" /> : <span className="size-1.5 animate-pulse rounded-full bg-white/72" aria-hidden="true" />;

  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium", styles)} title={reason}>
      {icon}
      <span className="font-mono uppercase tracking-[0.08em]">{tool.replace(/_/g, " ")}</span>
    </span>
  );
}
