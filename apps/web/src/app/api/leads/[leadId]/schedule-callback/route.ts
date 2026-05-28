import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorizeWorkspaceRequest } from "../../../../../lib/api/workspace-auth";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

const ScheduleCallbackBody = z.object({
  workspaceId: UuidSchema,
  scheduledFor: z.string().datetime(),
  note: z.string().trim().max(500).nullable(),
});

/**
 * POST /api/leads/[leadId]/schedule-callback
 *
 * Drops a row into `lead_tasks` with task_type=callback and due_at set to
 * the operator's chosen time. Assignment falls back to the lead's current
 * `assigned_agent_id` so the callback shows up in the right person's queue
 * — if nobody's assigned yet, the task lands on the workspace and routing
 * can pick it up.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ leadId: string }> },
) {
  const { leadId } = await context.params;
  const parsedLeadId = UuidSchema.safeParse(leadId);
  if (!parsedLeadId.success) {
    return NextResponse.json({ error: "invalid_request", message: "Invalid lead id." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsedBody = ScheduleCallbackBody.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "invalid_request", message: "Provide workspaceId and scheduledFor." },
      { status: 400 },
    );
  }

  const membership = await authorizeWorkspaceRequest({
    request,
    workspaceId: parsedBody.data.workspaceId,
  });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden", message: "Not a workspace member." }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, full_name, instagram_username, phone, assigned_agent_id")
    .eq("id", parsedLeadId.data)
    .eq("workspace_id", parsedBody.data.workspaceId)
    .maybeSingle<{
      id: string;
      full_name: string | null;
      instagram_username: string | null;
      phone: string | null;
      assigned_agent_id: string | null;
    }>();
  if (leadError !== null) {
    console.error("[schedule-callback] lead lookup failed:", leadError);
    return NextResponse.json({ error: "internal_error", message: "Lead lookup failed." }, { status: 500 });
  }
  if (lead === null) {
    return NextResponse.json({ error: "not_found", message: "Lead not found in this workspace." }, { status: 404 });
  }

  const leadDisplayName = lead.full_name?.trim() || lead.phone?.trim() || lead.instagram_username?.trim() || "lead";
  const title = `Call back ${leadDisplayName}`;

  const { error: insertError } = await supabase
    .from("lead_tasks")
    .insert({
      workspace_id: parsedBody.data.workspaceId,
      lead_id: parsedLeadId.data,
      assigned_member_id: lead.assigned_agent_id ?? membership.memberId,
      task_type: "callback",
      title,
      description: parsedBody.data.note,
      due_at: parsedBody.data.scheduledFor,
      requested_start_at: parsedBody.data.scheduledFor,
      priority: "high",
      status: "pending",
    });

  if (insertError !== null) {
    console.error("[schedule-callback] insert failed:", insertError);
    return NextResponse.json(
      { error: "internal_error", message: insertError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
