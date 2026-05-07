import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { undoLeadRoutingDecision } from "../../../../../../../../features/leads/lead-routing-undo";
import { authorizeWorkspaceRequest } from "../../../../../../../../lib/api/workspace-auth";
import { createSupabaseAuditLogRepository } from "../../../../../../../../lib/supabase/audit-logs";
import { createSupabaseLeadRoutingUndoRepository } from "../../../../../../../../lib/supabase/leads";
import { createServerSupabaseClient } from "../../../../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

const UndoRequestSchema = z.object({
  routingDecisionId: UuidSchema,
});

type RouteContext = {
  params: Promise<{ workspaceId: string; leadId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { workspaceId, leadId } = await context.params;
  if (!UuidSchema.safeParse(workspaceId).success || !UuidSchema.safeParse(leadId).success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({
    request,
    workspaceId,
    allowedRoles: new Set(["owner", "admin", "team_lead", "lead_manager", "operator"]),
  });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsedBody = UndoRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const result = await undoLeadRoutingDecision({
    workspaceId,
    leadId,
    routingDecisionId: parsedBody.data.routingDecisionId,
    viewer: { memberId: membership.memberId, role: membership.role },
    repository: createSupabaseLeadRoutingUndoRepository(supabase),
    auditRepository: createSupabaseAuditLogRepository(supabase),
  });

  if (result.status === "undone") {
    return NextResponse.json(result, { status: 200 });
  }

  const httpStatus = result.status === "not_found" ? 404
    : result.status === "forbidden" ? 403
    : result.status === "lead_mismatch" ? 400
    : result.status === "window_expired" ? 410
    : 422;
  return NextResponse.json(result, { status: httpStatus });
}
