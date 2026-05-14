"use client";

import { Bot, Loader2, LogOut, Pause, Play, Send, Trash2, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import type { ConversationAutomationMode } from "@realty-ops/core";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";
import { AgentStepsPanel } from "../agent-runtime/agent-steps-panel";

export type LeadActionToolbarProps = {
  workspaceId: string;
  leadId: string;
  automationMode: ConversationAutomationMode;
  assignedMemberId: string | null;
  currentMemberId: string;
  appearance?: "light" | "dark";
  draft?: string | null;
  reviewId?: string | null;
  onDraftChange?: (next: string) => void;
  onChanged?: () => void | Promise<void>;
  className?: string;
  showAgentSteps?: boolean;
};

type ButtonState = "idle" | "busy";

const PRIMARY = "h-8 rounded-full bg-harwick-ink px-4 text-[12px] font-medium text-white hover:bg-harwick-ink/90 disabled:opacity-60";
const OUTLINE = "h-8 rounded-full border border-border bg-surface px-4 text-[12px] font-medium text-foreground hover:bg-surface-muted disabled:opacity-60";
const DANGER = "size-9 rounded-[10px] border border-oxblood/30 bg-oxblood-soft p-0 text-hot hover:bg-oxblood-soft/80 disabled:opacity-60";

export function LeadActionToolbar(props: LeadActionToolbarProps) {
  const [state, setState] = useState<ButtonState>("idle");
  const [status, setStatus] = useState<string | null>(null);
  const [composer, setComposer] = useState<string>(props.draft ?? "");
  const [localAutomationMode, setLocalAutomationMode] = useState<ConversationAutomationMode>(props.automationMode);

  useEffect(() => {
    setComposer(props.draft ?? "");
    setStatus(null);
  }, [props.draft, props.leadId, props.reviewId, props.workspaceId]);

  useEffect(() => {
    setLocalAutomationMode(props.automationMode);
  }, [props.automationMode, props.leadId]);

  const aiOn = localAutomationMode === "ai_on";
  const isAssignedToMe = props.assignedMemberId === props.currentMemberId;
  const isAssignedToOther = props.assignedMemberId !== null && !isAssignedToMe;
  const busy = state === "busy";
  const draftToSend = (composer ?? "").trim();
  const dark = props.appearance === "dark";
  const primaryClass = dark
    ? "h-9 rounded-[10px] border border-[var(--sage)]/35 bg-[var(--sage-soft)] px-3 text-[12px] font-semibold text-[var(--sage)] hover:border-[var(--sage)]/55 hover:bg-[var(--sage-soft)]/80 disabled:border-white/[0.08] disabled:bg-white/[0.035] disabled:text-white/28"
    : PRIMARY;
  const outlineClass = dark
    ? "h-9 rounded-[10px] border border-white/[0.09] bg-white/[0.04] px-3 text-[12px] font-medium text-white/68 hover:bg-white/[0.08] hover:text-white disabled:opacity-60"
    : OUTLINE;
  const iconClass = dark
    ? "size-9 rounded-[10px] border border-white/[0.09] bg-white/[0.04] p-0 text-white/68 hover:bg-white/[0.08] hover:text-white disabled:opacity-60"
    : "size-9 rounded-[10px] border border-border bg-surface p-0 text-muted hover:bg-surface-muted hover:text-foreground disabled:opacity-60";
  const dangerClass = dark
    ? "size-9 rounded-[10px] border border-oxblood/35 bg-oxblood/12 p-0 text-[#f2a8a8] hover:bg-oxblood/18 disabled:opacity-60"
    : DANGER;

  function announce(message: string) {
    setStatus(message);
  }

  function errorMessageFromBody(value: unknown): string {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const error = (value as Record<string, unknown>)["error"];
      if (typeof error === "string" && error.length > 0) {
        return error;
      }
    }
    return "send failed.";
  }

  async function withBusy<T>(fn: () => Promise<T>): Promise<T> {
    setState("busy");
    try {
      return await fn();
    } finally {
      setState("idle");
    }
  }

  async function postAutomation(mode: ConversationAutomationMode, reason: string) {
    const response = await fetch(
      `/api/workspaces/${props.workspaceId}/conversations/${props.leadId}/automation`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, reason }),
      },
    );
    if (response.status === 403) {
      announce("auth required.");
      return false;
    }
    if (!response.ok) {
      announce("could not update automation.");
      return false;
    }
    setLocalAutomationMode(mode);
    return true;
  }

  async function handleSend() {
    if (draftToSend.length === 0) {
      announce("write a reply first.");
      return;
    }

    await withBusy(async () => {
      announce("sending...");
      try {
        const response = await fetch(
          `/api/workspaces/${props.workspaceId}/conversations/${props.leadId}/messages`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              workspaceId: props.workspaceId,
              conversationId: props.leadId,
              reply: draftToSend,
            }),
          },
        );
        if (response.status === 403) {
          announce("auth required.");
          return;
        }
        if (!response.ok) {
          const errorData: unknown = await response.json().catch(() => ({}));
          announce(errorMessageFromBody(errorData));
          return;
        }
        setComposer("");
        props.onDraftChange?.("");
        announce("reply sent.");
        await props.onChanged?.();
      } catch {
        announce("could not reach the send endpoint.");
      }
    });
  }

  async function handlePause() {
    await withBusy(async () => {
      announce("pausing AI...");
      const ok = await postAutomation("human_takeover", "operator paused AI from the action toolbar");
      if (ok) {
        announce("AI paused for this conversation.");
        await props.onChanged?.();
      }
    });
  }

  async function handleResume() {
    await withBusy(async () => {
      announce("resuming AI...");
      const ok = await postAutomation("ai_on", "operator resumed AI from the action toolbar");
      if (ok) {
        announce("AI resumed.");
        await props.onChanged?.();
      }
    });
  }

  async function handleTakeOver() {
    await withBusy(async () => {
      announce("taking over...");
      const ok = await postAutomation("human_takeover", "operator took over the conversation");
      if (ok) {
        announce("you have control. AI is paused for this thread.");
        await props.onChanged?.();
      }
    });
  }

  async function handleRelease() {
    await withBusy(async () => {
      announce("releasing...");
      const ok = await postAutomation("ai_on", "operator released the conversation back to AI");
      if (ok) {
        announce("released. AI is back on for this thread.");
        await props.onChanged?.();
      }
    });
  }

  async function handleDismiss() {
    if (!props.reviewId) {
      return;
    }
    await withBusy(async () => {
      announce("dismissing...");
      try {
        const response = await fetch(
          `/api/workspaces/${props.workspaceId}/social-queue/${props.reviewId}/action`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "dismiss", reason: "operator dismissed from action toolbar" }),
          },
        );
        if (!response.ok) {
          announce("could not dismiss.");
          return;
        }
        announce("dismissed.");
        await props.onChanged?.();
      } catch {
        announce("could not reach the dismiss endpoint.");
      }
    });
  }

  return (
    <div className={cn("space-y-2", props.className)}>
      {props.showAgentSteps === false ? null : (
        <AgentStepsPanel
          workspaceId={props.workspaceId}
          leadId={props.leadId}
          {...(props.appearance === undefined ? {} : { appearance: props.appearance })}
        />
      )}

      <div className={cn(
        "rounded-[12px] border",
        dark ? "border-white/[0.08] bg-[#0a0f0c]" : "border-border bg-surface",
      )}>
        <textarea
          aria-label="Reply"
          className={cn(
            "block min-h-[68px] w-full resize-y bg-transparent px-3 py-2 text-[13px] leading-5 outline-none",
            dark ? "text-white/82 placeholder:text-white/28" : "text-foreground placeholder:text-muted-subtle",
          )}
          onChange={(event) => {
            const next = event.target.value;
            setComposer(next);
            props.onDraftChange?.(next);
          }}
          placeholder={aiOn ? "Send a manual reply (AI is running this thread)" : "AI is paused — your reply goes out as the operator"}
          value={composer}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          className={cn(primaryClass, "min-w-0 flex-1 sm:flex-none")}
          disabled={busy || draftToSend.length === 0}
          onClick={() => void handleSend()}
          type="button"
          variant="ghost"
        >
          {busy ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <Send aria-hidden="true" className="h-3.5 w-3.5" />}
          send reply
        </Button>

        {aiOn ? (
          <Button
            aria-label="Pause AI for this thread"
            className={iconClass}
            disabled={busy}
            onClick={() => void handlePause()}
            title="Pause AI"
            type="button"
            variant="ghost"
          >
            <Pause aria-hidden="true" className="size-4" />
          </Button>
        ) : (
          <Button
            aria-label="Resume AI for this thread"
            className={iconClass}
            disabled={busy}
            onClick={() => void handleResume()}
            title="Resume AI"
            type="button"
            variant="ghost"
          >
            <Play aria-hidden="true" className="size-4" />
          </Button>
        )}

        {isAssignedToMe ? (
          <Button className={outlineClass} disabled={busy} onClick={() => void handleRelease()} type="button" variant="ghost">
            <LogOut aria-hidden="true" className="h-3.5 w-3.5" />
            release
          </Button>
        ) : (
          <Button className={outlineClass} disabled={busy} onClick={() => void handleTakeOver()} type="button" variant="ghost">
            <UserPlus aria-hidden="true" className="h-3.5 w-3.5" />
            {isAssignedToOther ? "claim from teammate" : "take over"}
          </Button>
        )}

        {props.reviewId ? (
          <Button
            aria-label="Dismiss queued AI action"
            className={dangerClass}
            disabled={busy}
            onClick={() => void handleDismiss()}
            title="Dismiss"
            type="button"
            variant="ghost"
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </Button>
        ) : null}
      </div>

      <div className={cn("flex items-center gap-2 text-[11px]", dark ? "text-white/40" : "text-muted-subtle")}>
        {aiOn ? (
          <>
            <Bot aria-hidden="true" className="h-3 w-3 text-qualified" />
            <span>harwick is on for this thread. operator messages send instantly.</span>
          </>
        ) : (
          <>
            <Pause aria-hidden="true" className="h-3 w-3 text-warm" />
            <span>harwick is paused for this thread. resume to let it reply automatically again.</span>
          </>
        )}
      </div>

      {status === null ? null : (
        <div className={cn(
          "rounded-[10px] border px-3 py-1.5 text-[11.5px]",
          dark ? "border-white/[0.08] bg-white/[0.035] text-white/52" : "border-border bg-surface text-muted",
        )}>
          {status}
        </div>
      )}
    </div>
  );
}
