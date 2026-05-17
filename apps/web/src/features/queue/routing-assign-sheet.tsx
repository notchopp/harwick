"use client";

import { Bot, Check, CircleAlert, Loader2, MapPin, User, Users2, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Drawer } from "vaul";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../../components/ui/sheet";
import { useIsMobile } from "../../hooks/use-mobile";
import { cn } from "../../lib/utils";

type Recommendation = {
  status: "assigned" | "unrouted" | "hold_for_qualification";
  assignedMemberId: string | null;
  assignedDisplayName: string | null;
  matchScore: number;
  taskLabel: string;
  reasons: string[];
};

type AgentOption = {
  memberId: string;
  displayName: string;
  role: string;
  activeLeadCount: number;
  maxActiveLeads: number;
  areas: string[];
  propertyTypes: string[];
  leadTypes: string[];
  calendarStatus: "connected" | "unknown" | "missing";
  acceptsNewLeads: boolean;
  atCapacity: boolean;
};

type RoutingContextResponse = {
  lead: {
    id: string;
    fullName: string | null;
    leadType: string;
    targetArea: string | null;
    budgetMin: number | null;
    budgetMax: number | null;
    timeline: string | null;
    financingStatus: string;
    score: number;
  };
  recommendation: Recommendation;
  agents: AgentOption[];
};

function formatBudget(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  const fmt = (value: number) => `$${(value / 1000).toFixed(0)}k`;
  if (min !== null && max !== null) return `${fmt(min)}–${fmt(max)}`;
  return fmt(min ?? max ?? 0);
}

function calendarBadge(status: AgentOption["calendarStatus"]): { label: string; className: string } {
  if (status === "connected") {
    return { label: "calendar", className: "border-[var(--sage)]/35 bg-[var(--sage-soft)] text-[var(--sage)]" };
  }
  if (status === "missing") {
    return { label: "no calendar", className: "border-[var(--oxblood)]/35 bg-[var(--oxblood-soft)] text-[var(--oxblood)]" };
  }
  return { label: "calendar unknown", className: "border-white/[0.08] bg-white/[0.02] text-white/56" };
}

export function RoutingAssignSheet(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  leadId: string;
  leadName: string;
  onAssigned: () => void;
}) {
  const isMobile = useIsMobile();
  const [context, setContext] = useState<RoutingContextResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [manualReason, setManualReason] = useState<string>("");

  useEffect(() => {
    if (!props.open) return;
    let cancelled = false;
    setContext(null);
    setLoadError(null);
    fetch(`/api/workspaces/${props.workspaceId}/leads/${props.leadId}/routing-context`, {
      credentials: "include",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(response.status === 403 ? "forbidden" : "failed");
        }
        return (await response.json()) as RoutingContextResponse;
      })
      .then((payload) => {
        if (cancelled) return;
        setContext(payload);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError("Could not load routing context.");
      });
    return () => {
      cancelled = true;
    };
  }, [props.open, props.workspaceId, props.leadId]);

  const submitAssignment = async (params: { memberId: string; mode: "auto" | "manual" }) => {
    setBusyMemberId(params.memberId);
    try {
      const body = params.mode === "auto"
        ? { mode: "auto" }
        : {
            mode: "manual",
            manualMemberId: params.memberId,
            manualReason: manualReason.trim().length > 0 ? manualReason.trim() : undefined,
          };
      const response = await fetch(`/api/workspaces/${props.workspaceId}/leads/${props.leadId}/routing`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(typeof payload?.error === "string" ? payload.error : "Assignment failed");
      }
      props.onAssigned();
      props.onOpenChange(false);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Assignment failed");
    } finally {
      setBusyMemberId(null);
    }
  };

  const body = (
    <AssignBody
      context={context}
      loadError={loadError}
      busyMemberId={busyMemberId}
      manualReason={manualReason}
      setManualReason={setManualReason}
      onApprove={(memberId) => submitAssignment({ memberId, mode: "auto" })}
      onManual={(memberId) => submitAssignment({ memberId, mode: "manual" })}
    />
  );

  if (isMobile) {
    return (
      <Drawer.Root open={props.open} onOpenChange={props.onOpenChange}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" />
          <Drawer.Content className="harwick-shell-dark fixed inset-x-0 bottom-0 z-50 flex h-[92vh] flex-col overflow-hidden rounded-t-[16px] border-t border-white/[0.08] bg-[color:var(--harwick-paper)] text-white outline-none">
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/16" aria-hidden="true" />
            <Drawer.Title className="sr-only">Assign {props.leadName}</Drawer.Title>
            <Drawer.Description className="sr-only">Approve Harwick&apos;s pick or override with a specific agent.</Drawer.Description>
            <div className="border-b border-white/[0.06] px-5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold text-white">Assign {props.leadName}</div>
                  <div className="mt-0.5 text-[11.5px] text-white/56">Approve Harwick&apos;s pick or pick manually.</div>
                </div>
                <button
                  type="button"
                  onClick={() => props.onOpenChange(false)}
                  className="-mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-full text-white/56 hover:bg-white/[0.05] hover:text-white"
                  aria-label="Close"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {body}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        side="right"
        className="harwick-shell-dark w-full sm:max-w-[480px] flex flex-col gap-0 overflow-hidden border-l border-white/[0.06] bg-[color:var(--harwick-paper)] p-0 text-white"
      >
        <SheetHeader className="border-b border-white/[0.06] px-5 py-4">
          <SheetTitle className="text-[14px] font-semibold text-white">Assign {props.leadName}</SheetTitle>
          <SheetDescription className="text-[11.5px] text-white/56">
            Approve Harwick&apos;s pick or override with a specific agent.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {body}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function AssignBody(props: {
  context: RoutingContextResponse | null;
  loadError: string | null;
  busyMemberId: string | null;
  manualReason: string;
  setManualReason: (value: string) => void;
  onApprove: (memberId: string) => void;
  onManual: (memberId: string) => void;
}): ReactNode {
  const { context, loadError, busyMemberId } = props;
  const lead = context?.lead;
  const recommendation = context?.recommendation;
  const recommendedAgent = recommendation?.assignedMemberId
    ? context?.agents.find((agent) => agent.memberId === recommendation.assignedMemberId)
    : undefined;
  const otherAgents = context?.agents.filter((agent) => agent.memberId !== recommendation?.assignedMemberId) ?? [];
  const budget = lead ? formatBudget(lead.budgetMin, lead.budgetMax) : null;

  return (
    <>
      {loadError !== null ? (
        <div className="flex items-center gap-2 rounded-[10px] border border-[var(--oxblood)]/35 bg-[var(--oxblood-soft)] px-3 py-2 text-[12px] text-[var(--oxblood)]">
          <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          <span>{loadError}</span>
        </div>
      ) : null}

      {context === null && loadError === null ? (
        <div className="flex items-center gap-2 text-[12px] text-white/56">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          Loading routing context…
        </div>
      ) : null}

      {lead ? (
        <section className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/40">Lead snapshot</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-white/72">
            <span className="font-semibold text-white">{lead.leadType}</span>
            {lead.targetArea === null ? null : (
              <span className="inline-flex items-center gap-1"><MapPin className="size-3" aria-hidden="true" />{lead.targetArea}</span>
            )}
            {budget === null ? null : <span>{budget}</span>}
            {lead.timeline === null ? null : <span>{lead.timeline}</span>}
            <span className="font-mono text-[11px] text-white/48">score {lead.score}</span>
          </div>
        </section>
      ) : null}

      {recommendation && recommendedAgent ? (
        <section className="rounded-[12px] border border-[var(--sage)]/30 bg-[var(--sage-soft)]/40 p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--sage)]">
            <Bot className="size-3" aria-hidden="true" />
            Harwick recommends
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold text-white">{recommendedAgent.displayName}</div>
              <div className="mt-0.5 text-[11.5px] text-white/64 line-clamp-2">
                {recommendation.reasons[0] ?? recommendation.taskLabel}
              </div>
            </div>
            <button
              type="button"
              onClick={() => props.onApprove(recommendedAgent.memberId)}
              disabled={busyMemberId !== null}
              className="inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-[8px] border border-[var(--sage)]/50 bg-[var(--sage)] px-3 text-[12px] font-semibold text-black transition hover:bg-[var(--sage)]/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busyMemberId === recommendedAgent.memberId ? (
                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="size-3" aria-hidden="true" />
              )}
              Approve
            </button>
          </div>
        </section>
      ) : recommendation && recommendation.status !== "assigned" ? (
        <section className="rounded-[12px] border border-[var(--clay)]/35 bg-[var(--clay-soft)]/40 p-3 text-[12px] text-white/72">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--clay)]">
            <Bot className="size-3" aria-hidden="true" />
            Harwick could not auto-assign
          </div>
          <div className="mt-1.5 line-clamp-3">{recommendation.reasons[0] ?? "No matching agent available — pick manually below."}</div>
        </section>
      ) : null}

      {context !== null ? (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/48">
              <Users2 className="size-3" aria-hidden="true" />
              Pick another agent
            </div>
            <span className="text-[10.5px] text-white/40">{otherAgents.length} available</span>
          </div>
          <label className="block">
            <span className="text-[10.5px] uppercase tracking-[0.08em] text-white/40">Reason (optional)</span>
            <input
              type="text"
              value={props.manualReason}
              onChange={(event) => props.setManualReason(event.target.value)}
              placeholder="e.g. Sarah owns this geo and has capacity"
              maxLength={400}
              className="mt-1 w-full rounded-[8px] border border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5 text-[12px] text-white placeholder:text-white/32 focus:border-white/[0.16] focus:outline-none"
            />
          </label>
          <div className="space-y-1.5">
            {otherAgents.length === 0 ? (
              <div className="rounded-[10px] border border-dashed border-white/[0.08] bg-white/[0.012] px-3 py-4 text-center text-[11.5px] text-white/48">
                No other agents with routing profiles.
              </div>
            ) : (
              otherAgents.map((agent) => {
                const cal = calendarBadge(agent.calendarStatus);
                const blocked = agent.atCapacity || !agent.acceptsNewLeads;
                return (
                  <button
                    key={agent.memberId}
                    type="button"
                    onClick={() => props.onManual(agent.memberId)}
                    disabled={busyMemberId !== null}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[10px] border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-left transition",
                      "hover:border-white/[0.14] hover:bg-white/[0.04]",
                      "disabled:cursor-not-allowed disabled:opacity-50",
                    )}
                  >
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-white/72">
                      <User className="size-3.5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-[13px] font-semibold text-white">{agent.displayName}</div>
                        <span className={cn("rounded-full border px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-[0.08em]", cal.className)}>
                          {cal.label}
                        </span>
                        {blocked ? (
                          <span className="rounded-full border border-[var(--clay)]/35 bg-[var(--clay-soft)] px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[var(--clay)]">
                            {agent.atCapacity ? "at capacity" : "paused"}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-white/56">
                        {agent.role} · {agent.activeLeadCount}/{agent.maxActiveLeads} active · {agent.areas.slice(0, 3).join(", ") || "no geos"}
                      </div>
                    </div>
                    {busyMemberId === agent.memberId ? (
                      <Loader2 className="size-3.5 shrink-0 animate-spin text-white/56" aria-hidden="true" />
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </section>
      ) : null}
    </>
  );
}
