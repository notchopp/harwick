"use client";

import { MessagesSquare, User } from "lucide-react";
import { useEffect, useState } from "react";

import type { BuyerChatThread } from "./listing-chats-data";

/**
 * Buyer-chat threads section for /conversations. Surfaces public-listing-chat
 * sessions (in-progress + recently active) as their own threads with the
 * Harwick-generated visitor headline, life context, and the last 2 visitor
 * turns inline.
 *
 * This is the "convos refactor begin" — first time these sessions are
 * first-class operator objects on the conversations surface, not buried
 * behind a lead promotion.
 *
 * Loaded from /api/conversations/listing-chats which is workspace-scoped
 * and operator-authed.
 */
export function BuyerChatThreadsSection(props: { workspaceId: string }) {
  const [threads, setThreads] = useState<BuyerChatThread[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(
          `/api/conversations/listing-chats?workspaceId=${props.workspaceId}&limit=20`,
          { credentials: "same-origin" },
        );
        if (!res.ok) {
          if (!cancelled) setError(`error_${res.status}`);
          return;
        }
        const json = await res.json() as { threads: BuyerChatThread[] };
        if (!cancelled) setThreads(json.threads ?? []);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "load_failed");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [props.workspaceId]);

  if (error !== null) {
    return (
      <div className="rounded-[14px] border border-[color:var(--graphite-line)] bg-[var(--graphite-surface-2)] p-4 text-[12px] text-white/56">
        Could not load buyer chats ({error}).
      </div>
    );
  }
  if (threads === null) {
    return (
      <div className="rounded-[14px] border border-[color:var(--graphite-line)] bg-[var(--graphite-surface-2)] p-4 text-[12px] text-white/48">
        Loading buyer chats…
      </div>
    );
  }
  if (threads.length === 0) {
    return (
      <div className="rounded-[14px] border border-[color:var(--graphite-line)] bg-[var(--graphite-surface-2)] p-4 text-[12px] text-white/56">
        No buyer chats yet. When a buyer lands on your listing site and starts a conversation, it shows up here.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessagesSquare aria-hidden="true" className="h-4 w-4 text-white/64" strokeWidth={1.8} />
          <h2 className="text-[13px] font-semibold text-white/86">Buyer chats</h2>
          <span className="rounded-full border border-[color:var(--graphite-line)] bg-[var(--graphite-surface-3)] px-2 py-0.5 text-[10.5px] font-semibold text-white/64">
            {threads.length}
          </span>
        </div>
        <span className="text-[11px] text-white/48">
          Live qualification from listing-page conversations.
        </span>
      </div>
      <div className="grid gap-2.5">
        {threads.map((thread) => (
          <BuyerChatThreadRow key={thread.sessionId} thread={thread} />
        ))}
      </div>
    </div>
  );
}

function BuyerChatThreadRow({ thread }: { thread: BuyerChatThread }) {
  const headline = thread.visitorHeadline ?? thread.qualificationSummary ?? "Live conversation in progress";
  const visitorLabel = thread.visitorName ?? "Anonymous visitor";
  const lastTurn = thread.recentVisitorTurns[0]?.body;
  const lastTurnPreview = lastTurn === undefined
    ? null
    : lastTurn.length > 140 ? `${lastTurn.slice(0, 137)}…` : lastTurn;
  const promotedTag = thread.promotedLeadId === null
    ? { label: "in conversation", tone: "neutral" as const }
    : { label: "promoted to lead", tone: "positive" as const };

  return (
    <article className="group rounded-[14px] border border-[color:var(--graphite-line)] bg-[var(--graphite-surface-2)] p-4 shadow-[var(--shadow-elev-1)] transition hover:border-[color:var(--graphite-line-strong)] hover:bg-[var(--graphite-surface-3)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] text-white/56">
            <User aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.7} />
            <span className="truncate">{visitorLabel}</span>
            <span className="text-white/30">·</span>
            <span className="truncate">{thread.listingAddress}</span>
          </div>
          <div className="mt-1.5 truncate text-[13px] font-medium text-white/88">
            {headline}
          </div>
          {lastTurnPreview === null ? null : (
            <div className="mt-1 line-clamp-2 text-[12px] text-white/64">
              <span className="text-white/40">›</span> {lastTurnPreview}
            </div>
          )}
          {thread.lifeContext.length === 0 ? null : (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {thread.lifeContext.slice(0, 3).map((entry) => (
                <span
                  key={entry}
                  className="rounded-full border border-[color:var(--graphite-line)] bg-[var(--graphite-surface-3)] px-2 py-0.5 text-[10.5px] font-medium text-white/68"
                >
                  {entry}
                </span>
              ))}
              {thread.lifeContext.length > 3 ? (
                <span className="rounded-full border border-[color:var(--graphite-line)] px-2 py-0.5 text-[10.5px] font-medium text-white/52">
                  +{thread.lifeContext.length - 3}
                </span>
              ) : null}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5 text-right">
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
              promotedTag.tone === "positive"
                ? "border-[var(--sage)]/35 bg-[var(--sage-soft)] text-[var(--sage)]"
                : "border-[color:var(--graphite-line)] bg-[var(--graphite-surface-3)] text-white/64"
            }`}
          >
            {promotedTag.label}
          </span>
          <span className="text-[10.5px] text-white/48">
            {thread.turnCount} {thread.turnCount === 1 ? "turn" : "turns"}
          </span>
          <span className="text-[10px] text-white/40">
            {new Date(thread.lastActiveAt).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>
    </article>
  );
}
