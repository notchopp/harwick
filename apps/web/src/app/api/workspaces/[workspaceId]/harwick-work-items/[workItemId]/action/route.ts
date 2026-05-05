import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorizeWorkspaceRequest } from "../../../../../../../lib/api/workspace-auth";
import { createSupabaseAgentTrajectoryStore, type AgentOutcomeInsert } from "../../../../../../../lib/supabase/agent-trajectory-store";
import { createSupabaseHarwickWorkItemRepository } from "../../../../../../../lib/supabase/harwick-work-items";
import { createServerSupabaseClient } from "../../../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

const WorkItemActionRequestSchema = z.object({
  action: z.enum(["mark_seen", "dismiss", "complete"]),
  feedbackLabel: z.enum(["useful", "not_relevant", "wrong_person", "already_handled", "needs_more_context"]).optional(),
  feedbackNote: z.string().trim().max(1000).optional(),
});

const actionToStatus = {
  mark_seen: "seen",
  dismiss: "dismissed",
  complete: "completed",
} as const;

function feedbackLabelToSignalType(
  label: z.infer<typeof WorkItemActionRequestSchema>["feedbackLabel"],
): AgentOutcomeInsert["signalType"] | null {
  if (label === "useful") return "operator_tag_positive";
  if (label === "not_relevant" || label === "wrong_person") return "operator_tag_negative";
  if (label === "already_handled" || label === "needs_more_context") return "operator_tag_note";
  return null;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string; workItemId: string }> },
) {
  const params = await context.params;
  const workspaceId = UuidSchema.safeParse(params.workspaceId);
  const workItemId = UuidSchema.safeParse(params.workItemId);
  if (!workspaceId.success || !workItemId.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({
    request,
    workspaceId: workspaceId.data,
    allowedRoles: new Set(["owner", "admin", "team_lead", "lead_manager", "operator", "agent"]),
  });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsedBody = WorkItemActionRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const supabase = createServerSupabaseClient();
    const repository = createSupabaseHarwickWorkItemRepository(supabase);
    const result = await repository.updateWorkItemStatus({
      workspaceId: workspaceId.data,
      workItemId: workItemId.data,
      status: actionToStatus[parsedBody.data.action],
      actorMemberId: membership.memberId,
      feedbackLabel: parsedBody.data.feedbackLabel ?? null,
      feedbackNote: parsedBody.data.feedbackNote ?? null,
    });

    const signalType = feedbackLabelToSignalType(parsedBody.data.feedbackLabel);
    if (signalType !== null && result.trajectoryId !== null) {
      await createSupabaseAgentTrajectoryStore(supabase).recordOutcome({
        trajectoryId: result.trajectoryId,
        workspaceId: workspaceId.data,
        attributedToStepId: result.stepId,
        signalType,
        signalValue: {
          source: "harwick_work_item",
          workItemId: result.workItemId,
          leadId: result.leadId,
          action: parsedBody.data.action,
          feedbackLabel: parsedBody.data.feedbackLabel,
          feedbackNote: parsedBody.data.feedbackNote ?? null,
          memberId: membership.memberId,
        },
      });
    }

    return NextResponse.json({ status: "ok", workItemId: result.workItemId });
  } catch (error) {
    return NextResponse.json(
      {
        error: "work_item_action_failed",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
