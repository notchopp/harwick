"use client";

import { Bot, MessageSquare, ThumbsDown, ThumbsUp, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";

type AgentStepView = {
  stepId: string;
  iteration: number;
  createdAt: string;
  intent: string | null;
  nextAction: string | null;
  reply: string | null;
  selfGateAutoExecute: boolean | null;
  selfGateReason: string | null;
  toolNames: string[];
  toolStatuses: Array<{ tool: string; status: string }>;
  documentUpdate: string | null;
};

type AgentTrajectoryView = {
  trajectoryId: string;
  trajectoryStartedAt: string;
  trajectoryOutcomeLabel: string | null;
  trajectoryCompletionReason: string | null;
  steps: AgentStepView[];
};

export type AgentStepsPanelProps = {
  workspaceId: string;
  leadId: string;
  appearance?: "light" | "dark";
  className?: string;
};

const TAG_BUTTON = "h-7 rounded-full border border-border bg-surface px-2.5 text-[11px] font-medium text-foreground hover:bg-surface-muted disabled:opacity-50";
const TAG_POSITIVE = "h-7 rounded-full border border-sage-soft bg-sage-soft px-2.5 text-[11px] font-medium text-qualified hover:bg-sage-soft/80 disabled:opacity-50";
const TAG_NEGATIVE = "h-7 rounded-full border border-oxblood/30 bg-oxblood-soft px-2.5 text-[11px] font-medium text-hot hover:bg-oxblood-soft/80 disabled:opacity-50";

export function AgentStepsPanel(props: AgentStepsPanelProps) {
  const [trajectories, setTrajectories] = useState<AgentTrajectoryView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyStepId, setBusyStepId] = useState<string | null>(null);
  const [tagged, setTagged] = useState<Record<string, "positive" | "negative" | "note">>({});
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [showNoteFor, setShowNoteFor] = useState<string | null>(null);
  const dark = props.appearance === "dark";

  const tagButtonClass = dark
    ? "h-7 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 text-[11px] font-medium text-white/70 hover:bg-white/[0.08] disabled:opacity-50"
    : TAG_BUTTON;
  const tagPositiveClass = dark
    ? "h-7 rounded-full border border-sage/25 bg-sage/12 px-2.5 text-[11px] font-medium text-sage hover:bg-sage/18 disabled:opacity-50"
    : TAG_POSITIVE;
  const tagNegativeClass = dark
    ? "h-7 rounded-full border border-oxblood/35 bg-oxblood/12 px-2.5 text-[11px] font-medium text-[#f2a8a8] hover:bg-oxblood/18 disabled:opacity-50"
    : TAG_NEGATIVE;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/workspaces/${props.workspaceId}/agent-trajectories/for-lead/${props.leadId}`,
      );
      if (!response.ok) {
        setError("could not load agent steps");
        return;
      }
      const data = (await response.json()) as { trajectories: AgentTrajectoryView[] };
      setTrajectories(data.trajectories);
    } catch {
      setError("could not reach the agent-steps endpoint");
    } finally {
      setLoading(false);
    }
  }, [props.workspaceId, props.leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function tagStep(params: { trajectoryId: string; stepId: string; tag: "positive" | "negative" | "note"; note?: string }) {
    setBusyStepId(params.stepId);
    try {
      const response = await fetch(
        `/api/workspaces/${props.workspaceId}/agent-trajectories/${params.trajectoryId}/steps/${params.stepId}/tag`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tag: params.tag, ...(params.note === undefined ? {} : { note: params.note }) }),
        },
      );
      if (response.ok) {
        setTagged((prev) => ({ ...prev, [params.stepId]: params.tag }));
        if (params.tag === "note") {
          setShowNoteFor(null);
          setNoteDraft((prev) => ({ ...prev, [params.stepId]: "" }));
        }
      }
    } finally {
      setBusyStepId(null);
    }
  }

  if (loading) {
    return (
      <div className={cn(
        "rounded-[12px] px-3 py-2.5",
        dark ? "border border-white/[0.08] bg-[#0b100d]" : "border border-border bg-surface",
        props.className,
      )}>
        <div className={cn("flex items-center gap-2 text-[12px]", dark ? "text-white/46" : "text-muted")}>
          <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
          loading agent steps…
        </div>
      </div>
    );
  }

  if (error !== null) {
    return (
      <div className={cn(
        "rounded-[12px] px-3 py-2.5 text-[12px]",
        dark ? "border border-oxblood/35 bg-oxblood/12 text-[#f2a8a8]" : "border border-oxblood/30 bg-oxblood-soft text-hot",
        props.className,
      )}>
        {error}
      </div>
    );
  }

  if (trajectories.length === 0) {
    return (
      <div className={cn(
        "rounded-[12px] px-3 py-2.5 text-[12px]",
        dark ? "border border-white/[0.08] bg-[#0b100d] text-white/46" : "border border-border bg-surface text-muted",
        props.className,
      )}>
        no agent steps yet for this lead. they appear here once the AI runs against this thread.
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", props.className)}>
      {trajectories.map((traj) => (
        <div key={traj.trajectoryId} className={cn(
          "rounded-[12px]",
          dark ? "border border-white/[0.08] bg-[#0b100d]" : "border border-border bg-surface",
        )}>
          <div className={cn(
            "flex items-center justify-between px-3 py-2",
            dark ? "border-b border-white/[0.08]" : "border-b border-border",
          )}>
            <div className="flex items-center gap-2">
              <Bot aria-hidden="true" className={cn("h-3.5 w-3.5", dark ? "text-sage" : "text-qualified")} />
              <span className={cn("text-[11.5px] font-medium", dark ? "text-white/74" : "text-foreground")}>trajectory · {traj.steps.length} step{traj.steps.length === 1 ? "" : "s"}</span>
            </div>
            <span className={cn(
              "px-2 py-0.5 text-[10px]",
              dark && "rounded-full border border-white/[0.08]",
              !dark && "harwick-pill",
              traj.trajectoryOutcomeLabel === "positive" && (dark ? "bg-sage/12 text-sage" : "bg-sage-soft text-qualified"),
              traj.trajectoryOutcomeLabel === "negative" && (dark ? "bg-oxblood/12 text-[#f2a8a8]" : "bg-oxblood-soft text-hot"),
              traj.trajectoryOutcomeLabel === "neutral" && (dark ? "bg-white/[0.05] text-white/46" : "bg-surface-muted text-muted-subtle"),
              (traj.trajectoryOutcomeLabel === "pending" || traj.trajectoryOutcomeLabel === null) && (dark ? "bg-warm/10 text-warm/80" : "bg-brass-soft text-warm"),
            )}>
              {traj.trajectoryOutcomeLabel ?? "pending"}
            </span>
          </div>
          <div className="space-y-2 p-3">
            {traj.steps.map((step) => {
              const taggedValue = tagged[step.stepId];
              const isBusy = busyStepId === step.stepId;
              const noteOpen = showNoteFor === step.stepId;
              return (
                <div key={step.stepId} className={cn(
                  "rounded-[10px] px-3 py-2.5",
                  dark ? "border border-white/[0.08] bg-white/[0.03]" : "border border-border bg-surface-muted/40",
                )}>
                  <div className={cn("flex items-center justify-between text-[10.5px] uppercase tracking-[0.06em]", dark ? "text-white/30" : "text-muted-subtle")}>
                    <span>step {step.iteration} · {step.intent ?? "unknown"} → {step.nextAction ?? "—"}</span>
                    <span>{new Date(step.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                  </div>
                  {step.reply !== null && step.reply.length > 0 ? (
                    <div className={cn("mt-1.5 text-[12.5px] leading-[1.5]", dark ? "text-white/76" : "text-foreground")}>
                      {step.reply}
                    </div>
                  ) : null}
                  {step.toolStatuses.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {step.toolStatuses.map((tx) => (
                        <span
                          key={`${step.stepId}-${tx.tool}-${tx.status}`}
                          className={cn(
                            "px-2 py-0.5 text-[10px]",
                            dark ? "rounded-full border border-white/[0.08]" : "harwick-pill",
                            tx.status === "executed" && (dark ? "bg-sage/12 text-sage" : "bg-sage-soft text-qualified"),
                            tx.status === "queued_for_approval" && (dark ? "bg-warm/10 text-warm/80" : "bg-brass-soft text-warm"),
                            tx.status === "failed" && (dark ? "bg-oxblood/12 text-[#f2a8a8]" : "bg-oxblood-soft text-hot"),
                          )}
                        >
                          {tx.tool} · {tx.status}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {step.documentUpdate !== null && step.documentUpdate.length > 0 ? (
                    <div className={cn(
                      "mt-1.5 rounded-[8px] px-2 py-1.5 text-[11.5px] italic",
                      dark ? "border border-dashed border-white/[0.08] bg-[#0a0f0c] text-white/42" : "border border-dashed border-border bg-surface text-muted",
                    )}>
                      doc → {step.documentUpdate}
                    </div>
                  ) : null}
                  {step.selfGateAutoExecute === false && step.selfGateReason !== null ? (
                    <div className={cn("mt-1.5 text-[10.5px]", dark ? "text-white/42" : "text-muted")}>
                      self-gate held: {step.selfGateReason}
                    </div>
                  ) : null}

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Button
                      className={taggedValue === "positive" ? tagPositiveClass : tagButtonClass}
                      disabled={isBusy || taggedValue === "positive"}
                      onClick={() => void tagStep({ trajectoryId: traj.trajectoryId, stepId: step.stepId, tag: "positive" })}
                      type="button"
                      variant="ghost"
                    >
                      <ThumbsUp aria-hidden="true" className="h-3 w-3" />
                      good
                    </Button>
                    <Button
                      className={taggedValue === "negative" ? tagNegativeClass : tagButtonClass}
                      disabled={isBusy || taggedValue === "negative"}
                      onClick={() => void tagStep({ trajectoryId: traj.trajectoryId, stepId: step.stepId, tag: "negative" })}
                      type="button"
                      variant="ghost"
                    >
                      <ThumbsDown aria-hidden="true" className="h-3 w-3" />
                      bad
                    </Button>
                    <Button
                      className={tagButtonClass}
                      disabled={isBusy}
                      onClick={() => setShowNoteFor((prev) => (prev === step.stepId ? null : step.stepId))}
                      type="button"
                      variant="ghost"
                    >
                      <MessageSquare aria-hidden="true" className="h-3 w-3" />
                      note
                    </Button>
                    {taggedValue === "note" ? <span className={cn("text-[10.5px]", dark ? "text-white/30" : "text-muted-subtle")}>note saved</span> : null}
                  </div>
                  {noteOpen ? (
                    <div className="mt-2 space-y-1.5">
                      <textarea
                        className={cn(
                          "block min-h-[48px] w-full resize-y rounded-[8px] px-2.5 py-1.5 text-[11.5px] leading-[1.4] outline-none",
                          dark
                            ? "border border-white/[0.08] bg-[#0a0f0c] text-white/74 placeholder:text-white/24"
                            : "border border-border bg-surface text-foreground placeholder:text-muted-subtle",
                        )}
                        placeholder="why was this step good or bad? helps the next training round."
                        value={noteDraft[step.stepId] ?? ""}
                        onChange={(event) => setNoteDraft((prev) => ({ ...prev, [step.stepId]: event.target.value }))}
                      />
                      <div className="flex items-center gap-1.5">
                        <Button
                          className={tagButtonClass}
                          disabled={isBusy || (noteDraft[step.stepId] ?? "").trim().length === 0}
                          onClick={() => void tagStep({ trajectoryId: traj.trajectoryId, stepId: step.stepId, tag: "note", note: (noteDraft[step.stepId] ?? "").trim() })}
                          type="button"
                          variant="ghost"
                        >
                          save note
                        </Button>
                        <Button
                          className={tagButtonClass}
                          disabled={isBusy}
                          onClick={() => setShowNoteFor(null)}
                          type="button"
                          variant="ghost"
                        >
                          cancel
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
