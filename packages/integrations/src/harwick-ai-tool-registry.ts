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
    name: "send_meta_message",
    category: "messaging",
    permission: "auto_safe",
    description: "Reply on the active Meta thread. Use target='comment' to stay on the original comment thread or target='dm' to continue an existing DM thread.",
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
