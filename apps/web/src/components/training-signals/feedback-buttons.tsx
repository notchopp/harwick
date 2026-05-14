"use client";

import { Check, Loader2, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";

import { cn } from "../../lib/utils";
import { useFeedback, type FeedbackTarget } from "../../lib/training-signals/use-feedback";

export type FeedbackButtonsProps = {
  target: FeedbackTarget;
  /** Optional label rendered to the left of the thumbs. */
  label?: string;
  size?: "sm" | "md";
  /** Render a compact two-button row vs spacious. */
  compact?: boolean;
  /** When false, buttons render disabled (e.g. viewer role). */
  enabled?: boolean;
};

const TONE = {
  idle: "border-white/[0.07] bg-white/[0.02] text-white/56 hover:border-white/[0.16] hover:bg-white/[0.05] hover:text-white",
  pos: "border-[var(--sage)]/40 bg-[var(--sage-soft)] text-[var(--sage)]",
  neg: "border-[var(--oxblood)]/45 bg-[var(--oxblood-soft)] text-[var(--oxblood)]",
} as const;

export function FeedbackButtons(props: FeedbackButtonsProps) {
  const feedback = useFeedback(props.target);
  const enabled = props.enabled !== false;
  const size = props.size ?? "sm";
  const dim = size === "sm" ? "size-6" : "size-7";
  const icon = size === "sm" ? "size-3" : "size-3.5";
  const [confirmed, setConfirmed] = useState(false);

  async function tag(value: "positive" | "negative") {
    if (!enabled || feedback.busy) return;
    await feedback.send(value);
    setConfirmed(true);
    window.setTimeout(() => setConfirmed(false), 1200);
  }

  const pos = feedback.current === "positive";
  const neg = feedback.current === "negative";

  return (
    <div className={cn("inline-flex items-center gap-1", props.compact ? "" : "gap-1.5")}>
      {props.label === undefined ? null : (
        <span className="text-[10.5px] uppercase tracking-[0.08em] text-white/40">{props.label}</span>
      )}
      <button
        type="button"
        aria-label="Mark as a good signal"
        title="Good signal — Harwick got this right"
        disabled={!enabled || feedback.busy}
        onClick={() => { void tag("positive"); }}
        className={cn(
          "inline-flex items-center justify-center rounded-[6px] border transition disabled:cursor-not-allowed disabled:opacity-50",
          dim,
          pos ? TONE.pos : TONE.idle,
        )}
      >
        {feedback.busy && pos ? <Loader2 className={cn(icon, "animate-spin")} aria-hidden="true" />
          : pos && confirmed ? <Check className={icon} aria-hidden="true" />
          : <ThumbsUp className={icon} aria-hidden="true" />}
      </button>
      <button
        type="button"
        aria-label="Mark as a bad signal"
        title="Bad signal — Harwick got this wrong"
        disabled={!enabled || feedback.busy}
        onClick={() => { void tag("negative"); }}
        className={cn(
          "inline-flex items-center justify-center rounded-[6px] border transition disabled:cursor-not-allowed disabled:opacity-50",
          dim,
          neg ? TONE.neg : TONE.idle,
        )}
      >
        {feedback.busy && neg ? <Loader2 className={cn(icon, "animate-spin")} aria-hidden="true" />
          : neg && confirmed ? <Check className={icon} aria-hidden="true" />
          : <ThumbsDown className={icon} aria-hidden="true" />}
      </button>
      {feedback.error === null ? null : (
        <span className="text-[10px] text-[var(--oxblood)]" title={feedback.error}>!</span>
      )}
    </div>
  );
}
