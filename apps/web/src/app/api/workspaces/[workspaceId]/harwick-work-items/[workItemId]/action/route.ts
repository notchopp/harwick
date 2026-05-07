import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  approveHarwickLoopWorkItem,
  type HarwickRouteLeadApprovalAdapter,
} from "../../../../../../../features/agent-runtime/approve-harwick-loop-work-item";
import { buildHarwickWorkItemAuditEntry } from "../../../../../../../features/operator-queues/work-queue-audit";
import { routeLeadWithHarwick } from "../../../../../../../features/leads/lead-routing-action";
import { authorizeWorkspaceRequest } from "../../../../../../../lib/api/workspace-auth";
import { createSupabaseAgentTrajectoryStore, type AgentOutcomeInsert } from "../../../../../../../lib/supabase/agent-trajectory-store";
import { createSupabaseAuditLogRepository } from "../../../../../../../lib/supabase/audit-logs";
import {
  createSupabaseHarwickLoopApprovalRepository,
  createSupabaseHarwickWorkItemRepository,
} from "../../../../../../../lib/supabase/harwick-work-items";
import { createSupabaseLeadRoutingActionRepository } from "../../../../../../../lib/supabase/leads";
import { createServerSupabaseClient } from "../../../../../../../lib/supabase/server-client";

const ROUTE_LEAD_UNDO_WINDOW_MINUTES = 10;

function buildRouteLeadAdapter(params: {
  supabase: ReturnType<typeof createServerSupabaseClient>;
  approverRole: "owner" | "admin" | "team_lead" | "lead_manager" | "operator" | "agent" | "viewer";
}): HarwickRouteLeadApprovalAdapter {
  return {
    async executeRouteLead({ workspaceId, leadId, approverMemberId, callPayload, nowIso }) {
      const undoExpiresAt = new Date(
        Date.parse(nowIso) + ROUTE_LEAD_UNDO_WINDOW_MINUTES * 60_000,
      ).toISOString();
      const result = await routeLeadWithHarwick({
        workspaceId,
        leadId,
        viewer: { memberId: approverMemberId, role: params.approverRole },
        input: callPayload,
        repository: createSupabaseLeadRoutingActionRepository(params.supabase),
        auditRepository: createSupabaseAuditLogRepository(params.supabase),
        auditSource: "harwick_approval",
      });
      if (result.status === "forbidden" || result.status === "not_found") {
        return {
          status: "forbidden",
          routingDecisionId: null,
          assignedMemberId: null,
          reasons: [],
          undoExpiresAt,
        };
      }
      return {
        status: result.status === "routed" ? "executed" : "no_assignment",
        routingDecisionId: result.response.routingDecisionId,
        assignedMemberId: result.response.assignedMemberId,
        reasons: result.response.reasons,
        undoExpiresAt,
      };
    },
  };
}

export const runtime = "nodejs";

const WorkItemActionRequestSchema = z.object({
  action: z.enum(["mark_seen", "dismiss", "complete", "approve"]),
  feedbackLabel: z.enum(["useful", "not_relevant", "wrong_person", "already_handled", "needs_more_context"]).optional(),
  feedbackNote: z.string().trim().max(1000).optional(),
});

const actionToStatus = {
  mark_seen: "seen",
  dismiss: "dismissed",
  complete: "completed",
  approve: "completed",
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
    if (parsedBody.data.action === "approve") {
      const approval = await approveHarwickLoopWorkItem({
        workspaceId: workspaceId.data,
        workItemId: workItemId.data,
        actorMemberId: membership.memberId,
        repository: createSupabaseHarwickLoopApprovalRepository(supabase),
        routeLeadAdapter: buildRouteLeadAdapter({ supabase, approverRole: membership.role }),
      });

      if (approval.status === "not_found") {
        return NextResponse.json({ error: "not_found", reason: approval.reason }, { status: 404 });
      }
      if (approval.status !== "approved") {
        return NextResponse.json(
          { error: approval.status, reason: approval.reason },
          { status: approval.status === "already_resolved" ? 409 : 400 },
        );
      }

      try {
        await createSupabaseAuditLogRepository(supabase).insertAuditLog(buildHarwickWorkItemAuditEntry({
          workspaceId: workspaceId.data,
          actorUserId: null,
          memberId: membership.memberId,
          workItemId: approval.workItemId,
          action: "approve",
          resultStatus: "completed",
          leadId: null,
          feedbackLabel: parsedBody.data.feedbackLabel ?? null,
          feedbackNote: parsedBody.data.feedbackNote ?? null,
          ipAddress: request.headers.get("x-forwarded-for"),
          userAgent: request.headers.get("user-agent"),
        }));
      } catch (auditError) {
        console.warn("[harwick-work-items] audit log failed", auditError);
      }

      return NextResponse.json({
        status: "ok",
        workItemId: approval.workItemId,
        loopId: approval.loopId,
        loopName: approval.loopName,
        executed: approval.executed,
      });
    }

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

    try {
      await createSupabaseAuditLogRepository(supabase).insertAuditLog(buildHarwickWorkItemAuditEntry({
        workspaceId: workspaceId.data,
        actorUserId: null,
        memberId: membership.memberId,
        workItemId: result.workItemId,
        action: parsedBody.data.action,
        resultStatus: actionToStatus[parsedBody.data.action],
        leadId: result.leadId,
        feedbackLabel: parsedBody.data.feedbackLabel ?? null,
        feedbackNote: parsedBody.data.feedbackNote ?? null,
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      }));
    } catch (auditError) {
      console.warn("[harwick-work-items] audit log failed", auditError);
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
