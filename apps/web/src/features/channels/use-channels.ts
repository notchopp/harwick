"use client";

import type { HarwickChannel } from "@realty-ops/core";
import { useCallback, useEffect, useState } from "react";

import { createBrowserSupabaseClient } from "../../lib/supabase/browser-client";

type CreateChannelInput = {
  name: string;
  kind?: "channel" | "dm" | "group";
  description?: string;
  memberIds?: string[];
};

type Hook = {
  channels: HarwickChannel[];
  loaded: boolean;
  refresh: () => Promise<void>;
  createChannel: (input: CreateChannelInput) => Promise<HarwickChannel | null>;
  archiveChannel: (channelId: string) => Promise<void>;
};

export function useChannels(workspaceId: string): Hook {
  const [channels, setChannels] = useState<HarwickChannel[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/harwick-channels`, { cache: "no-store" });
      if (!response.ok) {
        setLoaded(true);
        return;
      }
      const payload = (await response.json()) as { channels?: HarwickChannel[] };
      setChannels(Array.isArray(payload.channels) ? payload.channels : []);
      setLoaded(true);
    } catch {
      setLoaded(true);
    }
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Realtime: refresh the list when channels are created/updated in this
  // workspace. Cheap because list payloads are small and ordering depends on
  // last_message_at, which moves often.
  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel(`harwick-channels:${workspaceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "harwick_channels", filter: `workspace_id=eq.${workspaceId}` },
        () => { void refresh(); },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh, workspaceId]);

  const createChannel = useCallback(async (input: CreateChannelInput): Promise<HarwickChannel | null> => {
    const response = await fetch(`/api/workspaces/${workspaceId}/harwick-channels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { channel?: HarwickChannel };
    if (payload.channel === undefined) return null;
    setChannels((current) => [payload.channel as HarwickChannel, ...current]);
    return payload.channel;
  }, [workspaceId]);

  const archiveChannel = useCallback(async () => {
    // Channel archive route is not yet exposed; placeholder so callers can wire
    // archive UI without breaking the type.
    return;
  }, []);

  return { channels, loaded, refresh, createChannel, archiveChannel };
}
