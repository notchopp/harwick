"use client";

import {
  ConversationsInboxResponseSchema,
  type ConversationInboxMessage,
  type ConversationInboxSource,
  type ConversationInboxStageTone,
  type ConversationInboxThread,
} from "@realty-ops/core";
import { AlertCircle, ArrowUpRight, Bot, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SearchGlyph } from "../../components/harwick-icons";
import { WorkspaceTopbar } from "../../components/workspace-topbar";
import { cn } from "../../lib/utils";
import {
  appendConversationLeadMessage,
  conversationSandboxPromptLibrary,
  isConversationSandboxThread,
} from "./conversation-sandbox";
import {
  draftConversationSandboxReplySet,
  type SandboxReplySet,
} from "./conversation-sandbox-reply";
import { useRealtimeThreadSync } from "./use-realtime-thread-sync";
import { LeadActionToolbar } from "./lead-action-toolbar";

type ThreadFilter = "all" | "dms" | "comments";
type LoadState = "loading" | "ready" | "error";

const sourceBadgeStyles: Record<ConversationInboxSource, string> = {
  instagram: "bg-[#F0E5F5] text-[#5B2D7B]",
  facebook: "bg-[#E5EBF5] text-[#1A3A6B]",
  voice: "bg-sage-soft text-qualified",
  sms: "bg-sage-soft text-qualified",
  manual: "bg-surface-muted text-muted-subtle",
};

const stageBadgeStyles: Record<ConversationInboxStageTone, string> = {
  new: "bg-brass-soft text-warm",
  qualified: "bg-sage-soft text-qualified",
  nurture: "bg-surface-muted text-muted-subtle",
  review: "bg-brass-soft text-warm",
  lost: "bg-oxblood-soft text-hot",
};

function FilterChip(props: { active: boolean; children: string; onClick: () => void }) {
  return (
    <button
      className={cn(
        "harwick-pill px-[10px] py-[3px] text-[11px] text-muted transition-all hover:-translate-y-px hover:border-border-strong hover:text-foreground",
        props.active && "harwick-pill-active hover:border-harwick-ink hover:text-white",
      )}
      onClick={props.onClick}
      type="button"
    >
      {props.children}
    </button>
  );
}

function ListEmptyState(props: { title: string; detail: string }) {
  return (
    <div className="px-4 py-6 text-center">
      <div className="text-[12.5px] font-medium text-foreground">{props.title}</div>
      <div className="mt-1 text-[11.5px] leading-5 text-muted">{props.detail}</div>
    </div>
  );
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

function MessageBubble(props: {
  avatar: string;
  disabled: boolean;
  message: ConversationInboxMessage;
}) {
  if (props.message.kind === "system") {
    return (
      <div className="mb-3 flex justify-center">
        <div className="rounded-full border border-border bg-surface px-3 py-1.5 text-[11px] text-muted">
          {props.message.body}
        </div>
      </div>
    );
  }

  if (props.message.kind === "sent") {
    return (
      <div className="mb-3 flex justify-end">
        <div className="max-w-[76%] rounded-[13px_4px_13px_13px] bg-foreground px-3 py-[9px] text-[12.5px] leading-[1.5] text-white">
          {props.message.body}
          <div className="mt-1 text-[10px] text-white/70">{props.message.meta}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-3 flex gap-[9px]">
      <div
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-medium",
          props.message.kind === "ai_action" ? "bg-brass-soft text-warm" : "bg-surface-muted text-muted",
        )}
      >
        {props.message.kind === "ai_action" ? "AI" : props.avatar}
      </div>

      <div>
        <div
          className={cn(
            "max-w-[72%] px-3 py-[9px] text-[12.5px] leading-[1.5]",
            props.message.kind === "lead" && "rounded-[4px_13px_13px_13px] bg-surface-muted text-foreground",
            props.message.kind === "ai_action" && "rounded-[4px_13px_13px_13px] border border-dashed border-[#E8D08A] bg-brass-soft text-foreground",
          )}
        >
          {props.message.kind === "ai_action" ? (
            <>
              <div className="mb-1 text-[9px] font-medium uppercase tracking-[0.1em] text-warm">
                {props.message.meta}
              </div>
              {props.message.body}
            </>
          ) : (
            props.message.body
          )}
        </div>
        {props.message.kind === "lead" ? (
          <div className="mt-0.5 text-[10px] text-muted-subtle">{props.message.meta}</div>
        ) : null}
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
  const [sandboxLeadMessage, setSandboxLeadMessage] = useState("");
  const [sandboxReplySets, setSandboxReplySets] = useState<Record<string, SandboxReplySet>>({});
  const [actionBusy, setActionBusy] = useState(false);
  const [actionStatus, setActionStatus] = useState<string | null>(null);

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

  // Wire realtime subscriptions for live updates
  useRealtimeThreadSync(props.workspaceId, selectedId, threads, (updater) => {
    setThreads((current) => updater(current));
  });

  const filteredThreads = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return threads.filter((thread) => {
      if (activeFilter !== "all" && thread.bucket !== activeFilter) {
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
      setSandboxLeadMessage("");
      return;
    }

    setReply(getThreadDraft(selectedThread));
    setSandboxLeadMessage("");
    setActionStatus(null);
  }, [selectedThread?.id]);

  function updateThreadLocally(threadId: string, updater: (thread: ConversationInboxThread) => ConversationInboxThread) {
    setThreads((current) => current.map((thread) => (thread.id === threadId ? updater(thread) : thread)));
  }

  function applySandboxSuggestion(threadId: string, draft: string) {
    setReply(draft);
    updateThreadLocally(threadId, (thread) => applyLocalDraft(thread, draft));
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

    if (isConversationSandboxThread(targetThread)) {
      const replySet = draftConversationSandboxReplySet(targetThread);
      setSandboxReplySets((current) => ({
        ...current,
        [targetThread.id]: replySet,
      }));
      setReply(replySet.primary.reply);
      updateThreadLocally(targetThread.id, (thread) => applyLocalDraft(thread, replySet.primary.reply));
      setActionStatus(`Generated ${replySet.suggestions.length} sandbox suggestions.`);
      return;
    }

    try {
      setActionBusy(true);
      setActionStatus("Generating AI action...");

      const response = await fetch(
        `/api/workspaces/${targetThread.workspaceId}/harwick-ai/generate-action`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ leadId: targetThread.leadId }),
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

      const rawReply = record?.["reply"];
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

  async function handleSandboxLeadTurn(messageOverride?: string) {
    if (selectedThread === null || !isConversationSandboxThread(selectedThread)) {
      return;
    }

    const inboundMessage = (messageOverride ?? sandboxLeadMessage).trim();
    if (inboundMessage.length === 0) {
      setActionStatus("Write the next inbound lead message first.");
      return;
    }

    const updatedThread = appendConversationLeadMessage(selectedThread, inboundMessage);
    updateThreadLocally(selectedThread.id, () => updatedThread);
    setSandboxLeadMessage("");
    setReply("");
    setActionStatus("Sandbox lead message added. Generating the next Harwick action...");
    await handleGenerateAction(updatedThread);
  }

  const sandboxMode = selectedThread !== null && isConversationSandboxThread(selectedThread);
  const activeSandboxReplySet = selectedThread === null ? null : (sandboxReplySets[selectedThread.id] ?? null);
  const selectedSandboxThreadId = sandboxMode ? selectedThread?.id ?? null : null;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <WorkspaceTopbar context={`conversations · ${filteredThreads.length} shown`} workspaceName={props.workspaceName}>
        <div className="ml-auto flex items-center gap-2">
          <button
            className="harwick-control flex h-9 w-9 items-center justify-center text-muted transition-all hover:-translate-y-px hover:border-border-strong hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
            disabled={actionBusy}
            onClick={() => void refreshThreads()}
            type="button"
          >
            {actionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
          <div className="harwick-control flex w-[180px] items-center gap-[7px] px-[11px] py-[5px] text-[12px] text-muted-subtle">
            <SearchGlyph className="h-3 w-3 shrink-0" />
            <input
              className="w-full bg-transparent outline-none placeholder:text-muted-subtle"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search..."
              value={search}
            />
          </div>
        </div>
      </WorkspaceTopbar>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="w-[252px] shrink-0 overflow-y-auto border-r border-border bg-surface">
          <div className="flex gap-[5px] border-b border-border px-3 py-[10px]">
            <FilterChip active={activeFilter === "all"} onClick={() => setActiveFilter("all")}>
              All
            </FilterChip>
            <FilterChip active={activeFilter === "dms"} onClick={() => setActiveFilter("dms")}>
              DMs
            </FilterChip>
            <FilterChip active={activeFilter === "comments"} onClick={() => setActiveFilter("comments")}>
              Comments
            </FilterChip>
          </div>

          {loadState === "loading" ? (
            <ListEmptyState title="Loading live conversations" detail="Pulling workspace lead events and pending AI actions." />
          ) : null}
          {loadState === "error" ? (
            <ListEmptyState title="Could not load conversations" detail="The conversations endpoint did not return a valid workspace response." />
          ) : null}
          {loadState === "ready" && filteredThreads.length === 0 ? (
            <ListEmptyState title="No live conversations yet" detail="New lead events will appear here once the workspace starts receiving messages or calls." />
          ) : null}

          {loadState === "ready" && filteredThreads.map((thread) => {
            const isSelected = selectedThread?.id === thread.id;

            return (
              <button
                className={cn(
                  "w-full border-b border-border px-[14px] py-[13px] text-left transition-colors",
                  isSelected ? "bg-surface-muted" : "hover:bg-surface-muted",
                )}
                key={thread.id}
                onClick={() => {
                  setSelectedId(thread.id);
                  replaceConversationQuery(thread);
                }}
                type="button"
              >
                <div className="mb-1 flex items-center gap-[7px]">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-muted text-[10px] font-medium text-muted">
                    {thread.initials}
                  </div>
                  <div className="min-w-0 flex-1 text-[12.5px] font-medium">{thread.name}</div>
                  {thread.unread ? <div className="h-[7px] w-[7px] shrink-0 rounded-full bg-harwick-brass" /> : null}
                  <div className="shrink-0 text-[11px] text-muted-subtle">{thread.lastTouchLabel}</div>
                </div>

                <div className="truncate text-[11.5px] text-muted">
                  {thread.preview}
                </div>

                <div className="mt-1">
                  <span className={cn("inline-flex rounded-full px-[7px] py-0.5 text-[9px] font-medium", sourceBadgeStyles[thread.source])}>
                    {thread.sourceLabel}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {selectedThread ? (
            <>
              <div className="flex shrink-0 items-center gap-[9px] border-b border-border bg-surface px-[14px] py-[11px]">
                <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-surface-muted text-[11px] font-medium text-muted">
                  {selectedThread.initials}
                </div>
                <div>
                  <div className="text-[13.5px] font-medium">{selectedThread.name}</div>
                  <div className="flex items-center gap-[5px] text-[11px] text-muted-subtle">
                    <span className={cn("inline-flex rounded-full px-[7px] py-0.5 text-[9px] font-medium", sourceBadgeStyles[selectedThread.source])}>
                      {selectedThread.sourceLabel}
                    </span>
                    {selectedThread.sourceContext}
                  </div>
                </div>
                <div className="ml-auto flex gap-[7px]">
                  <button
                    className="rounded-[8px] border border-border bg-transparent px-[11px] py-[4px] text-[11px] font-medium text-muted transition-colors hover:border-border-strong hover:text-foreground"
                    onClick={() => openLead(selectedThread)}
                    type="button"
                  >
                    View Lead
                  </button>
                </div>
              </div>

              <div className="shrink-0 border-b border-border bg-surface px-[14px] py-[10px]">
                <div className="grid grid-cols-4 gap-3 text-[11px]">
                  <div className="flex flex-col gap-1">
                    <span className="font-medium text-muted-subtle">Score</span>
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-full rounded-full bg-gray-200">
                        <div
                          className="bg-gradient-to-r from-yellow-400 to-green-500 h-1.5 rounded-full"
                          style={{ width: `${Math.min(selectedThread.score, 100)}%` }}
                        />
                      </div>
                      <span className="w-5 text-right font-semibold">{selectedThread.score}</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className="font-medium text-muted-subtle">Budget</span>
                    <span className="text-foreground">{selectedThread.budget}</span>
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className="font-medium text-muted-subtle">Timeline</span>
                    <span className="truncate text-foreground">{selectedThread.timeline}</span>
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className="font-medium text-muted-subtle">Intent</span>
                    <span className="text-foreground">{selectedThread.intentType}</span>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-[18px] py-[18px]">
                <div className="relative my-[14px] text-center text-[11px] text-muted-subtle">
                  <span className="bg-background px-3">{threadTimelineLabel(selectedThread)}</span>
                  <div className="absolute left-0 top-1/2 h-px w-[calc(50%-40px)] bg-border" />
                  <div className="absolute right-0 top-1/2 h-px w-[calc(50%-40px)] bg-border" />
                </div>

                {selectedThread.messages.map((message) => (
                  <MessageBubble
                    avatar={selectedThread.initials}
                    disabled={actionBusy}
                    key={message.id}
                    message={message}
                  />
                ))}
              </div>

              <div className="shrink-0 border-t border-border bg-surface px-[14px] py-3">
                {sandboxMode ? (
                  <div className="mb-3 rounded-[10px] border border-border bg-surface-muted p-3">
                    <div className="mb-2 text-[9.5px] font-medium uppercase tracking-[0.12em] text-muted-subtle">
                      Sandbox lead simulator
                    </div>
                    <div className="mb-2 flex flex-wrap gap-2">
                      {conversationSandboxPromptLibrary.map((prompt) => (
                      <button
                        className="harwick-pill px-[10px] py-[4px] text-[10.5px] font-medium text-muted transition-all hover:-translate-y-px hover:border-border-strong hover:text-foreground"
                          key={prompt.id}
                          onClick={() => setSandboxLeadMessage(prompt.message)}
                          type="button"
                        >
                          {prompt.label}
                        </button>
                      ))}
                    </div>
                    <textarea
                      className="harwick-control min-h-[52px] w-full resize-none px-[11px] py-[9px] text-[12px] placeholder:text-muted-subtle"
                      onChange={(event) => setSandboxLeadMessage(event.target.value)}
                      placeholder="Type the next inbound DM or comment you want Harwick to answer..."
                      value={sandboxLeadMessage}
                    />
                    <div className="mt-2 flex items-center gap-3">
                      <div className="flex-1 text-[11px] text-muted-subtle">
                        This appends a local lead message and generates a full Harwick suggestion set for the next turn.
                      </div>
                      <button
                        className="harwick-pill px-[11px] py-[4px] text-[11px] font-medium text-muted transition-all hover:-translate-y-px hover:border-border-strong hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={actionBusy}
                        onClick={() => void handleSandboxLeadTurn()}
                        type="button"
                      >
                        Simulate Lead Message
                      </button>
                    </div>
                    {activeSandboxReplySet ? (
                      <div className="mt-3 rounded-[9px] border border-border bg-surface p-3">
                        <div className="text-[9.5px] font-medium uppercase tracking-[0.12em] text-muted-subtle">
                          Harwick read
                        </div>
                        <div className="mt-1 text-[11.5px] leading-5 text-foreground">
                          {activeSandboxReplySet.coachNote}
                        </div>
                        {activeSandboxReplySet.detectedSignals.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {activeSandboxReplySet.detectedSignals.map((signal) => (
                              <span
                                className="rounded-full border border-border bg-surface-muted px-[8px] py-[3px] text-[10px] text-muted"
                                key={signal}
                              >
                                {signal}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <div className="mt-3 grid gap-2">
                          {activeSandboxReplySet.suggestions.map((suggestion) => {
                            const active = reply.trim() === suggestion.reply.trim();
                            return (
                              <button
                                className={cn(
                                  "rounded-[9px] border px-3 py-2 text-left transition-colors",
                                  active
                                    ? "border-foreground bg-surface-muted"
                                    : "border-border bg-white hover:border-border-strong hover:bg-surface-muted",
                                )}
                                key={suggestion.id}
                                onClick={() => {
                                  if (selectedSandboxThreadId !== null) {
                                    applySandboxSuggestion(selectedSandboxThreadId, suggestion.reply);
                                  }
                                }}
                                type="button"
                              >
                                <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-subtle">
                                  {suggestion.label}
                                </div>
                                <div className="text-[12px] leading-5 text-foreground">
                                  {suggestion.reply}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-muted-subtle">
                  <span>{composerContextLabel(selectedThread)}</span>
                  <button
                    className="harwick-pill px-[11px] py-[4px] text-[11px] font-medium text-muted transition-all hover:-translate-y-px hover:border-border-strong hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={actionBusy}
                    onClick={() => void handleGenerateAction()}
                    type="button"
                  >
                    Generate Action
                  </button>
                </div>
                <LeadActionToolbar
                  workspaceId={selectedThread.workspaceId}
                  leadId={selectedThread.leadId}
                  automationMode={selectedThread.automationMode ?? "ai_on"}
                  assignedMemberId={null}
                  currentMemberId={props.currentMemberId}
                  draft={reply}
                  reviewId={selectedThread.reviewId}
                  onDraftChange={(next) => setReply(next)}
                  onChanged={() => void refreshThreads()}
                />
                {actionStatus ? (
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>{actionStatus}</span>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center bg-background px-8">
              <div className="max-w-[320px] text-center">
                <div className="text-[15px] font-medium text-foreground">Pick a live conversation</div>
                <div className="mt-2 text-[12.5px] leading-6 text-muted">
                  Search, filter, or wait for inbound lead events. The center thread stays tied to the live workspace backend.
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="w-[288px] shrink-0 overflow-y-auto border-l border-border bg-surface">
          {selectedThread ? (
            <>
              <div className="border-b border-border px-[14px] py-[14px]">
                <div className="mb-[9px] text-[9.5px] font-medium uppercase tracking-[0.12em] text-muted-subtle">Lead Info</div>
                <div className="space-y-[7px] text-[12.5px]">
                  <div className="flex gap-2">
                    <span className="w-[68px] shrink-0 text-muted-subtle">Name</span>
                    <span className="font-medium">{selectedThread.name}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-[68px] shrink-0 text-muted-subtle">Source</span>
                    <span className="font-medium">{selectedThread.sourceLabel}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-[68px] shrink-0 text-muted-subtle">Stage</span>
                    <span className={cn("inline-flex rounded-full px-[7px] py-0.5 text-[10px] font-medium", stageBadgeStyles[selectedThread.stageTone])}>
                      {selectedThread.stageLabel}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-[68px] shrink-0 text-muted-subtle">Score</span>
                    <span className="font-medium">{selectedThread.scoreLabel}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-[68px] shrink-0 text-muted-subtle">Assigned</span>
                    <span className="font-medium">{selectedThread.assignedTo}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-[68px] shrink-0 text-muted-subtle">FUB ID</span>
                    <span className={cn(selectedThread.followUpBossContactId === null ? "text-muted-subtle" : "font-medium")}>
                      {selectedThread.followUpBossContactId ?? "—"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="border-b border-border px-[14px] py-[14px]">
                <div className="mb-[9px] text-[9.5px] font-medium uppercase tracking-[0.12em] text-muted-subtle">Intent Signals</div>
                <div className="space-y-[7px] text-[12.5px]">
                  <div className="flex gap-2">
                    <span className="w-[68px] shrink-0 text-muted-subtle">Type</span>
                    <span className="font-medium">{selectedThread.intentType}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-[68px] shrink-0 text-muted-subtle">Area</span>
                    <span className="font-medium">{selectedThread.area}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-[68px] shrink-0 text-muted-subtle">Timeline</span>
                    <span className={cn(selectedThread.timeline === "Unknown" ? "text-muted-subtle" : "font-medium")}>
                      {selectedThread.timeline}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-[68px] shrink-0 text-muted-subtle">Budget</span>
                    <span className={cn(selectedThread.budget === "Unknown" ? "text-muted-subtle" : "font-medium")}>
                      {selectedThread.budget}
                    </span>
                  </div>
                </div>
              </div>

              <div className="border-b border-border px-[14px] py-[14px]">
                <div className="mb-[9px] text-[9.5px] font-medium uppercase tracking-[0.12em] text-muted-subtle">Listing Context</div>
                <div className="rounded-[8px] bg-surface-muted p-[10px] text-[12px] text-muted">
                  <div className="mb-0.5 font-medium text-foreground">{selectedThread.listingTitle}</div>
                  <div>{selectedThread.listingDetails}</div>
                  <div
                    className={cn(
                      "mt-1 text-[11px]",
                      selectedThread.listingStatus === "AI action ready" || selectedThread.listingStatus === "FUB synced"
                        ? "text-qualified"
                        : "text-warm",
                    )}
                  >
                    {selectedThread.listingStatus}
                  </div>
                </div>
              </div>

              <div className="border-b border-border px-[14px] py-[14px]">
                <div className="mb-[9px] text-[9.5px] font-medium uppercase tracking-[0.12em] text-muted-subtle">Automation</div>
                <div className="rounded-[8px] bg-surface-muted p-[10px] text-[12px] text-muted">
                  <div className="flex items-center gap-2 text-foreground">
                    <Bot className="h-3.5 w-3.5" />
                    <span className="font-medium">{selectedThread.automationMode ?? "manual only"}</span>
                  </div>
                  <div className="mt-1 leading-5">
                    {selectedThread.automationReason ?? "No live automation review is attached to this thread yet."}
                  </div>
                </div>
              </div>

              {selectedThread.aiSynthesis === null ? null : (
                <div className="border-b border-border px-[14px] py-[14px]">
                  <div className="mb-[9px] text-[9.5px] font-medium uppercase tracking-[0.12em] text-muted-subtle">Harwick Synthesis</div>
                  <div className="rounded-[8px] bg-surface-muted p-[10px] text-[12px] text-muted">
                    <div className="flex items-center justify-between gap-3 text-foreground">
                      <span className="font-medium">{selectedThread.aiSynthesis.intent.replace(/_/g, " ")}</span>
                      <span className="text-[11px] text-muted-subtle">
                        {Math.round(selectedThread.aiSynthesis.confidence * 100)}%
                      </span>
                    </div>
                    <div className="mt-1 leading-5">
                      next: {selectedThread.aiSynthesis.nextAction.replace(/_/g, " ")}
                    </div>
                    {selectedThread.aiSynthesis.missingFields.length === 0 ? null : (
                      <div className="mt-1 leading-5">
                        missing: {selectedThread.aiSynthesis.missingFields.map((field) => field.replace(/_/g, " ")).join(", ")}
                      </div>
                    )}
                    {selectedThread.aiSynthesis.handoffBrief === null ? null : (
                      <div className="mt-2 rounded-[7px] border border-border bg-surface px-2 py-1.5 leading-5">
                        {selectedThread.aiSynthesis.handoffBrief}
                      </div>
                    )}
                    {selectedThread.aiSynthesis.documentUpdate === null ? null : (
                      <div className="mt-2 leading-5">
                        {selectedThread.aiSynthesis.documentUpdate}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="px-[14px] py-[14px]">
                <button
                  className="mb-[7px] flex h-10 w-full items-center justify-center gap-2 rounded-[8px] bg-foreground text-[12px] font-medium text-white"
                  onClick={() => openLead(selectedThread)}
                  type="button"
                >
                  Open Full Lead
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
                <button
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-[8px] border border-border bg-transparent text-[12px] font-medium text-muted transition-colors hover:border-border-strong hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={actionBusy}
                  onClick={() => (
                    selectedThread.reviewId === null
                      ? openLead(selectedThread)
                      : void handleQueueAction("dismiss")
                  )}
                  type="button"
                >
                  {selectedThread.reviewId === null ? (
                    <>
                      <ArrowUpRight className="h-3.5 w-3.5" />
                      Continue in Leads
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      Dismiss Action
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            <div className="px-[14px] py-[18px] text-[12px] leading-5 text-muted">
              Lead context will appear here once you select a live thread.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
