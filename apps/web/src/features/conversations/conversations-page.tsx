"use client";

import {
  ConversationsInboxResponseSchema,
  type ConversationAiToolActivity,
  type ConversationInboxMessage,
  type ConversationInboxThread,
} from "@realty-ops/core";
import { AlertCircle, ArrowUpRight, Bot, Brain, Calendar, ChevronDown, History, Loader2, MessageSquare, Phone, RefreshCw, ShieldCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HarwickMark } from "../../components/harwick-rail/harwick-mark";
import { SearchGlyph } from "../../components/harwick-icons";
import { FeedbackButtons } from "../../components/training-signals/feedback-buttons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { getToolDescriptor } from "../../lib/training-signals/tool-labels";
import { cn } from "../../lib/utils";
import { useRealtimeThreadSync } from "./use-realtime-thread-sync";
import { LeadActionToolbar } from "./lead-action-toolbar";
import type { BuyerChatTranscript } from "./listing-chats-data";

type ThreadFilter = "all" | "in_progress" | "queued" | "paused" | "resolved";
type LoadState = "loading" | "ready" | "error";
type ConversationViewMode = "transcript" | "activity";

const graphiteBorder = "border-[color:var(--graphite-line)]";
const graphiteRaised = "border-[color:var(--graphite-line)] bg-[var(--graphite-surface-2)] shadow-[var(--shadow-elev-1)]";
const graphiteRaisedStrong = "border-[color:var(--graphite-line-strong)] bg-[var(--graphite-surface-3)] shadow-[var(--shadow-elev-1)]";
const graphiteActionButton =
  "inline-flex items-center gap-1 rounded-[9px] border border-[color:var(--graphite-line)] bg-[var(--graphite-surface-2)] px-2.5 py-1.5 text-[11.5px] font-semibold text-[var(--graphite-text)] transition hover:border-[color:var(--graphite-line-strong)] hover:bg-[var(--graphite-surface-3)]";
const graphitePill =
  "inline-flex items-center gap-1.5 rounded-full border border-[color:var(--graphite-line)] bg-[var(--graphite-surface-2)] px-2.5 py-1 text-[11px] font-semibold text-[var(--graphite-text-muted)] shadow-[var(--shadow-elev-1)]";
const graphiteSegmented =
  "inline-flex rounded-[10px] border border-[color:var(--graphite-line)] bg-[var(--graphite-surface-2)] p-0.5 shadow-[var(--shadow-elev-1)]";

function bucketFor(thread: ConversationInboxThread): ThreadFilter {
  if (thread.automationMode === "paused_by_rule" || thread.automationMode === "human_takeover") return "paused";
  if (thread.stageTone === "lost") return "resolved";
  if (thread.reviewId !== null) return "queued";
  return "in_progress";
}


function getThreadDraft(thread: ConversationInboxThread): string {
  const draftMessage = [...thread.messages].reverse().find((message) => message.kind === "ai_action");
  return draftMessage?.body ?? "";
}

function getPreviewFromMessages(thread: ConversationInboxThread): string {
  const previewMessage = [...thread.messages].reverse().find((message) => message.kind !== "ai_action");
  return previewMessage?.body ?? thread.preview;
}

function threadTimelineLabel(thread: ConversationInboxThread): string {
  return thread.source === "voice" ? "Call summary + follow-up" : "Live thread";
}

function composerContextLabel(thread: ConversationInboxThread): string {
  return thread.source === "voice"
    ? "Voice summary captured. Send the next follow-up message from here."
    : `Replying via ${thread.sourceLabel} ${thread.channelLabel}`;
}

/**
 * Meta's messaging policy: replies to Instagram/Messenger DMs are free-form for
 * 24h after the lead's last inbound message. From 24h to 7d, replies must carry
 * the `human_agent` message tag (and only one such reply per conversation).
 * Beyond 7d, no programmatic outreach until the lead messages again.
 *
 * This is the operator-visible state of that policy — the timer renders above
 * the composer so it's obvious which window we're in before they hit send.
 */
type MessagingWindowState =
  | { kind: "fresh"; remainingMs: number }
  | { kind: "human_agent"; remainingMs: number }
  | { kind: "expired" }
  | { kind: "no_inbound" }
  | { kind: "not_applicable" };

const FRESH_WINDOW_MS = 24 * 60 * 60 * 1000;
const HUMAN_AGENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function computeMessagingWindow(thread: ConversationInboxThread, nowMs: number): MessagingWindowState {
  if (thread.source !== "instagram" && thread.source !== "facebook") {
    return { kind: "not_applicable" };
  }
  const lastInbound = [...thread.messages]
    .reverse()
    .find((message) => message.kind === "lead");
  if (lastInbound === undefined) {
    return { kind: "no_inbound" };
  }
  const elapsed = nowMs - new Date(lastInbound.occurredAt).getTime();
  if (elapsed < 0 || elapsed < FRESH_WINDOW_MS) {
    return { kind: "fresh", remainingMs: Math.max(0, FRESH_WINDOW_MS - Math.max(0, elapsed)) };
  }
  if (elapsed < HUMAN_AGENT_WINDOW_MS) {
    return { kind: "human_agent", remainingMs: HUMAN_AGENT_WINDOW_MS - elapsed };
  }
  return { kind: "expired" };
}

function formatRemaining(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  if (totalMinutes < 60) return `${totalMinutes}m left`;
  const hours = Math.round(totalMinutes / 60);
  if (hours < 24) return `${hours}h left`;
  const days = Math.round(hours / 24);
  return `${days}d left`;
}

function MessagingWindowIndicator({ thread, nowMs }: { thread: ConversationInboxThread; nowMs: number }) {
  const state = computeMessagingWindow(thread, nowMs);
  if (state.kind === "not_applicable") return null;
  const base = "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]";
  if (state.kind === "fresh") {
    return (
      <span className={`${base} border-[var(--sage)]/35 bg-[var(--sage-soft)] text-[var(--sage)]`}>
        <span className="size-1.5 rounded-full bg-[var(--sage)]" aria-hidden="true" />
        24h window · {formatRemaining(state.remainingMs)}
      </span>
    );
  }
  if (state.kind === "human_agent") {
    return (
      <span
        className={`${base} border-[var(--clay)]/35 bg-[var(--clay-soft)] text-[var(--clay)]`}
        title="Outside the 24h window. Reply will use Meta's human_agent tag (7-day extension, one reply allowed)."
      >
        <span className="size-1.5 rounded-full bg-[var(--clay)]" aria-hidden="true" />
        human_agent tag · {formatRemaining(state.remainingMs)}
      </span>
    );
  }
  if (state.kind === "expired") {
    return (
      <span
        className={`${base} border-[var(--oxblood)]/35 bg-[var(--oxblood-soft)] text-[var(--oxblood)]`}
        title="The 7-day human-agent window has elapsed. Meta blocks unsolicited replies until the lead messages again."
      >
        <span className="size-1.5 rounded-full bg-[var(--oxblood)]" aria-hidden="true" />
        outside reply window
      </span>
    );
  }
  // no_inbound — lead hasn't messaged yet; nothing to time off of
  return (
    <span className={`${base} border-white/[0.08] bg-white/[0.025] text-white/56`}>
      no inbound yet
    </span>
  );
}

function applyLocalDraft(thread: ConversationInboxThread, draft: string): ConversationInboxThread {
  const nextMessages = [
    ...thread.messages.filter((message) => message.kind !== "ai_action"),
    {
      id: `local-ai-${thread.id}`,
      kind: "ai_action" as const,
      body: draft,
      meta: "Harwick AI action",
      occurredAt: new Date().toISOString(),
    },
  ];

  return {
    ...thread,
    messages: nextMessages,
    preview: draft,
    listingStatus: "AI action ready",
    automationReason: thread.automationReason ?? "Working locally on a development thread.",
  };
}

function applyLocalSend(thread: ConversationInboxThread, draft: string): ConversationInboxThread {
  const nextMessages = [
    ...thread.messages.filter((message) => message.kind !== "ai_action"),
    {
      id: `local-sent-${thread.id}-${thread.messages.length}`,
      kind: "sent" as const,
      body: draft,
      meta: "Sent just now",
      occurredAt: new Date().toISOString(),
    },
  ];

  return {
    ...thread,
    messages: nextMessages,
    preview: draft,
    lastTouchLabel: "now",
    unread: false,
    listingStatus: thread.followUpBossContactId === null ? "Live conversation" : "FUB synced",
  };
}

function applyLocalDismiss(thread: ConversationInboxThread): ConversationInboxThread {
  const nextMessages = thread.messages.filter((message) => message.kind !== "ai_action");
  return {
    ...thread,
    messages: nextMessages,
    preview: getPreviewFromMessages({ ...thread, messages: nextMessages }),
    listingStatus: "Action dismissed",
  };
}

function BuyerChatTranscriptView(props: {
  transcript: BuyerChatTranscript | null;
  loading: boolean;
}) {
  if (props.loading && props.transcript === null) {
    return (
      <div className="rounded-[12px] border border-[color:var(--graphite-line)] bg-[var(--graphite-surface-2)] p-4 text-[12px] text-white/48">
        Loading buyer chat…
      </div>
    );
  }
  if (props.transcript === null || props.transcript.turns.length === 0) {
    return (
      <div className="rounded-[12px] border border-[color:var(--graphite-line)] bg-[var(--graphite-surface-2)] p-4 text-[12px] text-white/56">
        No transcript captured for this conversation yet.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {props.transcript.turns.map((turn, idx) => {
        const isHarwick = turn.actor === "harwick_ai";
        return (
          <div
            className={cn("flex w-full", isHarwick ? "justify-end" : "justify-start")}
            key={`${turn.occurredAt}-${idx}`}
          >
            <div
              className={cn(
                "max-w-[78%] rounded-[14px] border px-3.5 py-2.5 text-[13px] leading-[1.45] shadow-[var(--shadow-elev-1)]",
                isHarwick
                  ? "border-[var(--sage)]/25 bg-[var(--sage-soft)] text-white"
                  : "border-[color:var(--graphite-line)] bg-[var(--graphite-surface-2)] text-white/86",
              )}
            >
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/52">
                <span>{isHarwick ? "Harwick" : (props.transcript?.visitorName ?? "Visitor")}</span>
                <span className="text-white/30">·</span>
                <span className="text-white/40">
                  {new Date(turn.occurredAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <div className="whitespace-pre-wrap">{turn.body}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MessageBubble(props: {
  avatar: string;
  disabled: boolean;
  message: ConversationInboxMessage;
  workspaceId: string;
}) {
  if (props.message.kind === "system") {
    return (
      <div className="my-4 flex items-center justify-center gap-2 text-[11px] text-white/40">
        <span className="h-px flex-1 bg-white/[0.06]" aria-hidden="true" />
        <span className="rounded-full border border-white/[0.07] bg-white/[0.025] px-2.5 py-1 text-white/60">
          {props.message.body}
        </span>
        <span className="h-px flex-1 bg-white/[0.06]" aria-hidden="true" />
      </div>
    );
  }

  if (props.message.kind === "sent") {
    return (
      <div className="mb-3 flex justify-end">
        <div className="flex max-w-[78%] flex-col items-end gap-1">
          <div className="rounded-[14px_4px_14px_14px] bg-white px-3.5 py-2 text-[12.5px] leading-[1.5] text-[#0f1011] shadow-[0_1px_2px_rgba(0,0,0,0.3)] whitespace-pre-wrap">
            {props.message.body}
          </div>
          <div className="font-mono text-[10px] text-white/40">{props.message.meta}</div>
        </div>
      </div>
    );
  }

  const isAi = props.message.kind === "ai_action";
  const trajectoryId = props.message.agentTrajectoryId ?? null;
  const stepId = props.message.agentStepId ?? null;

  return (
    <div className={cn("mb-3 flex gap-2.5", isAi ? "justify-start" : "justify-start")}>
      <div
        className={cn(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-medium",
          isAi ? "border border-[var(--sage)]/35 bg-[var(--sage-soft)]" : "border border-white/[0.07] bg-white/[0.04] text-white/68",
        )}
      >
        {isAi ? <HarwickMark size={14} tone="soft" /> : props.avatar}
      </div>

      <div className="flex max-w-[78%] flex-col gap-1">
        <div
          className={cn(
            "rounded-[4px_14px_14px_14px] px-3.5 py-2 text-[12.5px] leading-[1.5] whitespace-pre-wrap",
            !isAi && "border border-white/[0.07] bg-white/[0.025] text-white/92",
            isAi && "border border-[var(--sage)]/30 bg-gradient-to-b from-[var(--sage-soft)]/55 to-white/[0.015] text-white",
          )}
        >
          {isAi ? (
            <>
              <div className="mb-1 inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--sage)]">
                <Bot className="size-3" aria-hidden="true" />
                {props.message.meta}
              </div>
              <div>{props.message.body}</div>
            </>
          ) : (
            props.message.body
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="font-mono text-[10px] text-white/40">{props.message.meta}</div>
          {isAi && trajectoryId !== null && stepId !== null ? (
            <FeedbackButtons
              size="sm"
              compact
              target={{ kind: "step", workspaceId: props.workspaceId, trajectoryId, stepId }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

const toolStatusStyles: Record<ConversationAiToolActivity["status"], string> = {
  requested: "bg-white/[0.05] text-white/64",
  queued: "bg-white/[0.05] text-white/64",
  running: "bg-[var(--clay-soft)] text-[var(--clay)]",
  executed: "bg-[var(--sage-soft)] text-[var(--sage)]",
  queued_for_approval: "bg-[var(--clay-soft)] text-[var(--clay)]",
  missing_handler: "bg-[var(--oxblood-soft)] text-[var(--oxblood)]",
  failed: "bg-[var(--oxblood-soft)] text-[var(--oxblood)]",
};

function formatTimestamp(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  return new Date(parsed).toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  });
}

type ActivityEntry =
  | { kind: "tool"; key: string; tool: string; summary: string; status: ConversationAiToolActivity["status"]; detail: string | null; occurredAt: string | null }
  | { kind: "message"; key: string; messageKind: ConversationInboxMessage["kind"]; body: string; meta: string; occurredAt: string }
  | { kind: "automation"; key: string; mode: string; reason: string };

function buildActivityEntries(thread: ConversationInboxThread): ActivityEntry[] {
  const entries: ActivityEntry[] = [];

  if (thread.automationMode !== null) {
    entries.push({
      kind: "automation",
      key: `automation:${thread.id}`,
      mode: thread.automationMode,
      reason: thread.automationReason ?? "No reason recorded for the current automation state.",
    });
  }

  const synthesis = thread.aiSynthesis;
  if (synthesis !== null) {
    synthesis.toolActivity.forEach((activity) => {
      entries.push({
        kind: "tool",
        key: `tool:${activity.id}`,
        tool: activity.tool,
        summary: activity.summary,
        status: activity.status,
        detail: activity.detail,
        occurredAt: synthesis.updatedAt,
      });
    });
  }

  thread.messages
    .filter((message) => message.kind === "ai_action" || message.kind === "system")
    .forEach((message) => {
      entries.push({
        kind: "message",
        key: `msg:${message.id}`,
        messageKind: message.kind,
        body: message.body,
        meta: message.meta,
        occurredAt: message.occurredAt,
      });
    });

  return entries;
}

function ActivityLog(props: { thread: ConversationInboxThread; workspaceId: string }) {
  const entries = buildActivityEntries(props.thread);
  const synthesis = props.thread.aiSynthesis;
  const trajectoryId = props.thread.messages.find((message) => message.agentTrajectoryId != null)?.agentTrajectoryId ?? null;
  const latestAiStepId = [...props.thread.messages].reverse().find((message) => message.kind === "ai_action" && message.agentStepId != null)?.agentStepId ?? null;

  return (
    <div className="space-y-4 px-[18px] py-[18px]">
      {synthesis === null ? null : (
        <div className="rounded-[10px] border border-white/[0.07] bg-white/[0.025] px-3.5 py-3">
          <div className="mb-2 flex items-center gap-2">
            <Brain className="size-3.5 text-[var(--sage)]" aria-hidden="true" />
            <span className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-white/52">Current synthesis</span>
            <span className="ml-auto font-mono text-[10.5px] text-white/40">{formatTimestamp(synthesis.updatedAt)}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[10.5px] text-white/40">intent</div>
                <div className="font-medium text-white">{synthesis.intent.replace(/_/g, " ")}</div>
              </div>
              <FeedbackButtons
                size="sm"
                compact
                target={{ kind: "surface", workspaceId: props.workspaceId, surface: "synthesis_field", resourceId: `${synthesis.turnId}:intent`, context: { field: "intent", value: synthesis.intent } }}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[10.5px] text-white/40">next action</div>
                <div className="font-medium text-white">{synthesis.nextAction.replace(/_/g, " ")}</div>
              </div>
              <FeedbackButtons
                size="sm"
                compact
                target={{ kind: "surface", workspaceId: props.workspaceId, surface: "synthesis_field", resourceId: `${synthesis.turnId}:nextAction`, context: { field: "nextAction", value: synthesis.nextAction } }}
              />
            </div>
            <div>
              <div className="text-[10.5px] text-white/40">confidence</div>
              <div className="font-mono text-[13px] font-medium text-white">{Math.round(synthesis.confidence * 100)}%</div>
            </div>
            <div>
              <div className="text-[10.5px] text-white/40">status</div>
              <div className="font-medium text-white">{synthesis.status.replace(/_/g, " ")}</div>
            </div>
          </div>
          {synthesis.missingFields.length === 0 ? null : (
            <div className="mt-2 text-[11.5px] leading-5 text-white/64">
              <span className="text-white/40">missing: </span>
              {synthesis.missingFields.map((field) => field.replace(/_/g, " ")).join(", ")}
            </div>
          )}
          {synthesis.safetyFlags.length === 0 ? null : (
            <div className="mt-1 text-[11.5px] leading-5 text-[var(--oxblood)]">
              <span className="text-white/40">safety: </span>
              {synthesis.safetyFlags.join(", ")}
            </div>
          )}
        </div>
      )}

      <div className="relative">
        <div className="absolute bottom-2 left-[7px] top-2 w-px bg-white/[0.07]" aria-hidden="true" />
        <ul className="space-y-3">
          {entries.length === 0 ? (
            <li className="rounded-[10px] border border-dashed border-white/[0.1] px-3 py-3 text-[12px] text-white/56">
              No AI actions or system events have been recorded for this thread yet.
            </li>
          ) : (
            entries.map((entry) => {
              if (entry.kind === "tool") {
                const descriptor = getToolDescriptor(entry.tool);
                const stepTarget = trajectoryId !== null && latestAiStepId !== null
                  ? { kind: "step" as const, workspaceId: props.workspaceId, trajectoryId, stepId: latestAiStepId }
                  : null;
                return (
                  <li key={entry.key} className="relative pl-6">
                    <span className={cn("absolute left-0 top-1 flex size-3.5 items-center justify-center rounded-full border border-white/[0.1]", toolStatusStyles[entry.status])} aria-hidden="true">
                      <Bot className="size-2.5" />
                    </span>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/56">
                      <span className="rounded-[5px] border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[10.5px] font-medium text-white" title={descriptor.description}>{descriptor.label}</span>
                      <span className="rounded-[5px] border border-white/[0.06] bg-white/[0.02] px-1.5 py-0.5 font-mono text-[10px] text-white/40">/{entry.tool}</span>
                      <span className={cn("inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium", toolStatusStyles[entry.status])}>{entry.status.replace(/_/g, " ")}</span>
                      {entry.occurredAt === null ? null : (
                        <span className="ml-auto font-mono text-[10.5px] text-white/40">{formatTimestamp(entry.occurredAt)}</span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[12.5px] leading-5 text-white">{entry.summary}</div>
                    {entry.detail === null ? null : (
                      <div className="mt-0.5 text-[11.5px] leading-5 text-white/56">{entry.detail}</div>
                    )}
                    {stepTarget !== null ? (
                      <div className="mt-1.5">
                        <FeedbackButtons size="sm" compact target={stepTarget} label="this call" />
                      </div>
                    ) : null}
                  </li>
                );
              }
              if (entry.kind === "automation") {
                return (
                  <li key={entry.key} className="relative pl-6">
                    <span className="absolute left-0 top-1 flex size-3.5 items-center justify-center rounded-full border border-white/[0.1] bg-[var(--clay-soft)] text-[var(--clay)]" aria-hidden="true">
                      <Brain className="size-2.5" />
                    </span>
                    <div className="flex items-center gap-2 text-[11px] text-white/56">
                      <span className="rounded-[5px] border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10.5px] text-white">policy</span>
                      <span className="inline-flex rounded-full bg-[var(--clay-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--clay)]">{entry.mode.replace(/_/g, " ")}</span>
                    </div>
                    <div className="mt-0.5 text-[12.5px] leading-5 text-white">{entry.reason}</div>
                  </li>
                );
              }
              return (
                <li key={entry.key} className="relative pl-6">
                  <span className={cn("absolute left-0 top-1 flex size-3.5 items-center justify-center rounded-full border border-white/[0.1]", entry.messageKind === "ai_action" ? "bg-[var(--sage-soft)] text-[var(--sage)]" : "bg-white/[0.04] text-white/56")} aria-hidden="true">
                    <History className="size-2.5" />
                  </span>
                  <div className="flex items-center gap-2 text-[11px] text-white/56">
                    <span className="rounded-[5px] border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10.5px] text-white">{entry.messageKind === "ai_action" ? "ai action" : "system"}</span>
                    <span className="ml-auto font-mono text-[10.5px] text-white/40">{formatTimestamp(entry.occurredAt)}</span>
                  </div>
                  <div className="mt-0.5 text-[12.5px] leading-5 text-white">{entry.body}</div>
                  <div className="mt-0.5 text-[11px] leading-5 text-white/40">{entry.meta}</div>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}

export function ConversationsPageContent(props: {
  workspaceId: string;
  workspaceName: string;
  currentMemberId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const leadIdParam = searchParams.get("leadId");
  const reviewIdParam = searchParams.get("reviewId");
  const [activeFilter, setActiveFilter] = useState<ThreadFilter>("all");
  const [threads, setThreads] = useState<ConversationInboxThread[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [reply, setReply] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ConversationViewMode>("transcript");
  const [composerNowMs, setComposerNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setComposerNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  // Buyer-chat (public-listing-chat) transcripts. When the selected thread
  // is source == 'listing_chat' we load the actual visitor ↔ harwick turns
  // and render them in the transcript pane instead of the Meta-style
  // synthesis blocks.
  const [buyerChatTranscript, setBuyerChatTranscript] = useState<BuyerChatTranscript | null>(null);
  const [buyerChatTranscriptLoading, setBuyerChatTranscriptLoading] = useState(false);

  function replaceConversationQuery(thread: ConversationInboxThread | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (thread === null) {
      params.delete("leadId");
      params.delete("reviewId");
    } else {
      params.set("leadId", thread.leadId);
      if (thread.reviewId === null) {
        params.delete("reviewId");
      } else {
        params.set("reviewId", thread.reviewId);
      }
    }
    const query = params.toString();
    router.replace(query.length > 0 ? `/conversations?${query}` : "/conversations");
  }

  function openLead(thread: ConversationInboxThread) {
    router.push(`/leads?leadId=${thread.leadId}`);
  }

  const refreshThreads = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    if (!silent) {
      setLoadState("loading");
    }

    try {
      const response = await fetch(`/api/conversations?workspaceId=${props.workspaceId}&limit=30`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("conversation_fetch_failed");
      }

      const body: unknown = await response.json();
      const parsed = ConversationsInboxResponseSchema.safeParse(body);
      if (!parsed.success) {
        throw new Error("conversation_parse_failed");
      }

      const nextThreads = parsed.data.threads;

      setThreads(nextThreads);
      setSelectedId((current) => {
        if (current.length > 0 && nextThreads.some((thread) => thread.id === current)) {
          return current;
        }

        const queryMatch = nextThreads.find((thread) => {
          if (reviewIdParam !== null) {
            return thread.reviewId === reviewIdParam;
          }
          if (leadIdParam !== null) {
            return thread.leadId === leadIdParam;
          }
          return false;
        });
        return queryMatch?.id ?? nextThreads[0]?.id ?? "";
      });
      if (!silent) {
        setLoadState("ready");
      }
    } catch {
      if (!silent) {
        setThreads([]);
        setSelectedId("");
        setLoadState("error");
      }
    }
  }, [leadIdParam, props.workspaceId, reviewIdParam]);

  useEffect(() => {
    void refreshThreads();
  }, [refreshThreads]);

  useEffect(() => {
    if (loadState !== "ready") {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshThreads({ silent: true });
      }
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [loadState, refreshThreads]);

  const handleRealtimeThreadsUpdate = useCallback((
    updater: (current: ConversationInboxThread[]) => ConversationInboxThread[],
  ) => {
    setThreads((current) => updater(current));
  }, []);

  // Wire realtime subscriptions for live updates
  useRealtimeThreadSync(props.workspaceId, selectedId, handleRealtimeThreadsUpdate);

  const filteredThreads = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return threads.filter((thread) => {
      if (activeFilter !== "all" && bucketFor(thread) !== activeFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return [
        thread.name,
        thread.preview,
        thread.sourceContext,
        thread.area,
        thread.assignedTo,
      ].some((field) => field.toLowerCase().includes(normalizedSearch));
    });
  }, [activeFilter, search, threads]);

  const filterCounts = useMemo(() => {
    const counts: Record<ThreadFilter, number> = { all: threads.length, in_progress: 0, queued: 0, paused: 0, resolved: 0 };
    for (const thread of threads) {
      const bucket = bucketFor(thread);
      counts[bucket] += 1;
    }
    return counts;
  }, [threads]);

  const handledToday = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return threads.filter((thread) => thread.messages.some((message) => {
      if (message.kind !== "ai_action" && message.kind !== "sent") return false;
      const at = Date.parse(message.occurredAt);
      return Number.isFinite(at) && at >= cutoff;
    })).length;
  }, [threads]);

  useEffect(() => {
    const deepLinkedThread = threads.find((thread) => {
      if (reviewIdParam !== null) {
        return thread.reviewId === reviewIdParam;
      }
      if (leadIdParam !== null) {
        return thread.leadId === leadIdParam;
      }
      return false;
    });

    if (deepLinkedThread !== undefined && deepLinkedThread.id !== selectedId) {
      setSelectedId(deepLinkedThread.id);
      return;
    }

    if (selectedId.length > 0 && threads.some((thread) => thread.id === selectedId)) {
      return;
    }

    setSelectedId(filteredThreads[0]?.id ?? threads[0]?.id ?? "");
  }, [filteredThreads, leadIdParam, reviewIdParam, selectedId, threads]);

  const selectedThread = threads.find((thread) => thread.id === selectedId) ?? null;

  useEffect(() => {
    if (selectedThread === null) {
      setReply("");
      return;
    }

    setReply(getThreadDraft(selectedThread));
    setActionStatus(null);
  }, [selectedThread?.id]);

  // Load the buyer-chat transcript when the selected thread is a
  // public-listing-chat. Reset between threads. Best-effort: a 404 just
  // means there's no linked session, so the existing message list shows.
  useEffect(() => {
    if (selectedThread === null || selectedThread.source !== "listing_chat") {
      setBuyerChatTranscript(null);
      return;
    }
    let cancelled = false;
    setBuyerChatTranscriptLoading(true);
    fetch(`/api/conversations/listing-chat-transcript?workspaceId=${props.workspaceId}&leadId=${selectedThread.leadId}`, {
      credentials: "same-origin",
    })
      .then(async (res) => {
        if (!res.ok) {
          if (!cancelled) setBuyerChatTranscript(null);
          return;
        }
        const json = await res.json() as { transcript: BuyerChatTranscript };
        if (!cancelled) setBuyerChatTranscript(json.transcript ?? null);
      })
      .catch(() => {
        if (!cancelled) setBuyerChatTranscript(null);
      })
      .finally(() => {
        if (!cancelled) setBuyerChatTranscriptLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedThread?.id, selectedThread?.source, selectedThread?.leadId, props.workspaceId]);

  function updateThreadLocally(threadId: string, updater: (thread: ConversationInboxThread) => ConversationInboxThread) {
    setThreads((current) => current.map((thread) => (thread.id === threadId ? updater(thread) : thread)));
  }

  async function sendLeadConversationMessage(thread: ConversationInboxThread, draft: string) {
    return fetch(`/api/workspaces/${thread.workspaceId}/conversations/${thread.leadId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: thread.leadId,
        workspaceId: thread.workspaceId,
        reply: draft,
      }),
    });
  }

  async function handleQueueAction(action: "send" | "dismiss", draftOverride?: string) {
    if (selectedThread === null) {
      return;
    }

    const draft = (draftOverride ?? reply).trim();
    if (action === "send" && draft.length === 0) {
      setActionStatus("Generate or edit an AI action before sending it.");
      return;
    }

    if (selectedThread.reviewId === null && action === "dismiss") {
      updateThreadLocally(selectedThread.id, (thread) => applyLocalDismiss(thread));
      setActionStatus("Dismissed locally for this development thread.");
      return;
    }

    try {
      setActionBusy(true);
      setActionStatus("working...");

      if (selectedThread.reviewId === null) {
        const response = await sendLeadConversationMessage(selectedThread, draft);
        if (response.status === 403) {
          setActionStatus("AI sending is paused for this conversation.");
          return;
        }

        if (!response.ok) {
          const errorData = (await response.json().catch(() => ({}))) as Record<string, unknown>;
          const message = typeof errorData["error"] === "string"
            ? errorData["error"]
            : "unknown_error";
          setActionStatus(message === "unsupported_channel"
            ? "This conversation cannot send through a live provider yet."
            : message === "missing_provider_account"
              ? "This conversation is missing provider setup for live sending."
              : "The backend rejected this action.");
          return;
        }

        setReply("");
        setActionStatus("Reply sent.");
        await refreshThreads();
        return;
      }

      const response = await fetch(`/api/workspaces/${selectedThread.workspaceId}/social-queue/${selectedThread.reviewId}/action`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          action === "dismiss"
            ? { action: "dismiss", reason: "operator dismissed from conversations" }
            : { action: "send", reply: draft },
        ),
      });

      if (response.status === 403) {
        setActionStatus("Auth is required to commit this action. The endpoint is real and protected.");
        return;
      }

      if (response.status === 404) {
        updateThreadLocally(selectedThread.id, (thread) => (
          action === "dismiss" ? applyLocalDismiss(thread) : applyLocalSend(thread, draft)
        ));
        if (action === "send") {
          setReply("");
        }
        setActionStatus("Handled locally because this development thread does not have a live queue row.");
        return;
      }

      if (!response.ok) {
        setActionStatus("The backend rejected this action. Check queue state or credentials.");
        return;
      }

      if (action === "send") {
        setReply("");
      }
      setActionStatus(action === "send" ? "Reply sent through the social queue." : "AI action dismissed.");
      await refreshThreads();
    } catch {
      setActionStatus("Could not reach the send endpoint.");
    } finally {
      setActionBusy(false);
    }
  }

  async function handleGenerateAction(threadOverride?: ConversationInboxThread) {
    const targetThread = threadOverride ?? selectedThread;
    if (targetThread === null) {
      return;
    }

    try {
      setActionBusy(true);
      setActionStatus("Generating AI action...");

      const response = await fetch(
        `/api/workspaces/${targetThread.workspaceId}/harwick-assistant`,
        {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({
            message: "Draft a reply for this conversation. Match our brokerage tone, ask one qualifying question if it helps, and keep it under 80 words.",
            activeLeadId: targetThread.leadId,
            mentions: [],
            stream: false,
          }),
        },
      );

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        const errorMessage = typeof errorData["error"] === "string" ? errorData["error"] : "unknown error";
        setActionStatus(`Failed to generate action: ${errorMessage}`);
        return;
      }

      const body: unknown = await response.json();
      const record = body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : null;

      const rawReply = record?.["answer"] ?? record?.["reply"];
      const draft = typeof rawReply === "string" && rawReply.trim().length > 0
        ? rawReply.trim()
        : null;

      if (draft === null) {
        setActionStatus("AI action generated but response was empty.");
        return;
      }

      setReply(draft);
      updateThreadLocally(targetThread.id, (thread) => applyLocalDraft(thread, draft));

      const sent = (record?.["sent"] as boolean | undefined) === true;
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const reviewId = typeof (record?.["reviewId"]) === "string" ? (record["reviewId"] as string) : null;
      if (sent) {
        setActionStatus("AI action generated and sent automatically.");
      } else {
        setActionStatus("AI action generated. Ready to send.");
      }

      if (sent || reviewId !== null) {
        await refreshThreads();
      }
    } catch (error) {
      console.error("Generate action error:", error);
      setActionStatus("Could not reach the AI action endpoint.");
    } finally {
      setActionBusy(false);
    }
  }

  const filterEntries: Array<{ id: ThreadFilter; label: string }> = [
    { id: "all", label: "All" },
    { id: "in_progress", label: "In progress" },
    { id: "queued", label: "Queued" },
    { id: "paused", label: "Paused" },
    { id: "resolved", label: "Resolved" },
  ];

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden text-[var(--graphite-text)] max-md:bg-[#090a0b]">
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-3 px-5 py-4 max-md:hidden md:px-8 md:py-5">
        <div>
          <div className="mb-1 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--graphite-text-subtle)]">
            <HarwickMark size={12} tone="soft" />
            {props.workspaceName} · conversations
          </div>
          <h1 className="font-display text-[28px] font-semibold leading-[1.05] tracking-[-0.02em] text-[var(--graphite-text)] md:text-[34px]">Conversations</h1>
          <p className="mt-1 text-[12.5px] leading-5 text-[var(--graphite-text-muted)]">
            Every DM, comment, and voice call. Harwick auto-handles, queues, or pauses based on policy.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={graphitePill}>
            <span className="size-1.5 rounded-full bg-[var(--sage)]" aria-hidden="true" />
            Auto-reply enabled
          </span>
          <span className={graphitePill}>
            <Bot className="size-3 text-[var(--sage)]" aria-hidden="true" />
            {handledToday} handled today
          </span>
          <button
            className="flex size-8 items-center justify-center rounded-[9px] border border-[color:var(--graphite-line)] bg-[var(--graphite-surface-2)] text-[var(--graphite-text-muted)] shadow-[var(--shadow-elev-1)] transition hover:border-[color:var(--graphite-line-strong)] hover:bg-[var(--graphite-surface-3)] hover:text-[var(--graphite-text)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={actionBusy}
            onClick={() => void refreshThreads()}
            type="button"
            title="Refresh"
          >
            {actionBusy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="size-3.5" aria-hidden="true" />}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 gap-2.5 overflow-hidden px-2.5 pb-2.5 max-md:gap-0 max-md:px-0 max-md:pb-0">
        {/* Thread list — desktop/tablet only. On mobile we use a dropdown in the thread header. */}
        <div className="hidden w-[280px] shrink-0 flex-col overflow-hidden rounded-[var(--panel-radius-lg)] border border-[color:var(--panel-line)] bg-[color:var(--panel-1)] shadow-[var(--panel-inset-top),var(--panel-shadow-lift)] md:flex">
          <div className={cn("shrink-0 border-b px-3 py-3", graphiteBorder)}>
            <div className={cn("flex items-center gap-2 rounded-[10px] border px-2.5 py-1.5", graphiteRaised)}>
              <SearchGlyph className="size-3 text-[var(--graphite-text-subtle)]" />
              <input
                className="w-full bg-transparent text-[12.5px] text-[var(--graphite-text)] outline-none placeholder:text-[var(--graphite-text-subtle)]"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search threads…"
                value={search}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {filterEntries.map((entry) => {
                const active = activeFilter === entry.id;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setActiveFilter(entry.id)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold transition",
                      active
                        ? graphiteRaisedStrong
                        : "border-[color:var(--graphite-line)] bg-[var(--graphite-surface-2)] text-[var(--graphite-text-muted)] hover:border-[color:var(--graphite-line-strong)] hover:bg-[var(--graphite-surface-3)] hover:text-[var(--graphite-text)]",
                    )}
                  >
                    {entry.label}
                    <span className={cn("rounded-full px-1 font-mono text-[9.5px]", active ? "bg-[var(--graphite-surface-4)] text-[var(--graphite-text)]" : "bg-[var(--graphite-surface-3)] text-[var(--graphite-text-subtle)]")}>
                      {filterCounts[entry.id]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loadState === "loading" ? (
              <div className="px-4 py-6 text-center text-[12px] text-white/56">Loading live conversations…</div>
            ) : null}
            {loadState === "error" ? (
              <div className="px-4 py-6 text-center text-[12px] text-[var(--oxblood)]">Could not load conversations.</div>
            ) : null}
            {loadState === "ready" && filteredThreads.length === 0 ? (
              <div className="px-4 py-6 text-center text-[12px] text-white/56">No conversations match this filter.</div>
            ) : null}

            {loadState === "ready" && filteredThreads.map((thread) => {
              const isSelected = selectedThread?.id === thread.id;
              const status = bucketFor(thread);
              const statusChip = status === "paused"
                ? <span className="inline-flex items-center gap-1 rounded-full bg-[var(--oxblood-soft)] px-1.5 py-0.5 text-[9.5px] font-medium text-[var(--oxblood)]">paused</span>
                : status === "queued"
                  ? <span className="inline-flex items-center gap-1 rounded-full bg-[var(--clay-soft)] px-1.5 py-0.5 text-[9.5px] font-medium text-[var(--clay)]">queued</span>
                  : status === "resolved"
                    ? <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.05] px-1.5 py-0.5 text-[9.5px] font-medium text-white/52">resolved</span>
                    : null;
              return (
                <button
                  className={cn(
                    "w-full border-b border-white/[0.05] px-3 py-3 text-left transition",
                    isSelected ? "bg-[var(--graphite-surface-3)]" : "hover:bg-[var(--graphite-surface-2)]",
                  )}
                  key={thread.id}
                  onClick={() => {
                    setSelectedId(thread.id);
                    replaceConversationQuery(thread);
                  }}
                  type="button"
                >
                  <div className="mb-1 flex items-center gap-2">
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-[10px] font-medium text-white/72">
                      {thread.initials}
                    </div>
                    <div className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-white">{thread.name}</div>
                    {thread.unread ? <span className="size-1.5 shrink-0 rounded-full bg-[var(--sage)]" aria-hidden="true" /> : null}
                    <span className="shrink-0 font-mono text-[10px] text-white/40">{thread.lastTouchLabel}</span>
                  </div>
                  <div className="truncate text-[11.5px] text-white/56">{thread.preview}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <span className="inline-flex rounded-full border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[9.5px] text-white/72">
                      {thread.sourceLabel}
                    </span>
                    {statusChip}
                    {thread.intentType !== "Unknown" ? (
                      <span className="text-[10px] text-white/40">{thread.intentType}</span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[var(--panel-radius-lg)] border border-[color:var(--panel-line)] bg-[color:var(--panel-1)] shadow-[var(--panel-inset-top),var(--panel-shadow-lift)] max-md:h-full max-md:rounded-none max-md:border-0 max-md:bg-[#090a0b]">
          {selectedThread ? (
            <>
              {/* Mobile lead picker */}
              <div className={cn("flex shrink-0 items-center gap-2 border-b bg-[#101112] px-3 py-2 md:hidden", graphiteBorder)}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      aria-label="Switch conversation"
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-[color:var(--panel-line)] bg-[color:var(--panel-2)] px-2.5 py-2 text-left outline-none transition active:bg-[var(--graphite-surface-3)] data-[state=open]:border-white/[0.14]"
                      type="button"
                    >
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-[11px] font-medium text-white">
                        {selectedThread.initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] font-semibold leading-tight text-white">{selectedThread.name}</div>
                        <div className="truncate text-[10.5px] text-white/52">
                          {selectedThread.sourceLabel} · {selectedThread.score} score
                        </div>
                      </div>
                      <ChevronDown className="size-3.5 shrink-0 text-white/52" aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="harwick-shell-dark z-[80] max-h-[60vh] w-[calc(100vw-1.5rem)] rounded-[12px] border-white/[0.1] bg-[#101112] p-1.5 text-white shadow-[0_18px_42px_-18px_rgba(0,0,0,0.85)]"
                    sideOffset={6}
                  >
                    {filteredThreads.map((thread) => (
                      <DropdownMenuItem
                        className={cn(
                          "cursor-pointer rounded-[9px] px-2.5 py-2.5 text-white/72 focus:bg-white/[0.06] focus:text-white",
                          thread.id === selectedThread.id && "bg-white/[0.05] text-white",
                        )}
                        key={thread.id}
                        onSelect={() => {
                          setSelectedId(thread.id);
                          replaceConversationQuery(thread);
                        }}
                      >
                        <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-[10px] font-medium text-white/72">
                          {thread.initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12.5px] font-semibold">{thread.name}</div>
                          <div className="truncate text-[10.5px] text-white/44">
                            {thread.sourceLabel} · {thread.score} score · {thread.lastTouchLabel}
                          </div>
                        </div>
                        {thread.unread ? <span className="size-1.5 shrink-0 rounded-full bg-[var(--sage)]" aria-hidden="true" /> : null}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Desktop thread header */}
              <div className={cn("hidden shrink-0 items-center gap-3 border-b bg-[var(--graphite-surface-2)] px-4 py-3 md:flex", graphiteBorder)}>
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-[12px] font-medium text-white">
                  {selectedThread.initials}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-medium text-white">{selectedThread.name}</div>
                  <div className="flex items-center gap-1.5 text-[11px] text-white/56">
                    <span className="capitalize">{selectedThread.sourceLabel}</span>
                    <span className="size-0.5 rounded-full bg-white/[0.18]" aria-hidden="true" />
                    <span>{selectedThread.listingTitle === "no listing" ? "no listing" : selectedThread.listingTitle}</span>
                    <span className="size-0.5 rounded-full bg-white/[0.18]" aria-hidden="true" />
                    <span className={cn("font-mono text-[11px]", selectedThread.score >= 80 ? "text-[var(--oxblood)]" : "text-white/72")}>{selectedThread.score} score</span>
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-1.5">
                  <button
                    className={graphiteActionButton}
                    type="button"
                    title="Call (coming soon)"
                  >
                    <Phone className="size-3" aria-hidden="true" />
                    Call
                  </button>
                  <button
                    className={graphiteActionButton}
                    type="button"
                    title="Book tour (coming soon)"
                  >
                    <Calendar className="size-3" aria-hidden="true" />
                    Book tour
                  </button>
                  <button
                    className={graphiteActionButton}
                    onClick={() => openLead(selectedThread)}
                    type="button"
                  >
                    Open lead
                    <ArrowUpRight className="size-3" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {/* Mobile context strip — listing + actions sit under the lead picker */}
              <div className={cn("flex shrink-0 items-center gap-2 border-b bg-[#0d0e0f] px-3 py-2 md:hidden", graphiteBorder)}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/40">
                    {selectedThread.listingTitle === "no listing" ? "no listing" : "listing"}
                  </div>
                  <div className="truncate text-[12px] font-medium text-white/82">
                    {selectedThread.listingTitle === "no listing" ? selectedThread.area : selectedThread.listingTitle}
                  </div>
                </div>
                <button
                  className="flex size-9 shrink-0 items-center justify-center rounded-[9px] border border-[color:var(--graphite-line)] bg-[var(--graphite-surface-2)] text-[var(--graphite-text-muted)] transition active:bg-[var(--graphite-surface-3)]"
                  type="button"
                  title="Call"
                  aria-label="Call"
                >
                  <Phone className="size-4" aria-hidden="true" />
                </button>
                <button
                  className="flex size-9 shrink-0 items-center justify-center rounded-[9px] border border-[color:var(--graphite-line)] bg-[var(--graphite-surface-2)] text-[var(--graphite-text-muted)] transition active:bg-[var(--graphite-surface-3)]"
                  type="button"
                  title="Book tour"
                  aria-label="Book tour"
                >
                  <Calendar className="size-4" aria-hidden="true" />
                </button>
                <button
                  className="flex size-9 shrink-0 items-center justify-center rounded-[9px] border border-[color:var(--graphite-line)] bg-[var(--graphite-surface-2)] text-[var(--graphite-text-muted)] transition active:bg-[var(--graphite-surface-3)]"
                  onClick={() => openLead(selectedThread)}
                  type="button"
                  title="Open lead"
                  aria-label="Open lead"
                >
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </button>
              </div>

              <div className={cn("shrink-0 border-b bg-[#0d0e0f] px-3 py-2 md:bg-[var(--graphite-surface-2)] md:px-4", graphiteBorder)}>
                <div className={graphiteSegmented}>
                  <button
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[11.5px] font-semibold transition",
                      viewMode === "transcript" ? "bg-[var(--graphite-text)] text-[var(--graphite-0)] shadow-[var(--shadow-elev-1)]" : "text-[var(--graphite-text-muted)] hover:text-[var(--graphite-text)]",
                    )}
                    onClick={() => setViewMode("transcript")}
                    type="button"
                  >
                    <MessageSquare className="size-3" aria-hidden="true" />
                    Transcript
                  </button>
                  <button
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[11.5px] font-semibold transition",
                      viewMode === "activity" ? "bg-[var(--graphite-text)] text-[var(--graphite-0)] shadow-[var(--shadow-elev-1)]" : "text-[var(--graphite-text-muted)] hover:text-[var(--graphite-text)]",
                    )}
                    onClick={() => setViewMode("activity")}
                    type="button"
                  >
                    <History className="size-3" aria-hidden="true" />
                    Activity log
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {viewMode === "transcript" ? (
                  <div className="px-3 py-3 md:px-5 md:py-4">
                    <div className="my-3 flex items-center justify-center gap-2 text-[11px] text-white/40">
                      <span className="h-px flex-1 bg-white/[0.06]" aria-hidden="true" />
                      <span className="rounded-full border border-white/[0.07] bg-white/[0.025] px-2.5 py-1 text-white/60">
                        {selectedThread.source === "listing_chat" ? "Buyer chat transcript" : threadTimelineLabel(selectedThread)}
                      </span>
                      <span className="h-px flex-1 bg-white/[0.06]" aria-hidden="true" />
                    </div>

                    {selectedThread.source === "listing_chat" ? (
                      <BuyerChatTranscriptView
                        transcript={buyerChatTranscript}
                        loading={buyerChatTranscriptLoading}
                      />
                    ) : (
                      selectedThread.messages.map((message) => (
                        <MessageBubble
                          avatar={selectedThread.initials}
                          disabled={actionBusy}
                          key={message.id}
                          message={message}
                          workspaceId={props.workspaceId}
                        />
                      ))
                    )}
                  </div>
                ) : (
                  <ActivityLog thread={selectedThread} workspaceId={props.workspaceId} />
                )}
              </div>

              {selectedThread.source === "listing_chat" ? (
                <div
                  className={cn("shrink-0 border-t bg-[#101112] px-3 py-2.5 text-[11.5px] text-white/64 md:bg-[var(--graphite-surface-2)] md:px-4 md:py-3", graphiteBorder)}
                  style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
                >
                  <div className="flex items-center gap-2">
                    <Bot className="size-3.5 text-[var(--sage)]" aria-hidden="true" />
                    <span>
                      Harwick is handling this conversation live on the listing page. No reply needed from you.
                    </span>
                  </div>
                </div>
              ) : (
                <div
                  className={cn("shrink-0 border-t bg-[#101112] px-3 py-2.5 md:bg-[var(--graphite-surface-2)] md:px-4 md:py-3", graphiteBorder)}
                  style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
                >
                  <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-white/56">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 truncate">{composerContextLabel(selectedThread)}</span>
                      <MessagingWindowIndicator thread={selectedThread} nowMs={composerNowMs} />
                    </div>
                    <button
                      className="inline-flex shrink-0 items-center gap-1 rounded-[9px] border border-[color:var(--graphite-line)] bg-[var(--graphite-text)] px-2.5 py-1 text-[11px] font-semibold text-[var(--graphite-0)] shadow-[var(--shadow-elev-1)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={actionBusy}
                      onClick={() => void handleGenerateAction()}
                      type="button"
                    >
                      <Bot className="size-3 text-[var(--sage)]" aria-hidden="true" />
                      Generate draft
                    </button>
                  </div>
                  <LeadActionToolbar
                    workspaceId={selectedThread.workspaceId}
                    leadId={selectedThread.leadId}
                    automationMode={selectedThread.automationMode ?? "ai_on"}
                    assignedMemberId={null}
                    currentMemberId={props.currentMemberId}
                    appearance="dark"
                    draft={reply}
                    reviewId={selectedThread.reviewId}
                    showAgentSteps={false}
                    onDraftChange={(next) => setReply(next)}
                    onChanged={() => void refreshThreads({ silent: true })}
                  />
                  {actionStatus ? (
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-white/64">
                      <AlertCircle className="size-3 shrink-0" aria-hidden="true" />
                      <span>{actionStatus}</span>
                    </div>
                  ) : null}
                </div>
              )}
            </>
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center px-8">
              <div className="max-w-[320px] text-center">
                <div className="text-[15px] font-medium text-white">Pick a live conversation</div>
                <div className="mt-2 text-[12.5px] leading-6 text-white/56">
                  Search, filter, or wait for inbound lead events. The center thread stays tied to the live workspace backend.
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="hidden w-[320px] shrink-0 flex-col overflow-y-auto rounded-[var(--panel-radius-lg)] border border-[color:var(--panel-line)] bg-[color:var(--panel-1)] shadow-[var(--panel-inset-top),var(--panel-shadow-lift)] lg:flex">
          {selectedThread ? (
            <>
              <div className="border-b border-white/[0.06] px-4 py-4">
                <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-white/52">
                  <Bot className="size-3 text-[var(--sage)]" aria-hidden="true" />
                  AI mental model
                </div>
                <dl className="space-y-1.5 text-[12.5px]">
                  <div className="flex items-start gap-2">
                    <dt className="w-[72px] shrink-0 text-white/40">Intent</dt>
                    <dd className="flex-1 font-medium text-white">{selectedThread.intentType}</dd>
                    {selectedThread.aiSynthesis !== null ? (
                      <FeedbackButtons
                        size="sm"
                        compact
                        target={{ kind: "surface", workspaceId: props.workspaceId, surface: "synthesis_field", resourceId: `${selectedThread.leadId}:intent`, context: { field: "intentType", value: selectedThread.intentType } }}
                      />
                    ) : null}
                  </div>
                  <div className="flex items-start gap-2">
                    <dt className="w-[72px] shrink-0 text-white/40">Score</dt>
                    <dd className="flex-1 font-medium text-white">{selectedThread.score} · {selectedThread.scoreLabel}</dd>
                    <FeedbackButtons
                      size="sm"
                      compact
                      target={{ kind: "surface", workspaceId: props.workspaceId, surface: "synthesis_field", resourceId: `${selectedThread.leadId}:score`, context: { field: "score", value: selectedThread.score } }}
                    />
                  </div>
                  <div className="flex items-start gap-2">
                    <dt className="w-[72px] shrink-0 text-white/40">Stage</dt>
                    <dd className="flex-1">
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10.5px] font-medium",
                        selectedThread.stageTone === "qualified" ? "bg-[var(--sage-soft)] text-[var(--sage)]" :
                        selectedThread.stageTone === "new" || selectedThread.stageTone === "review" ? "bg-[var(--clay-soft)] text-[var(--clay)]" :
                        selectedThread.stageTone === "lost" ? "bg-[var(--oxblood-soft)] text-[var(--oxblood)]" :
                        "bg-white/[0.05] text-white/72")}>
                        {selectedThread.stageLabel}
                      </span>
                    </dd>
                  </div>
                  <div className="flex items-start gap-2">
                    <dt className="w-[72px] shrink-0 text-white/40">Budget</dt>
                    <dd className={cn("flex-1", selectedThread.budget === "Unknown" ? "text-white/40" : "font-medium text-white")}>
                      {selectedThread.budget}
                    </dd>
                  </div>
                  <div className="flex items-start gap-2">
                    <dt className="w-[72px] shrink-0 text-white/40">Timeline</dt>
                    <dd className={cn("flex-1 truncate", selectedThread.timeline === "Unknown" ? "text-white/40" : "font-medium text-white")}>
                      {selectedThread.timeline}
                    </dd>
                  </div>
                  <div className="flex items-start gap-2">
                    <dt className="w-[72px] shrink-0 text-white/40">Area</dt>
                    <dd className={cn("flex-1", selectedThread.area.toLowerCase() === "unknown" ? "text-white/40" : "font-medium text-white")}>
                      {selectedThread.area}
                    </dd>
                  </div>
                  <div className="flex items-start gap-2">
                    <dt className="w-[72px] shrink-0 text-white/40">Assigned</dt>
                    <dd className="flex-1 font-medium text-white">{selectedThread.assignedTo}</dd>
                  </div>
                  {selectedThread.aiSynthesis !== null && selectedThread.aiSynthesis.missingFields.length > 0 ? (
                    <div className="flex items-start gap-2">
                      <dt className="w-[72px] shrink-0 text-white/40">Missing</dt>
                      <dd className="flex-1 text-white/56">
                        {selectedThread.aiSynthesis.missingFields.map((field) => field.replace(/_/g, " ")).join(", ")}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </div>

              <div className="border-b border-white/[0.06] px-4 py-4">
                <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-white/52">
                  Listing facts referenced
                </div>
                <div className="rounded-[8px] border border-white/[0.07] bg-white/[0.025] p-2.5 text-[12px] text-white/64">
                  <div className="mb-0.5 font-medium text-white">{selectedThread.listingTitle}</div>
                  <div>{selectedThread.listingDetails}</div>
                  <div
                    className={cn(
                      "mt-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10.5px] font-medium",
                      selectedThread.listingStatus === "AI action ready" || selectedThread.listingStatus === "FUB synced"
                        ? "bg-[var(--sage-soft)] text-[var(--sage)]"
                        : "bg-[var(--clay-soft)] text-[var(--clay)]",
                    )}
                  >
                    {selectedThread.listingStatus}
                  </div>
                </div>
              </div>

              {selectedThread.aiSynthesis !== null && selectedThread.aiSynthesis.toolActivity.length > 0 ? (
                <div className="border-b border-white/[0.06] px-4 py-4">
                  <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-white/52">
                    Tools used this turn
                  </div>
                  <div className="space-y-1.5">
                    {selectedThread.aiSynthesis.toolActivity.map((activity) => {
                      const descriptor = getToolDescriptor(activity.tool);
                      const trajectoryId = selectedThread.messages.find((message) => message.agentTrajectoryId != null)?.agentTrajectoryId ?? null;
                      const latestAiStepId = [...selectedThread.messages].reverse().find((message) => message.kind === "ai_action" && message.agentStepId != null)?.agentStepId ?? null;
                      const stepTarget = trajectoryId !== null && latestAiStepId !== null
                        ? { kind: "step" as const, workspaceId: props.workspaceId, trajectoryId, stepId: latestAiStepId }
                        : null;
                      return (
                        <div
                          key={activity.id}
                          className="rounded-[8px] border border-white/[0.07] bg-white/[0.025] px-2.5 py-2"
                          title={descriptor.description}
                        >
                          <div className="flex items-center gap-1.5 text-[11px]">
                            <span className="size-1.5 rounded-full bg-[var(--sage)]" aria-hidden="true" />
                            <span className="font-medium text-white">{descriptor.label}</span>
                            <span className="ml-auto font-mono text-[10px] text-white/40">{activity.status.replace(/_/g, " ")}</span>
                          </div>
                          <div className="mt-0.5 font-mono text-[10.5px] text-white/40">/{activity.tool}</div>
                          {activity.detail === null ? null : (
                            <div className="mt-1 text-[11.5px] leading-5 text-white/64">{activity.detail}</div>
                          )}
                          {stepTarget !== null ? (
                            <div className="mt-1.5 flex items-center justify-between">
                              <span className="text-[10px] text-white/40">{descriptor.external ? "external action" : "internal"}</span>
                              <FeedbackButtons size="sm" compact target={stepTarget} />
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="border-b border-white/[0.06] px-4 py-4">
                <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-white/52">Safety</div>
                <div className="flex items-center gap-2 text-[12.5px]">
                  {selectedThread.aiSynthesis !== null && selectedThread.aiSynthesis.safetyFlags.length > 0 ? (
                    <>
                      <span className="size-2 rounded-full bg-[var(--oxblood)]" aria-hidden="true" />
                      <span className="text-white">{selectedThread.aiSynthesis.safetyFlags.join(", ")}</span>
                    </>
                  ) : (
                    <>
                      <span className="size-2 rounded-full bg-[var(--sage)]" aria-hidden="true" />
                      <span className="text-white">Clear · no fair-housing or lending flags</span>
                    </>
                  )}
                </div>
              </div>

              <div className="border-b border-white/[0.06] px-4 py-4">
                <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-white/52">Automation</div>
                <div className="rounded-[8px] border border-white/[0.07] bg-white/[0.025] p-2.5 text-[12px] text-white/64">
                  <div className="flex items-center gap-2 text-white">
                    <ShieldCheck className="size-3.5" aria-hidden="true" />
                    <span className="font-medium">{(selectedThread.automationMode ?? "manual only").replace(/_/g, " ")}</span>
                  </div>
                  <div className="mt-1 leading-5">
                    {selectedThread.automationReason ?? "No live automation review is attached to this thread yet."}
                  </div>
                </div>
              </div>

              <div className="px-4 py-4">
                <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-white/52">Suggested next</div>
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    className={cn(graphiteActionButton, "py-2 text-left text-[12px]")}
                    onClick={() => void handleGenerateAction()}
                    disabled={actionBusy}
                  >
                    <Bot className="size-3 text-[var(--sage)]" aria-hidden="true" />
                    Generate a draft for this thread
                  </button>
                  <button
                    type="button"
                    className={cn(graphiteActionButton, "py-2 text-left text-[12px]")}
                    onClick={() => openLead(selectedThread)}
                  >
                    <ArrowUpRight className="size-3" aria-hidden="true" />
                    Open full lead profile
                  </button>
                  {selectedThread.reviewId !== null ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-[8px] border border-[var(--oxblood)]/30 bg-[var(--oxblood-soft)] px-2.5 py-2 text-left text-[12px] text-[var(--oxblood)] transition hover:border-[var(--oxblood)]/50 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={actionBusy}
                      onClick={() => void handleQueueAction("dismiss")}
                    >
                      <AlertCircle className="size-3" aria-hidden="true" />
                      Dismiss the pending AI action
                    </button>
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <div className="px-4 py-5 text-[12px] leading-5 text-white/52">
              Lead context will appear here once you select a live thread.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
