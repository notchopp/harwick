"use client";

import { useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import type { ConversationInboxThread } from "@realty-ops/core";
import type { ConversationMessageRow } from "../../lib/supabase/conversation-messages";
import type { LeadRow } from "../../lib/supabase/leads";

function messageMetaForRealtimeRow(message: ConversationMessageRow): string {
  const statusSuffix = message.status === "failed"
    ? " · failed"
    : message.status === "in_progress"
      ? " · sending"
      : "";

  if (message.sender_type === "customer") return `Customer replied${statusSuffix}`;
  if (message.sender_type === "ai") return `Harwick AI${statusSuffix}`;
  return `Operator replied${statusSuffix}`;
}

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

    const channels: ReturnType<typeof supabase.channel>[] = [];

    const messagesChannel = supabase
      .channel(`workspace-messages:${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversation_messages",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          const message = payload.new as ConversationMessageRow;

          onThreadsUpdate((current) =>
            current.map((thread) => {
              if (thread.leadId !== message.lead_id) return thread;

              const newMessage = {
                id: message.id,
                kind: message.sender_type === "customer" ? "lead" as const : "sent" as const,
                body: message.body,
                meta: messageMetaForRealtimeRow(message),
                occurredAt: message.created_at,
                agentTrajectoryId: message.agent_trajectory_id,
                agentStepId: message.agent_step_id,
              };
              const messages = thread.messages.some((existing) => existing.id === message.id)
                ? thread.messages
                : [...thread.messages, newMessage].sort((left, right) => (
                  Date.parse(left.occurredAt) - Date.parse(right.occurredAt)
                ));

              return {
                ...thread,
                messages,
                preview: message.body,
                lastTouchLabel: "now",
                unread: thread.id !== selectedThreadId,
              };
            }),
          );
        },
      )
      .subscribe();

    channels.push(messagesChannel);

    // Find selected thread to get lead ID for lead-context updates.
    const selectedThread = selectedThreadId ? threads.find((t) => t.id === selectedThreadId) : null;
    const selectedLeadId = selectedThread?.leadId ?? null;

    if (selectedLeadId) {
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
