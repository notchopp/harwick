import type { HarwickAiToolName } from "@realty-ops/core";

export type HarwickAiToolPermission = "auto_safe" | "approval_required" | "internal_safe";

export type HarwickAiToolRegistryEntry = {
  name: HarwickAiToolName;
  category: "messaging" | "calendar" | "routing" | "crm" | "automation" | "subagent";
  permission: HarwickAiToolPermission;
  description: string;
  payloadHint: string;
};

export const HARWICK_AI_TOOL_REGISTRY: readonly HarwickAiToolRegistryEntry[] = [
  {
    name: "send_message_to_lead",
    category: "messaging",
    permission: "auto_safe",
    description: "Reply to the lead on the channel that makes sense — public listing chat session, Meta DM thread, or SMS if we have their phone. The executor picks the right transport based on lead context.",
    payloadHint: "{ reply: string, channelHint?: 'auto' | 'public_chat' | 'meta_dm' | 'sms' }",
  },
  {
    name: "queue_callback_task",
    category: "automation",
    permission: "approval_required",
    description: "Create a callback work item the operator can pick up — used when synchronous reach isn't right (after hours, lender intro needed, complex objection that deserves a human voice).",
    payloadHint: "{ reason: string, urgency?: 'now' | 'today' | 'this_week', dueAt?: string }",
  },
  {
    name: "send_sms",
    category: "messaging",
    permission: "auto_safe",
    description: "Send an SMS via the workspace Twilio number. Quiet-hours and rate limits apply. Use for showing confirmations, brief check-ins, or follow-ups after a call.",
    payloadHint: "{ body: string, toPhone: string }",
  },
  {
    name: "log_listing_memory",
    category: "subagent",
    permission: "internal_safe",
    description: "Record an observation onto the listing's memory layer so future visitors and operators benefit. Use for recurring questions, objections, or verified context worth remembering.",
    payloadHint: "{ listingId: string, kind: 'common_question' | 'common_objection' | 'context_note' | 'incentive' | 'sales_angle', content: string, visibility?: 'public' | 'internal', prompt?: string }",
  },
  {
    name: "send_meta_message",
    category: "messaging",
    permission: "auto_safe",
    description: "Reply on the active Meta thread. Use target='comment' to stay on the original comment thread or target='dm' to continue an existing DM thread. (Channel-specific — prefer send_message_to_lead unless the workspace is centered on Meta DMs.)",
    payloadHint: "{ reply: string, target?: 'current_thread' | 'comment' | 'dm' }",
  },
  {
    name: "check_calendar",
    category: "calendar",
    permission: "internal_safe",
    description: "Look up availability windows before proposing a showing time.",
    payloadHint: "{ listing?: string }",
  },
  {
    name: "request_showing_approval",
    category: "calendar",
    permission: "approval_required",
    description: "Queue a showing request for operator or agent approval.",
    payloadHint: "{ listing?: string, requestedTime?: string }",
  },
  {
    name: "register_open_house",
    category: "calendar",
    permission: "approval_required",
    description: "Register the lead for an open house and create the follow-up task.",
    payloadHint: "{ listing?: string, eventDate?: string }",
  },
  {
    name: "route_lead",
    category: "routing",
    permission: "approval_required",
    description: "Assign the lead using workspace routing profiles and preserve the reason.",
    payloadHint: "{ assignedMemberId?: string, reason?: string }",
  },
  {
    name: "sync_follow_up_boss",
    category: "crm",
    permission: "approval_required",
    description: "Queue a Follow Up Boss sync job for the qualified lead.",
    payloadHint: "{ reason?: string }",
  },
  {
    name: "pause_automation",
    category: "automation",
    permission: "auto_safe",
    description: "Pause AI replies on this thread until a human resumes.",
    payloadHint: "{ reason?: string }",
  },
  {
    name: "dispatch_subagent",
    category: "subagent",
    permission: "internal_safe",
    description: "Create a durable specialist task for research, writing, calendar, or routing follow-up when a parallel helper is useful.",
    payloadHint: "{ subagentType: 'research' | 'writer' | 'calendar' | 'routing', title: string, instructions: string, priority?: 'low' | 'normal' | 'high' | 'urgent' }",
  },
] as const;

export const HARWICK_AI_TOOL_NAMES: readonly HarwickAiToolName[] = HARWICK_AI_TOOL_REGISTRY.map((tool) => tool.name);

export function buildHarwickToolCatalogPrompt(
  registry: readonly HarwickAiToolRegistryEntry[] = HARWICK_AI_TOOL_REGISTRY,
): string {
  return registry
    .map((tool) => {
      const permission = tool.permission === "approval_required"
        ? "requires operator approval"
        : tool.permission === "internal_safe"
          ? "safe internal tool"
          : "safe to call autonomously when policy allows";
      return `  • ${tool.name} — ${tool.description} Permission: ${permission}. Payload: ${tool.payloadHint}.`;
    })
    .join("\n");
}
