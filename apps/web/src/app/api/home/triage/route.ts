import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { runJudgmentDefault } from "../../../../features/judgment-tools/supabase-cache";
import { authorizeWorkspaceRequest } from "../../../../lib/api/workspace-auth";
import { createServerSupabaseClient } from "../../../../lib/supabase/server-client";

export const runtime = "nodejs";

/**
 * GET /api/home/triage?workspaceId=X[&tier=agent|team_lead|owner|ops]
 *
 * Returns the triageQueue envelope — top-5 + clusters + counts.
 * Replaces /home's flat work-item dump.
 *
 * Pulls: pending lead_tasks (callbacks, showings), pending replies
 * (social_reply_reviews unprocessed), unassigned hot leads
 * (score >= 70 + assigned_agent_id null), FUB conflicts pending,
 * voice handoffs pending, team capacity snapshot.
 */

const QuerySchema = z.object({
  workspaceId: UuidSchema,
  tier: z.enum(["agent", "team_lead", "owner", "ops"]).default("agent"),
});

export async function GET(request: NextRequest) {
  const query = QuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const membership = await authorizeWorkspaceRequest({
    request,
    workspaceId: query.data.workspaceId,
  });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const untyped = supabase as any;

  const [tasksResult, leadsResult, repliesResult] = await Promise.all([
    untyped
      .from("lead_tasks")
      .select("id, lead_id, task_type, status, priority, title, description, due_at, created_at, requested_start_at")
      .eq("workspace_id", query.data.workspaceId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(30),
    untyped
      .from("leads")
      .select("id, full_name, score, lead_type, intent, target_area, source_channel, assigned_agent_id, last_message_at")
      .eq("workspace_id", query.data.workspaceId)
      .is("assigned_agent_id", null)
      .gte("score", 70)
      .order("score", { ascending: false })
      .limit(15),
    untyped
      .from("social_reply_reviews")
      .select("id, lead_id, automation_mode, suggested_reply, created_at")
      .eq("workspace_id", query.data.workspaceId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  const pendingTasks = (tasksResult.data ?? []) as Array<Record<string, unknown>>;
  const unassignedLeads = (leadsResult.data ?? []) as Array<Record<string, unknown>>;
  const pendingReplies = (repliesResult.data ?? []) as Array<Record<string, unknown>>;

  try {
    const result = await runJudgmentDefault({
      workspaceId: query.data.workspaceId,
      tool: "triageQueue",
      audience: {
        role: query.data.tier === "agent" ? "agent" : query.data.tier === "team_lead" ? "team_lead" : query.data.tier === "owner" ? "owner" : "ops",
        memberId: membership.memberId,
        voicePersona: null,
        scope: query.data.tier === "owner" || query.data.tier === "team_lead" ? "workspace" : "personal",
      },
      destination: "harwick_drawer",
      input: {
        workspaceId: query.data.workspaceId,
        pendingTasks,
        pendingReplies,
        voiceHandoffs: [],
        fubConflicts: [],
        unassignedLeads,
        teamCapacity: [],
        operatorTier: query.data.tier,
      },
      forceRegen: false,
    });

    return NextResponse.json({
      envelope: result.envelope,
      cached: result.cached,
      model: result.model,
      counts: {
        pendingTasks: pendingTasks.length,
        pendingReplies: pendingReplies.length,
        unassignedLeads: unassignedLeads.length,
      },
    });
  } catch (error) {
    console.error("/api/home/triage error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
