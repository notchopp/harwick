/**
 * Operator-friendly labels for Harwick tool calls.
 *
 * Backend tool names are snake_case identifiers (e.g. "send_meta_dm") — these
 * are stable wire formats and live inside trajectory/step rows. The UI needs
 * human-readable labels with a description and a category to render in
 * conversation inspectors, rail tool-call chips, the queue, and the activity log.
 *
 * Add new tools here when adding a handler in
 * apps/web/src/features/lead-intake/harwick-ai-tool-handlers.ts.
 */

export type ToolCategory =
  | "communication"
  | "calendar"
  | "lead"
  | "listing"
  | "workspace"
  | "voice"
  | "policy"
  | "ai";

export type ToolDescriptor = {
  /** The wire name (snake_case) used in trajectories + audit rows. */
  name: string;
  /** Short noun-phrase label shown in chips ("Send DM reply"). */
  label: string;
  /** One-line description for tooltips / inspector rows. */
  description: string;
  category: ToolCategory;
  /** True if this tool reaches outside the workspace (sends a message, books a tour, syncs FUB). */
  external: boolean;
};

const REGISTRY: Record<string, ToolDescriptor> = {
  send_meta_dm: {
    name: "send_meta_dm",
    label: "Send DM reply",
    description: "Reply to an Instagram or Facebook direct message as the brokerage.",
    category: "communication",
    external: true,
  },
  send_meta_reply: {
    name: "send_meta_reply",
    label: "Reply to comment",
    description: "Reply publicly to a Meta comment thread.",
    category: "communication",
    external: true,
  },
  send_meta_message: {
    name: "send_meta_message",
    label: "Send Meta message",
    description: "Send a generic Instagram or Facebook message.",
    category: "communication",
    external: true,
  },
  send_reply: {
    name: "send_reply",
    label: "Send reply",
    description: "Send a reply on the channel this conversation lives on.",
    category: "communication",
    external: true,
  },
  ask_qualification: {
    name: "ask_qualification",
    label: "Ask qualification",
    description: "Send a qualifying question (budget, timeline, financing) to the lead.",
    category: "communication",
    external: true,
  },
  move_comment_to_dm: {
    name: "move_comment_to_dm",
    label: "Move to DM",
    description: "Pull a public comment thread into a private direct message.",
    category: "communication",
    external: true,
  },
  send_buyer_blueprint: {
    name: "send_buyer_blueprint",
    label: "Send buyer brief",
    description: "Share the brokerage's buyer guide with the lead.",
    category: "communication",
    external: true,
  },
  check_calendar: {
    name: "check_calendar",
    label: "Check calendar",
    description: "Look up agent availability and existing showings.",
    category: "calendar",
    external: false,
  },
  request_showing_approval: {
    name: "request_showing_approval",
    label: "Request showing approval",
    description: "Surface a proposed showing time for owner approval before booking.",
    category: "calendar",
    external: false,
  },
  register_open_house: {
    name: "register_open_house",
    label: "Register open house",
    description: "Add an open house slot to the brokerage calendar.",
    category: "calendar",
    external: true,
  },
  route_lead: {
    name: "route_lead",
    label: "Route lead",
    description: "Assign a lead to an agent based on routing policy.",
    category: "lead",
    external: false,
  },
  qualify_lead: {
    name: "qualify_lead",
    label: "Qualify lead",
    description: "Score and classify a lead from the latest signals.",
    category: "lead",
    external: false,
  },
  sync_follow_up_boss: {
    name: "sync_follow_up_boss",
    label: "Sync to Follow Up Boss",
    description: "Push the lead and conversation history to Follow Up Boss.",
    category: "workspace",
    external: true,
  },
  pause_automation: {
    name: "pause_automation",
    label: "Pause Harwick on thread",
    description: "Pause auto-replies on this conversation until a human resumes.",
    category: "policy",
    external: false,
  },
  dispatch_subagent: {
    name: "dispatch_subagent",
    label: "Dispatch subagent",
    description: "Spawn a focused AI subtask (lead analysis, listing recheck, nurture batch).",
    category: "ai",
    external: false,
  },
  create_lead_handoff: {
    name: "create_lead_handoff",
    label: "Hand off voice call",
    description: "Escalate a voice call from Harwick to a human teammate.",
    category: "voice",
    external: false,
  },
  transfer_call: {
    name: "transfer_call",
    label: "Transfer call",
    description: "Transfer a live call to another agent on the team.",
    category: "voice",
    external: true,
  },
};

/** Lookup. Falls back to a humanized version of the snake_case name. */
export function getToolDescriptor(name: string): ToolDescriptor {
  const existing = REGISTRY[name];
  if (existing !== undefined) return existing;
  return {
    name,
    label: humanize(name),
    description: `Harwick tool: ${name}.`,
    category: "ai",
    external: false,
  };
}

function humanize(name: string): string {
  return name
    .split("_")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Pretty-print a tool call with optional arg summary: e.g. "Check calendar · jordan · fri". */
export function formatToolCall(name: string, args?: Record<string, unknown> | null): string {
  const descriptor = getToolDescriptor(name);
  if (args === null || args === undefined) return descriptor.label;
  const arg = summarizeArgs(args);
  return arg.length === 0 ? descriptor.label : `${descriptor.label} · ${arg}`;
}

function summarizeArgs(args: Record<string, unknown>): string {
  const interestingKeys = ["leadId", "agent", "agentId", "memberId", "listingId", "channel", "mode", "tool", "reason"];
  const pieces: string[] = [];
  for (const key of interestingKeys) {
    const value = args[key];
    if (typeof value === "string" && value.length > 0) {
      pieces.push(value.length > 18 ? `${value.slice(0, 16)}…` : value);
      if (pieces.length >= 2) break;
    }
  }
  return pieces.join(", ");
}

/** All registered tools, useful for documentation or admin surfaces. */
export function listTools(): readonly ToolDescriptor[] {
  return Object.values(REGISTRY);
}
