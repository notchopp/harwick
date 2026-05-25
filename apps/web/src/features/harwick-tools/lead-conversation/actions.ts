import { z } from "zod";

import type { HarwickToolDefinition } from "../registry";

/**
 * Lead-conversation action tools. Each one PROPOSES an action — it returns a
 * structured payload that the existing approval/executor pipeline picks up.
 * No real side effects in execute() bodies; that side stays in the legacy
 * handler set (apps/web/src/features/lead-intake/harwick-ai-tool-handlers.ts)
 * until each tool migrates one-by-one.
 *
 * The win even today: when streamText calls these tools natively, the model
 * sees the proposal land in its message thread and can compose follow-up
 * tool calls (e.g. check_calendar → see availability → propose
 * request_showing_approval) without the hand-rolled outer loop.
 *
 * Read-only tools (recall_fact, find_similar_leads, search_listings,
 * check_availability, query_workspace, etc.) live in operator-chat/ and
 * carry "lead_conversation" in their scopes array — they DO real reads
 * because reads have no approval semantics.
 */

const ProposedActionResult = (tool: string, payload: Record<string, unknown>, reason: string, requiresApproval: boolean) => ({
  kind: "proposed_action" as const,
  tool,
  payload,
  reason,
  requiresApproval,
});

const SendMetaMessageInputSchema = z.object({
  reply: z.string().min(1).max(2000).describe("The reply body. Public-safe if target='comment' (no PII)."),
  target: z.enum(["current_thread", "comment", "dm"]).default("current_thread"),
  reason: z.string().min(1).max(240).describe("Short reason this reply makes sense now."),
});

export const sendMetaMessageTool: HarwickToolDefinition = {
  name: "send_meta_message",
  description: "Reply on the active Meta thread (Instagram DM, Facebook DM, or comment). target='dm' continues an existing private thread; target='comment' stays on the original comment thread; target='current_thread' uses whichever the runtime is on. Returns a proposed action — actual send is approval-gated by the workspace's automation policy.",
  scopes: ["lead_conversation"],
  approval: "approval_required",
  inputSchema: SendMetaMessageInputSchema,
  execute(input: z.output<typeof SendMetaMessageInputSchema>) {
    return ProposedActionResult(
      "send_meta_message",
      { reply: input.reply, target: input.target },
      input.reason,
      true,
    );
  },
};

const CheckCalendarLeadInputSchema = z.object({
  listing: z.string().max(240).optional().describe("Listing label this check is for."),
  reason: z.string().min(1).max(240).default("Check workspace calendar before proposing a showing time."),
});

export const checkCalendarLeadTool: HarwickToolDefinition = {
  name: "check_calendar",
  description: "Read availability windows from the connected workspace calendar to inform a showing proposal. Returns proposed read — actual calendar fetch happens in the executor with the workspace's calendar credentials. Use BEFORE proposing a showing time.",
  scopes: ["lead_conversation"],
  approval: "internal_safe",
  inputSchema: CheckCalendarLeadInputSchema,
  execute(input: z.output<typeof CheckCalendarLeadInputSchema>) {
    return ProposedActionResult(
      "check_calendar",
      input.listing === undefined ? {} : { listing: input.listing },
      input.reason,
      false,
    );
  },
};

const RequestShowingApprovalInputSchema = z.object({
  listing: z.string().max(240).optional(),
  requestedTime: z.string().max(240).optional().describe("Lead-stated preference or proposed slot."),
  reason: z.string().min(1).max(240),
});

export const requestShowingApprovalTool: HarwickToolDefinition = {
  name: "request_showing_approval",
  description: "Queue a showing request for operator/agent approval. The operator picks the listing/time before the calendar event is created. Always approval-required.",
  scopes: ["lead_conversation"],
  approval: "approval_required",
  inputSchema: RequestShowingApprovalInputSchema,
  execute(input: z.output<typeof RequestShowingApprovalInputSchema>) {
    const payload: Record<string, unknown> = {};
    if (input.listing !== undefined) payload["listing"] = input.listing;
    if (input.requestedTime !== undefined) payload["requestedTime"] = input.requestedTime;
    return ProposedActionResult("request_showing_approval", payload, input.reason, true);
  },
};

const RegisterOpenHouseInputSchema = z.object({
  listing: z.string().max(240).optional(),
  eventDate: z.string().max(120).optional(),
  reason: z.string().min(1).max(240),
});

export const registerOpenHouseTool: HarwickToolDefinition = {
  name: "register_open_house",
  description: "Register a lead for an open house and create the follow-up task. Operator/agent approval required.",
  scopes: ["lead_conversation"],
  approval: "approval_required",
  inputSchema: RegisterOpenHouseInputSchema,
  execute(input: z.output<typeof RegisterOpenHouseInputSchema>) {
    const payload: Record<string, unknown> = {};
    if (input.listing !== undefined) payload["listing"] = input.listing;
    if (input.eventDate !== undefined) payload["eventDate"] = input.eventDate;
    return ProposedActionResult("register_open_house", payload, input.reason, true);
  },
};

const RouteLeadInputSchema = z.object({
  assignedMemberId: z.string().uuid().optional().describe("Specific member to assign to. Omit to let the routing engine pick."),
  reason: z.string().min(1).max(240),
});

export const routeLeadTool: HarwickToolDefinition = {
  name: "route_lead",
  description: "Assign the lead using workspace routing profiles, preserving the reason. The executor uses member territories + workload to confirm/route. Always approval-required for now.",
  scopes: ["lead_conversation"],
  approval: "approval_required",
  inputSchema: RouteLeadInputSchema,
  execute(input: z.output<typeof RouteLeadInputSchema>) {
    const payload: Record<string, unknown> = {};
    if (input.assignedMemberId !== undefined) payload["assignedMemberId"] = input.assignedMemberId;
    return ProposedActionResult("route_lead", payload, input.reason, true);
  },
};

const SyncFollowUpBossInputSchema = z.object({
  reason: z.string().min(1).max(240),
});

export const syncFollowUpBossTool: HarwickToolDefinition = {
  name: "sync_follow_up_boss",
  description: "Queue a Follow Up Boss sync for this qualified lead. Approval-required.",
  scopes: ["lead_conversation"],
  approval: "approval_required",
  inputSchema: SyncFollowUpBossInputSchema,
  execute(input: z.output<typeof SyncFollowUpBossInputSchema>) {
    return ProposedActionResult("sync_follow_up_boss", {}, input.reason, true);
  },
};

const PauseAutomationInputSchema = z.object({
  reason: z.string().min(1).max(240),
});

export const pauseAutomationTool: HarwickToolDefinition = {
  name: "pause_automation",
  description: "Pause AI replies on this thread until a human resumes. Auto-safe — runs immediately. Use when the lead asks for a real person, when legal/financing advice is needed, or when the policy narrative says to hand off.",
  scopes: ["lead_conversation"],
  approval: "auto_safe",
  inputSchema: PauseAutomationInputSchema,
  execute(input: z.output<typeof PauseAutomationInputSchema>) {
    return ProposedActionResult("pause_automation", { reason: input.reason }, input.reason, false);
  },
};

const DispatchSubagentLeadInputSchema = z.object({
  subagentType: z.enum(["research", "writer", "calendar", "routing"]),
  title: z.string().min(3).max(120),
  instructions: z.string().min(8).max(2000),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  reason: z.string().min(1).max(240),
});

export const dispatchSubagentLeadTool: HarwickToolDefinition = {
  name: "dispatch_subagent",
  description: "Spawn a durable specialist task (research / writer / calendar / routing) — useful for parallel helper work that needs another pass. Auto-safe.",
  scopes: ["lead_conversation"],
  approval: "internal_safe",
  inputSchema: DispatchSubagentLeadInputSchema,
  execute(input: z.output<typeof DispatchSubagentLeadInputSchema>) {
    return ProposedActionResult(
      "dispatch_subagent",
      {
        subagentType: input.subagentType,
        title: input.title,
        instructions: input.instructions,
        priority: input.priority,
      },
      input.reason,
      false,
    );
  },
};

export const LEAD_CONVERSATION_ACTION_TOOLS: HarwickToolDefinition[] = [
  sendMetaMessageTool,
  checkCalendarLeadTool,
  requestShowingApprovalTool,
  registerOpenHouseTool,
  routeLeadTool,
  syncFollowUpBossTool,
  pauseAutomationTool,
  dispatchSubagentLeadTool,
];
