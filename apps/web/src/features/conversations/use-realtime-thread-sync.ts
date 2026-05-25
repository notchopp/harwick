"use client";

import { useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import type { ConversationInboxThread } from "@realty-ops/core";
import type { ConversationMessageRow } from "../../lib/supabase/conversation-messages";
import type { LeadRow } from "../../lib/supabase/leads";

export function messageMetaForRealtimeRow(message: ConversationMessageRow): string {
  const statusSuffix = message.status === "failed"
    ? " · failed"
    : message.status === "in_progress"
      ? " · sending"
      : "";

  if (message.sender_type === "customer") return `Customer replied${statusSuffix}`;
  if (message.sender_type === "ai") return `Harwick AI${statusSuffix}`;
  return `Operator replied${statusSuffix}`;
}

function formatRealtimeBudget(lead: Partial<LeadRow>, fallback: string): string {
  const hasBudgetUpdate = Object.prototype.hasOwnProperty.call(lead, "budget_min")
    || Object.prototype.hasOwnProperty.call(lead, "budget_max");
  if (!hasBudgetUpdate) return fallback;

  const min = lead.budget_min;
  const max = lead.budget_max;
  if (min === null && max === null) return "Unknown";
  if (typeof min === "number" && typeof max === "number") {
    return `$${Math.round(min / 1000)}k-$${Math.round(max / 1000)}k`;
  }
  if (typeof min === "number") return `$${Math.round(min / 1000)}k+`;
  if (typeof max === "number") return `Up to $${Math.round(max / 1000)}k`;
  return fallback;
}

function sourceContextForLeadUpdate(lead: Partial<LeadRow>, fallback: string): string {
  const hasIntentUpdate = Object.prototype.hasOwnProperty.call(lead, "intent");
  const hasScoreUpdate = Object.prototype.hasOwnProperty.call(lead, "score");
  if (!hasIntentUpdate && !hasScoreUpdate) return fallback;

  const intent = lead.intent ?? "unknown";
  const score = typeof lead.score === "number" ? lead.score : 0;
  return `${intent} | Score: ${score}`;
}

export function applyRealtimeMessageToThreads(params: {
  current: ConversationInboxThread[];
  message: ConversationMessageRow;
  selectedThreadId: string | null;
}): ConversationInboxThread[] {
  return params.current.map((thread) => {
    if (thread.leadId !== params.message.lead_id) return thread;

    const newMessage = {
      id: params.message.id,
      kind: params.message.sender_type === "customer" ? "lead" as const : "sent" as const,
      body: params.message.body,
      meta: messageMetaForRealtimeRow(params.message),
      occurredAt: params.message.created_at,
      agentTrajectoryId: params.message.agent_trajectory_id,
      agentStepId: params.message.agent_step_id,
    };
    const messages = thread.messages.some((existing) => existing.id === params.message.id)
      ? thread.messages
      : [...thread.messages, newMessage].sort((left, right) => (
        Date.parse(left.occurredAt) - Date.parse(right.occurredAt)
      ));

    return {
      ...thread,
      messages,
      preview: params.message.body,
      lastTouchLabel: "now",
      unread: thread.id !== params.selectedThreadId,
    };
  });
}

export function applyRealtimeLeadUpdateToThreads(params: {
  current: ConversationInboxThread[];
  lead: Partial<LeadRow>;
}): ConversationInboxThread[] {
  if (typeof params.lead.id !== "string") return params.current;

  return params.current.map((thread) => {
    if (thread.leadId !== params.lead.id) return thread;

    const score = typeof params.lead.score === "number" ? params.lead.score : thread.score;
    return {
      ...thread,
      name: params.lead.full_name ?? thread.name,
      sourceContext: sourceContextForLeadUpdate(params.lead, thread.sourceContext),
      budget: formatRealtimeBudget(params.lead, thread.budget),
      timeline: params.lead.timeline ?? thread.timeline,
      score,
      scoreLabel: `${score} / 100`,
    };
  });
}

/**
 * Bridge layer to sync realtime conversation updates into the page's thread state.
 * Handles:
 * 1. New workspace messages in loaded threads
 * 2. Workspace lead context updates for loaded threads
 */
export function useRealtimeThreadSync(
  workspaceId: string | null,
  selectedThreadId: string | null,
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

          onThreadsUpdate((current) => applyRealtimeMessageToThreads({
            current,
            message,
            selectedThreadId,
          }));
        },
      )
      .subscribe();

    channels.push(messagesChannel);

    const leadChannel = supabase
      .channel(`workspace-leads:${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "leads",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          const updatedLead = payload.new as Partial<LeadRow>;
          onThreadsUpdate((current) => applyRealtimeLeadUpdateToThreads({
            current,
            lead: updatedLead,
          }));
        },
      )
      .subscribe();

    channels.push(leadChannel);

    return () => {
      channels.forEach((channel) => {
        void channel.unsubscribe();
      });
    };
  }, [workspaceId, selectedThreadId, onThreadsUpdate]);
}
