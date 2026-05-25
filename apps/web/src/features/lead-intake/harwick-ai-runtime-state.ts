import {
  HarwickAiConversationStateSchema,
  type ConversationAutomationMode,
  type HarwickAiConversationState,
  type LeadSourceChannel,
} from "@realty-ops/core";
import type { LeadRow } from "../../lib/supabase/leads";

function formatBudget(lead: LeadRow | null): string | null {
  if (lead === null) return null;
  if (lead.budget_min === null && lead.budget_max === null) return null;
  if (lead.budget_min !== null && lead.budget_max !== null) {
    return `${lead.budget_min}-${lead.budget_max}`;
  }
  if (lead.budget_min !== null) return `${lead.budget_min}+`;
  return `up to ${lead.budget_max}`;
}

export function buildHarwickAiConversationState(params: {
  workspaceId: string;
  leadId: string | null;
  providerThreadId: string | null;
  channel: LeadSourceChannel;
  automationMode: ConversationAutomationMode;
  lead?: LeadRow | null;
}): HarwickAiConversationState {
  const lead = params.lead ?? null;

  return HarwickAiConversationStateSchema.parse({
    workspaceId: params.workspaceId,
    leadId: params.leadId,
    providerThreadId: params.providerThreadId,
    channel: params.channel,
    automationMode: params.automationMode,
    currentIntent: lead?.intent === "unknown" || lead?.intent === undefined
      ? "qualification_in_progress"
      : `${lead.intent}_intent`,
    qualification: {
      name: lead?.full_name ?? null,
      phone: lead?.phone ?? null,
      email: lead?.email ?? null,
      leadType: lead?.lead_type ?? "unknown",
      intent: lead?.intent ?? "unknown",
      timeline: lead?.timeline ?? null,
      budget: formatBudget(lead),
      targetArea: lead?.target_area ?? null,
      propertyType: null,
      financingStatus: lead?.financing_status ?? "unknown",
      score: lead?.score ?? 0,
    },
    knownFacts: [],
    lastAiAction: null,
    assignedAgentName: null,
    sourceOwnerName: null,
  });
}
