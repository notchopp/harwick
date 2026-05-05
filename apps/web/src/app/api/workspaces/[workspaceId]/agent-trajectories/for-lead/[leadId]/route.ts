import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { authorizeWorkspaceRequest } from "../../../../../../../lib/api/workspace-auth";
import { createServerSupabaseClient } from "../../../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    workspaceId: string;
    leadId: string;
  }>;
};

export type AgentTrajectoryStepView = {
  trajectoryId: string;
  trajectoryStartedAt: string;
  trajectoryOutcomeLabel: string | null;
  trajectoryCompletionReason: string | null;
  steps: Array<{
    stepId: string;
    iteration: number;
    createdAt: string;
    intent: string | null;
    nextAction: string | null;
    reply: string | null;
    selfGateAutoExecute: boolean | null;
    selfGateReason: string | null;
    toolNames: string[];
    toolStatuses: Array<{ tool: string; status: string }>;
    documentUpdate: string | null;
  }>;
};

/**
 * Lists recent agent trajectories + their steps for a single lead. Used by
 * the lead detail sheet to render the "agent steps" panel where operators
 * inline-tag specific (state, action) pairs as positive/negative/note.
 *
 * Returns trajectories ordered newest-first, up to 5 trajectories with
 * their steps, so operators can review recent AI behavior without paging.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const { workspaceId, leadId } = await context.params;
  if (!UuidSchema.safeParse(workspaceId).success || !UuidSchema.safeParse(leadId).success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({ request, workspaceId });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();
  const trajectoriesQuery = await supabase
    .from("agent_trajectories")
    .select("id, started_at, outcome_label, completion_reason")
    .eq("workspace_id", workspaceId)
    .eq("lead_id", leadId)
    .order("started_at", { ascending: false })
    .limit(5);

  if (trajectoriesQuery.error !== null) {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const trajectories = (trajectoriesQuery.data ?? []) as Array<{
    id: string;
    started_at: string;
    outcome_label: string | null;
    completion_reason: string | null;
  }>;

  if (trajectories.length === 0) {
    return NextResponse.json({ trajectories: [] }, { status: 200 });
  }

  const trajectoryIds = trajectories.map((t) => t.id);
  const stepsQuery = await supabase
    .from("agent_steps")
    .select("id, trajectory_id, iteration, created_at, turn_output, tool_executions, self_gate_auto_execute, self_gate_reason")
    .in("trajectory_id", trajectoryIds)
    .order("iteration", { ascending: true });

  if (stepsQuery.error !== null) {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const allSteps = (stepsQuery.data ?? []) as Array<{
    id: string;
    trajectory_id: string;
    iteration: number;
    created_at: string;
    turn_output: { intent?: string; nextAction?: string; reply?: string; documentUpdate?: string; toolCalls?: Array<{ tool: string }> } | null;
    tool_executions: Array<{ tool: string; status: string }> | null;
    self_gate_auto_execute: boolean | null;
    self_gate_reason: string | null;
  }>;

  const view: AgentTrajectoryStepView[] = trajectories.map((traj) => {
    const stepsForTraj = allSteps.filter((s) => s.trajectory_id === traj.id);
    return {
      trajectoryId: traj.id,
      trajectoryStartedAt: traj.started_at,
      trajectoryOutcomeLabel: traj.outcome_label,
      trajectoryCompletionReason: traj.completion_reason,
      steps: stepsForTraj.map((step) => {
        const toolCalls = step.turn_output?.toolCalls ?? [];
        const toolNames = toolCalls.map((tc) => tc.tool);
        const toolStatuses = (step.tool_executions ?? []).map((tx) => ({ tool: tx.tool, status: tx.status }));
        return {
          stepId: step.id,
          iteration: step.iteration,
          createdAt: step.created_at,
          intent: step.turn_output?.intent ?? null,
          nextAction: step.turn_output?.nextAction ?? null,
          reply: step.turn_output?.reply ?? null,
          selfGateAutoExecute: step.self_gate_auto_execute,
          selfGateReason: step.self_gate_reason,
          toolNames,
          toolStatuses,
          documentUpdate: step.turn_output?.documentUpdate ?? null,
        };
      }),
    };
  });

  return NextResponse.json({ trajectories: view }, { status: 200 });
}
