"use client";

import type { HarwickChannelMessage } from "@realty-ops/core";
import { useCallback, useEffect, useState } from "react";

import { createBrowserSupabaseClient } from "../../lib/supabase/browser-client";

type Hook = {
  messages: HarwickChannelMessage[];
  loaded: boolean;
  postMessage: (body: string) => Promise<HarwickChannelMessage | null>;
  refresh: () => Promise<void>;
};

type RealtimeRow = {
  id: string;
  channel_id: string;
  workspace_id: string;
  author_kind: string;
  author_member_id: string | null;
  body: string;
  metadata: unknown;
  mentions_harwick: boolean;
  created_at: string;
  edited_at: string | null;
};

function fromRealtime(row: RealtimeRow): HarwickChannelMessage {
  return {
    id: row.id,
    channelId: row.channel_id,
    workspaceId: row.workspace_id,
    authorKind: row.author_kind as HarwickChannelMessage["authorKind"],
    authorMemberId: row.author_member_id,
    body: row.body,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    mentionsHarwick: row.mentions_harwick,
    createdAt: row.created_at,
    editedAt: row.edited_at,
  };
}

export function useChannelMessages(workspaceId: string, channelId: string | null): Hook {
  const [messages, setMessages] = useState<HarwickChannelMessage[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (channelId === null) {
      setMessages([]);
      setLoaded(true);
      return;
    }
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/harwick-channels/${channelId}/messages`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        setMessages([]);
        setLoaded(true);
        return;
      }
      const payload = (await response.json()) as { messages?: HarwickChannelMessage[] };
      setMessages(Array.isArray(payload.messages) ? payload.messages : []);
      setLoaded(true);
    } catch {
      setMessages([]);
      setLoaded(true);
    }
  }, [channelId, workspaceId]);

  useEffect(() => {
    setLoaded(false);
    void refresh();
  }, [refresh]);

  // Realtime subscription scoped to this channel only. Reconnects on channel
  // change because the filter encodes the active channelId.
  useEffect(() => {
    if (channelId === null) return;
    const supabase = createBrowserSupabaseClient();
    const realtimeChannel = supabase
      .channel(`channel-messages:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "harwick_channel_messages",
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          const row = payload.new as RealtimeRow;
          setMessages((current) => {
            if (current.some((message) => message.id === row.id)) return current;
            return [...current, fromRealtime(row)];
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(realtimeChannel);
    };
  }, [channelId]);

  const postMessage = useCallback(async (body: string): Promise<HarwickChannelMessage | null> => {
    if (channelId === null) return null;
    const trimmed = body.trim();
    if (trimmed.length === 0) return null;
    const response = await fetch(
      `/api/workspaces/${workspaceId}/harwick-channels/${channelId}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed }),
      },
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as { message?: HarwickChannelMessage };
    if (payload.message === undefined) return null;
    setMessages((current) => {
      if (current.some((message) => message.id === (payload.message as HarwickChannelMessage).id)) return current;
      return [...current, payload.message as HarwickChannelMessage];
    });
    return payload.message;
  }, [channelId, workspaceId]);

  return { messages, loaded, postMessage, refresh };
}
