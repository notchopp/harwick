"use client";

import type { HarwickChatThread } from "@realty-ops/core";
import { useCallback, useEffect, useState } from "react";

type State = {
  threads: HarwickChatThread[];
  activeThreadId: string | null;
  loaded: boolean;
};

function emptyState(): State {
  return { threads: [], activeThreadId: null, loaded: false };
}

/**
 * Real chat threads, persisted server-side in harwick_chat_threads.
 * No localStorage — refresh and the most recent thread is selected from the DB.
 */
export function useRailThreads(workspaceId: string): {
  threads: HarwickChatThread[];
  activeThreadId: string | null;
  loaded: boolean;
  select: (threadId: string) => void;
  startNewThread: () => Promise<HarwickChatThread | null>;
  archiveThread: (threadId: string) => Promise<void>;
  refresh: () => Promise<void>;
} {
  const [state, setState] = useState<State>(() => emptyState());

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/harwick-threads`, { cache: "no-store" });
      if (!response.ok) {
        setState((current) => ({ ...current, loaded: true }));
        return;
      }
      const payload = (await response.json()) as { threads?: HarwickChatThread[] };
      const threads = Array.isArray(payload.threads) ? payload.threads : [];
      setState((current) => {
        // Preserve the user's current selection if it still exists; otherwise
        // pick the most recent.
        const stillActive = current.activeThreadId === null
          ? null
          : threads.find((thread) => thread.id === current.activeThreadId) ?? null;
        const next = stillActive?.id ?? threads[0]?.id ?? null;
        return { threads, activeThreadId: next, loaded: true };
      });
    } catch {
      setState((current) => ({ ...current, loaded: true }));
    }
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const select = useCallback((threadId: string) => {
    setState((current) => ({ ...current, activeThreadId: threadId }));
  }, []);

  const startNewThread = useCallback(async (): Promise<HarwickChatThread | null> => {
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/harwick-threads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) return null;
      const payload = (await response.json()) as { thread?: HarwickChatThread };
      if (payload.thread === undefined) return null;
      setState((current) => ({
        threads: [payload.thread as HarwickChatThread, ...current.threads],
        activeThreadId: (payload.thread as HarwickChatThread).id,
        loaded: true,
      }));
      return payload.thread;
    } catch {
      return null;
    }
  }, [workspaceId]);

  const archiveThread = useCallback(async (threadId: string) => {
    try {
      await fetch(`/api/workspaces/${workspaceId}/harwick-threads/${threadId}`, {
        method: "DELETE",
      });
      setState((current) => {
        const next = current.threads.filter((thread) => thread.id !== threadId);
        const wasActive = current.activeThreadId === threadId;
        return {
          threads: next,
          activeThreadId: wasActive ? next[0]?.id ?? null : current.activeThreadId,
          loaded: true,
        };
      });
    } catch {
      /* swallow */
    }
  }, [workspaceId]);

  return {
    threads: state.threads,
    activeThreadId: state.activeThreadId,
    loaded: state.loaded,
    select,
    startNewThread,
    archiveThread,
    refresh,
  };
}
