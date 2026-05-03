"use client";

import { useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import type { ConversationInboxThread } from "@realty-ops/core";
import type { ConversationMessageRow } from "../../lib/supabase/conversation-messages";
import type { LeadRow } from "../../lib/supabase/leads";

/**
 * Bridge layer to sync realtime conversation updates into the page's thread state.
 * Handles:
 * 1. New messages in selected thread (live message pane)
 * 2. Lead context updates (budget, timeline, etc.)
 */
export function useRealtimeThreadSync(
  workspaceId: string | null,
  selectedThreadId: string | null,
  threads: ConversationInboxThread[],
  onThreadsUpdate: (updater: (current: ConversationInboxThread[]) => ConversationInboxThread[]) => void,
) {
  useEffect(() => {
    if (!workspaceId) return;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    );

    // Find selected thread to get lead ID
    const selectedThread = selectedThreadId ? threads.find((t) => t.id === selectedThreadId) : null;
    const selectedLeadId = selectedThread?.leadId ?? null;

    const channels: ReturnType<typeof supabase.channel>[] = [];

    // Only subscribe when a thread is selected
    if (selectedLeadId) {
      // Subscription: New messages in selected thread
      const messagesChannel = supabase
        .channel(`thread-messages:${selectedLeadId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "conversation_messages",
            filter: `lead_id=eq.${selectedLeadId}`,
          },
          (payload) => {
            const message = payload.new as ConversationMessageRow;

            // Update the selected thread with new message
            onThreadsUpdate((current) =>
              current.map((thread) => {
                if (thread.id !== selectedThreadId) return thread;

                // Map conversation message to thread message format
                const newMessage = {
                  id: message.id,
                  kind: (message.sender_type === "customer" ? "lead" : message.sender_type) as
                    | "lead"
                    | "ai_action"
                    | "sent"
                    | "system",
                  body: message.body,
                  meta:
                    message.sender_type === "customer"
                      ? "Customer replied"
                      : message.sender_type === "ai"
                        ? "Harwick AI"
                        : "Operator replied",
                  occurredAt: message.created_at,
                };

                return {
                  ...thread,
                  messages: [...thread.messages, newMessage],
                  preview: message.body,
                  lastTouchLabel: "now",
                  unread: false,
                };
              }),
            );
          },
        )
        .subscribe();

      channels.push(messagesChannel);

      // Subscription: Lead context updates (budget, intent, timeline, etc.)
      const leadChannel = supabase
        .channel(`thread-lead:${selectedLeadId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "leads",
            filter: `id=eq.${selectedLeadId}`,
          },
          (payload) => {
            const updatedLead = payload.new as Partial<LeadRow>;

            // Update thread metadata from lead
            onThreadsUpdate((current) =>
              current.map((thread) => {
                if (thread.id !== selectedThreadId) return thread;

                // Update fields that may have changed
                return {
                  ...thread,
                  name: updatedLead.full_name ?? thread.name,
                  sourceContext:
                    `${updatedLead.intent ?? "unknown"} | Score: ${updatedLead.score ?? 0}`,
                  budget: updatedLead.budget_min || updatedLead.budget_max
                    ? `$${updatedLead.budget_min?.toLocaleString() ?? "?"}$${updatedLead.budget_max?.toLocaleString() ?? "?"}`
                    : thread.budget,
                  timeline: updatedLead.timeline ?? thread.timeline,
                };
              }),
            );
          },
        )
        .subscribe();

      channels.push(leadChannel);
    }

    return () => {
      channels.forEach((channel) => {
        void channel.unsubscribe();
      });
    };
  }, [workspaceId, selectedThreadId, threads, onThreadsUpdate]);
}
