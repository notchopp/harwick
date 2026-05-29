import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { runJudgmentDefault } from "../../../../../features/judgment-tools/supabase-cache";
import { authorizeWorkspaceRequest } from "../../../../../lib/api/workspace-auth";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

/**
 * GET /api/leads/[leadId]/brief?workspaceId=X&role=Y&destination=Z
 *
 * Returns the briefEntity output for a lead, audience-shaped and
 * destination-shaped per the request. The drawer calls this on mount
 * with destination=harwick_drawer. Other consumers can request:
 *   - destination=crm_note for the dated formal version the FUB push uses
 *   - destination=chat_context for the buyer-returning system prompt build
 *
 * Implementation: pulls lead + related tasks + recent events from
 * Supabase, calls runJudgmentDefault. Cache-hit returns instantly;
 * miss runs OpenAI and stores. Stale-while-revalidate handled by the
 * runner via state_hash comparison.
 */

const QuerySchema = z.object({
  workspaceId: UuidSchema,
  role: z.enum(["owner", "admin", "team_lead", "lead_manager", "agent", "ops", "viewer", "buyer", "system"]).default("agent"),
  destination: z.enum([
    "harwick_drawer",
    "harwick_queue_card",
    "harwick_routing_row",
    "crm_note",
    "crm_task_description",
    "sms_draft",
    "dm_share",
    "chat_context",
    "harwick_owner_brief",
    "internal_audit",
  ]).default("harwick_drawer"),
  forceRegen: z.coerce.boolean().optional(),
});

type LeadRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  instagram_username: string | null;
  email: string | null;
  source_channel: string;
  status: string;
  lead_type: string;
  intent: string;
  score: number;
  target_area: string | null;
  timeline: string | null;
  budget_min: number | null;
  budget_max: number | null;
  financing_status: string;
  assigned_agent_id: string | null;
  qualification_summary: string | null;
  lead_document: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ leadId: string }> },
) {
  const { leadId } = await context.params;
  if (!UuidSchema.safeParse(leadId).success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const query = QuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) {
    return NextResponse.json({ error: "invalid_request", issues: query.error.issues }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({
    request,
    workspaceId: query.data.workspaceId,
  });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Hydrate lead + related state. Caller is responsible for fresh data;
  // briefEntity reasons over what we give it.
  const supabase = createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const untyped = supabase as any;

  const { data: lead } = await untyped
    .from("leads")
    .select("id, full_name, phone, instagram_username, email, source_channel, status, lead_type, intent, score, target_area, timeline, budget_min, budget_max, financing_status, assigned_agent_id, qualification_summary, lead_document, last_message_at, created_at, updated_at")
    .eq("id", leadId)
    .eq("workspace_id", query.data.workspaceId)
    .maybeSingle();
  if (lead === null || lead === undefined) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const leadRow = lead as LeadRow;

  // Pull related tasks (showings, callbacks, lender intros) — the brief
  // should know what's already scheduled.
  const { data: tasksData } = await untyped
    .from("lead_tasks")
    .select("id, task_type, status, priority, title, description, due_at, created_at, requested_start_at")
    .eq("workspace_id", query.data.workspaceId)
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(10);
  const relatedTasks = (tasksData ?? []) as Array<Record<string, unknown>>;

  // Pull recent typed events.
  const { data: eventsData } = await untyped
    .from("lead_events")
    .select("event_type, source_channel, text, occurred_at")
    .eq("workspace_id", query.data.workspaceId)
    .eq("lead_id", leadId)
    .order("occurred_at", { ascending: false })
    .limit(15);
  const recentEvents = (eventsData ?? []) as Array<Record<string, unknown>>;

  // Member's display name for voice persona (if requesting as agent).
  let voicePersona: string | null = null;
  if (query.data.role === "agent" && leadRow.assigned_agent_id !== null) {
    const { data: member } = await untyped
      .from("workspace_members")
      .select("display_name")
      .eq("id", leadRow.assigned_agent_id)
      .maybeSingle();
    if (member !== null && member !== undefined && typeof member.display_name === "string") {
      voicePersona = `Write drafts in ${member.display_name}'s voice — natural, conversational, brokerage-professional.`;
    }
  }

  try {
    const result = await runJudgmentDefault({
      workspaceId: query.data.workspaceId,
      tool: "briefEntity",
      audience: {
        role: query.data.role,
        memberId: membership.memberId,
        voicePersona,
        scope: query.data.role === "owner" || query.data.role === "admin" || query.data.role === "team_lead" || query.data.role === "lead_manager"
          ? "workspace"
          : "personal",
      },
      destination: query.data.destination,
      input: {
        type: "lead",
        id: leadId,
        entityState: leadRow as unknown as Record<string, unknown>,
        relatedTasks,
        recentEvents,
        crmState: null,
        channelAvailability: {
          instagram: false,
          facebook: false,
          sms: false,
          voice: false,
          public_chat: true,
        },
      },
      forceRegen: query.data.forceRegen ?? false,
    });

    return NextResponse.json({
      envelope: result.envelope,
      cached: result.cached,
      model: result.model,
      generatedAt: result.generatedAt,
    });
  } catch (error) {
    console.error("/api/leads/:leadId/brief error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
