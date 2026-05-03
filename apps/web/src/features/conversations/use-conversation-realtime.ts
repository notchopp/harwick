import { useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import type { ConversationMessageRow } from "../../lib/supabase/conversation-messages";

type ConversationMessage = ConversationMessageRow;

/**
 * Hook to subscribe to real-time conversation updates
 * Handles three subscriptions:
 * 1. New leads (left sidebar)
 * 2. Selected thread messages (middle pane)
 * 3. Lead context updates (right pane)
 */
export function useConversationRealtime(
  workspaceId: string | null,
  selectedLeadId: string | null,
  onNewMessage: (message: ConversationMessage) => void,
  onLeadUpdate: (lead: { [key: string]: unknown }) => void,
) {
  useEffect(() => {
    if (!workspaceId) return;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    );

    // Subscription 1: Selected thread messages
    if (selectedLeadId) {
      const messagesChannel = supabase
        .channel(`thread:${selectedLeadId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "conversation_messages",
            filter: `lead_id=eq.${selectedLeadId}`,
          },
          (payload) => {
            const message = payload.new as ConversationMessage;
            onNewMessage(message);
          },
        )
        .subscribe();

      // Subscription 2: Lead context updates
      const leadChannel = supabase
        .channel(`lead:${selectedLeadId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "leads",
            filter: `id=eq.${selectedLeadId}`,
          },
          (payload) => {
            onLeadUpdate(payload.new);
          },
        )
        .subscribe();

      return () => {
        void messagesChannel.unsubscribe();
        void leadChannel.unsubscribe();
      };
    }
  }, [workspaceId, selectedLeadId, onNewMessage, onLeadUpdate]);
}

/**
 * Hook to subscribe to new leads in shared pool
 */
export function useNewLeadsRealtime(
  workspaceId: string | null,
  onNewLead: (lead: { [key: string]: unknown }) => void,
  onLeadUpdate: (lead: { [key: string]: unknown }) => void,
) {
  useEffect(() => {
    if (!workspaceId) return;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    );

    const leadsChannel = supabase
      .channel(`leads:${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "leads",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          onNewLead(payload.new);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "leads",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          onLeadUpdate(payload.new);
        },
      )
      .subscribe();

    return () => {
      void leadsChannel.unsubscribe();
    };
  }, [workspaceId, onNewLead, onLeadUpdate]);
}
