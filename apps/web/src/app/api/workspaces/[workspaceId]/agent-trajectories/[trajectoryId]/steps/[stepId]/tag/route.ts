import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorizeWorkspaceRequest } from "../../../../../../../../../lib/api/workspace-auth";
import { createSupabaseAgentTrajectoryStore } from "../../../../../../../../../lib/supabase/agent-trajectory-store";
import { createServerSupabaseClient } from "../../../../../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

const TagRequestSchema = z.object({
  tag: z.enum(["positive", "negative", "note"]),
  note: z.string().trim().max(2000).optional(),
});

type RouteContext = {
  params: Promise<{
    workspaceId: string;
    trajectoryId: string;
    stepId: string;
  }>;
};

/**
 * Operator inline-tags a specific agent step. Writes one of:
 *   operator_tag_positive — "this AI step was good"
 *   operator_tag_negative — "this AI step was bad"
 *   operator_tag_note     — "here's context for whoever reviews this later"
 *
 * The signal is attributed to the specific step (not just the trajectory),
 * which is critical for fine-tuning: we know the exact (state, action) pair
 * the human approved or disapproved. Together with the implicit signals
 * from the reconciliation worker, this is the labeled corpus.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { workspaceId, trajectoryId, stepId } = await context.params;
  if (
    !UuidSchema.safeParse(workspaceId).success
    || !UuidSchema.safeParse(trajectoryId).success
    || !UuidSchema.safeParse(stepId).success
  ) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({ request, workspaceId });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = TagRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  // Verify the step belongs to the trajectory and to the workspace before
  // recording. Service-role client bypasses RLS, so we enforce this in code.
  const { data: stepRow, error: stepError } = await supabase
    .from("agent_steps")
    .select("id, trajectory_id, workspace_id")
    .eq("id", stepId)
    .maybeSingle();
  if (stepError !== null || stepRow === null) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (stepRow.workspace_id !== workspaceId || stepRow.trajectory_id !== trajectoryId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const store = createSupabaseAgentTrajectoryStore(supabase);
  const signalType = parsed.data.tag === "positive"
    ? "operator_tag_positive"
    : parsed.data.tag === "negative"
      ? "operator_tag_negative"
      : "operator_tag_note";

  try {
    const result = await store.recordOutcome({
      trajectoryId,
      workspaceId,
      attributedToStepId: stepId,
      signalType,
      signalValue: {
        memberId: membership.memberId,
        note: parsed.data.note ?? null,
      },
    });
    return NextResponse.json({ status: "ok", outcomeId: result.outcomeId }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: "internal_error", message: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
