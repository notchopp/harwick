import { z } from "zod";

import type { HarwickToolDefinition, HarwickToolDeps } from "../registry";

/**
 * Pipeline mutation tools — Harwick can actually move leads through the funnel
 * instead of just talking about it.
 *
 *   - update_lead_stage      Advance/regress a lead's status
 *   - set_followup_date      Schedule a nurture touch
 *   - mark_lead_lost         Close with a reason; feeds workspace memory
 *   - add_lead_tag           Category tag for filtering
 *   - record_lead_note       Append a free-form note to the lead's audit trail
 *   - update_qualification_summary  Refresh the 1-2 sentence rolling summary
 *
 * Stage changes + note writes go through audit_logs (not lead_events — that
 * table is reserved for external provider events with unique provider_event_id
 * constraints).
 */

const LEAD_STATUS_VALUES = [
  "new",
  "engaged",
  "qualified",
  "hot",
  "assigned",
  "nurture",
  "appointment_booked",
  "active_client",
  "closed_won",
  "closed_lost",
  "archived",
] as const;

async function ensureLeadAccess(deps: HarwickToolDeps, leadId: string): Promise<boolean> {
  if (deps.operatorRole === "owner" || deps.operatorRole === "admin"
    || deps.operatorRole === "team_lead" || deps.operatorRole === "lead_manager") {
    return true;
  }
  const { data } = await deps.supabase
    .from("leads")
    .select("id")
    .eq("workspace_id", deps.workspaceId)
    .eq("id", leadId)
    .eq("assigned_agent_id", deps.operatorMemberId)
    .maybeSingle();
  return data !== null;
}

async function logAudit(deps: HarwickToolDeps, params: {
  action: string;
  resourceType: string;
  resourceId: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  await deps.supabase.from("audit_logs").insert({
    workspace_id: deps.workspaceId,
    actor_type: "ai",
    action: params.action,
    resource_type: params.resourceType,
    resource_id: params.resourceId,
    metadata: { ...params.metadata, by_member_id: deps.operatorMemberId, captured_via: "harwick_tool" } as never,
  });
}

export const updateLeadStageTool: HarwickToolDefinition = {
  name: "update_lead_stage",
  description: "Move a lead between qualification stages (new → engaged → qualified → hot → assigned → appointment_booked → active_client → closed_won/lost). Use when the operator says 'mark her qualified' or when you've confirmed enough qualification to advance the lead yourself. Records an audit log so the change is traceable.",
  scopes: ["operator_chat", "lead_conversation", "channel_mention"],
  approval: "auto_safe",
  inputSchema: z.object({
    leadId: z.string().uuid(),
    status: z.enum(LEAD_STATUS_VALUES),
    reason: z.string().min(3).max(400).describe("One-sentence reason for the move. Examples: 'Confirmed cash buyer + Dec 2026 timeline', 'No response after 4 follow-ups'."),
  }),
  async execute(input, deps: HarwickToolDeps) {
    if (!await ensureLeadAccess(deps, input.leadId)) {
      return { kind: "lead_stage_update", updated: false, error: "Lead is outside your scope." };
    }

    const nowIso = new Date().toISOString();
    const { data, error } = await deps.supabase
      .from("leads")
      .update({ status: input.status, updated_at: nowIso })
      .eq("workspace_id", deps.workspaceId)
      .eq("id", input.leadId)
      .select("id, status, full_name")
      .single();

    if (error !== null || data === null) {
      return { kind: "lead_stage_update", updated: false, error: error?.message ?? "update_failed" };
    }

    await logAudit(deps, {
      action: "lead_stage_change",
      resourceType: "lead",
      resourceId: input.leadId,
      metadata: { new_status: input.status, reason: input.reason },
    });

    return {
      kind: "lead_stage_update",
      updated: true,
      leadId: data.id,
      leadName: data.full_name,
      status: data.status,
      reason: input.reason,
    };
  },
};

export const setFollowupDateTool: HarwickToolDefinition = {
  name: "set_followup_date",
  description: "Schedule a nurture follow-up on a lead. Use when the operator says 'remind me to ping her in 2 weeks' or when a lead's response timeline suggests a check-in date. Creates a lead_tasks row that the queue page surfaces.",
  scopes: ["operator_chat", "lead_conversation"],
  approval: "auto_safe",
  inputSchema: z.object({
    leadId: z.string().uuid(),
    dueAtIso: z.string().describe("When the follow-up is due (ISO datetime)."),
    note: z.string().min(3).max(400).describe("What to do at follow-up. Example: 'Check in on financing pre-approval status.'"),
  }),
  async execute(input, deps: HarwickToolDeps) {
    if (!await ensureLeadAccess(deps, input.leadId)) {
      return { kind: "lead_followup", created: false, error: "Lead is outside your scope." };
    }

    const { data, error } = await deps.supabase
      .from("lead_tasks")
      .insert({
        workspace_id: deps.workspaceId,
        lead_id: input.leadId,
        task_type: "nurture_review",
        status: "open",
        priority: "normal",
        due_at: input.dueAtIso,
        title: input.note.slice(0, 120),
        description: input.note,
        assigned_member_id: deps.operatorMemberId,
      })
      .select("id, due_at, title")
      .single();

    if (error !== null || data === null) {
      return { kind: "lead_followup", created: false, error: error?.message ?? "insert_failed" };
    }

    // Mirror on the lead so the next_followup_at column surfaces in lead views.
    await deps.supabase
      .from("leads")
      .update({ next_followup_at: input.dueAtIso })
      .eq("workspace_id", deps.workspaceId)
      .eq("id", input.leadId);

    return { kind: "lead_followup", created: true, taskId: data.id, dueAt: data.due_at, note: data.title };
  },
};

export const markLeadLostTool: HarwickToolDefinition = {
  name: "mark_lead_lost",
  description: "Close a lead as lost with a structured reason. The reason feeds workspace memory so future similar leads can be triaged earlier. Use when a lead has gone silent past the policy threshold, explicitly disengaged, or stated a hard 'no'.",
  scopes: ["operator_chat", "lead_conversation"],
  approval: "auto_safe",
  inputSchema: z.object({
    leadId: z.string().uuid(),
    reasonCategory: z.enum([
      "no_response",
      "not_qualified",
      "ghosted",
      "wrong_market",
      "competitor",
      "timing_off",
      "financing_blocked",
      "other",
    ]),
    detail: z.string().min(3).max(500).describe("Specific detail about why this lead is lost."),
  }),
  async execute(input, deps: HarwickToolDeps) {
    if (!await ensureLeadAccess(deps, input.leadId)) {
      return { kind: "lead_closed", updated: false, error: "Lead is outside your scope." };
    }

    const nowIso = new Date().toISOString();
    const { data, error } = await deps.supabase
      .from("leads")
      .update({ status: "closed_lost", updated_at: nowIso })
      .eq("workspace_id", deps.workspaceId)
      .eq("id", input.leadId)
      .select("id, full_name")
      .single();

    if (error !== null || data === null) {
      return { kind: "lead_closed", updated: false, error: error?.message ?? "update_failed" };
    }

    await logAudit(deps, {
      action: "lead_marked_lost",
      resourceType: "lead",
      resourceId: input.leadId,
      metadata: { reason_category: input.reasonCategory, detail: input.detail },
    });

    return {
      kind: "lead_closed",
      updated: true,
      leadId: data.id,
      leadName: data.full_name,
      reasonCategory: input.reasonCategory,
    };
  },
};

export const addLeadTagTool: HarwickToolDefinition = {
  name: "add_lead_tag",
  description: "Tag a lead with a category for future filtering. Examples: 'first_time_buyer', 'investor', 'relocation', 'cash_buyer', 'price_sensitive'. Tags accumulate; an existing tag is a no-op. Use natural-language slugs (lowercase + underscores).",
  scopes: ["operator_chat", "lead_conversation"],
  approval: "auto_safe",
  inputSchema: z.object({
    leadId: z.string().uuid(),
    tag: z.string().min(2).max(40).regex(/^[a-z][a-z0-9_]*$/),
  }),
  async execute(input, deps: HarwickToolDeps) {
    if (!await ensureLeadAccess(deps, input.leadId)) {
      return { kind: "lead_tag", updated: false, error: "Lead is outside your scope." };
    }

    const { data: existing } = await deps.supabase
      .from("leads")
      .select("id, tags")
      .eq("workspace_id", deps.workspaceId)
      .eq("id", input.leadId)
      .maybeSingle();

    if (existing === null) {
      return { kind: "lead_tag", updated: false, error: "Lead not found." };
    }

    const currentTags = Array.isArray(existing.tags) ? existing.tags : [];
    if (currentTags.includes(input.tag)) {
      return { kind: "lead_tag", updated: false, leadId: input.leadId, tag: input.tag, note: "Tag already present." };
    }

    const updatedTags = [...currentTags, input.tag];
    const { error } = await deps.supabase
      .from("leads")
      .update({ tags: updatedTags, updated_at: new Date().toISOString() })
      .eq("workspace_id", deps.workspaceId)
      .eq("id", input.leadId);

    if (error !== null) {
      return { kind: "lead_tag", updated: false, error: error.message };
    }

    return { kind: "lead_tag", updated: true, leadId: input.leadId, tag: input.tag, tags: updatedTags };
  },
};

export const recordLeadNoteTool: HarwickToolDefinition = {
  name: "record_lead_note",
  description: "Append a free-form note to a lead's audit trail. Use for capturing context the operator mentions during a chat ('she's worried about the inspection'), or to leave a breadcrumb for the next time anyone touches this lead. Visible on the lead detail timeline.",
  scopes: ["operator_chat", "lead_conversation", "channel_mention"],
  approval: "auto_safe",
  inputSchema: z.object({
    leadId: z.string().uuid(),
    note: z.string().min(3).max(2000),
  }),
  async execute(input, deps: HarwickToolDeps) {
    if (!await ensureLeadAccess(deps, input.leadId)) {
      return { kind: "lead_note", created: false, error: "Lead is outside your scope." };
    }

    await logAudit(deps, {
      action: "lead_note_recorded",
      resourceType: "lead",
      resourceId: input.leadId,
      metadata: { note: input.note },
    });

    return { kind: "lead_note", created: true, leadId: input.leadId };
  },
};

export const updateQualificationSummaryTool: HarwickToolDefinition = {
  name: "update_qualification_summary",
  description: "Refresh the 1-2 sentence rolling summary of where this lead is in qualification. Call after a meaningful turn where you learned something material — budget firmed up, timeline shifted, financing changed. This is what find_similar_leads matches on, so keep it dense.",
  scopes: ["operator_chat", "lead_conversation", "channel_mention"],
  approval: "auto_safe",
  inputSchema: z.object({
    leadId: z.string().uuid(),
    summary: z.string().min(20).max(500).describe("1-2 dense sentences. Include: intent (buyer/seller), budget, target area, timeline, financing status, current blocker if any."),
  }),
  async execute(input, deps: HarwickToolDeps) {
    if (!await ensureLeadAccess(deps, input.leadId)) {
      return { kind: "qualification_summary", updated: false, error: "Lead is outside your scope." };
    }

    const { error } = await deps.supabase
      .from("leads")
      .update({ qualification_summary: input.summary, updated_at: new Date().toISOString() })
      .eq("workspace_id", deps.workspaceId)
      .eq("id", input.leadId);

    if (error !== null) {
      return { kind: "qualification_summary", updated: false, error: error.message };
    }

    return { kind: "qualification_summary", updated: true, leadId: input.leadId, summary: input.summary };
  },
};

export const PIPELINE_TOOLS: HarwickToolDefinition[] = [
  updateLeadStageTool,
  setFollowupDateTool,
  markLeadLostTool,
  addLeadTagTool,
  recordLeadNoteTool,
  updateQualificationSummaryTool,
];
