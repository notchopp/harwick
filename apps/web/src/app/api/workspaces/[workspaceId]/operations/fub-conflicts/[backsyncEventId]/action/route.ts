import { FollowUpBossConflictActionRequestSchema, UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { actOnFollowUpBossConflict } from "../../../../../../../../features/operations/follow-up-boss-conflicts";
import { buildFollowUpBossConflictAuditEntry } from "../../../../../../../../features/operator-queues/work-queue-audit";
import { authorizeWorkspaceRequest } from "../../../../../../../../lib/api/workspace-auth";
import { createSupabaseAuditLogRepository } from "../../../../../../../../lib/supabase/audit-logs";
import { createSupabaseFollowUpBossConflictRepository } from "../../../../../../../../lib/supabase/follow-up-boss-conflicts";
import { createServerSupabaseClient } from "../../../../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    workspaceId: string;
    backsyncEventId: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { workspaceId, backsyncEventId } = await context.params;
  if (!UuidSchema.safeParse(workspaceId).success || !UuidSchema.safeParse(backsyncEventId).success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const allowedRoles = new Set(["owner", "admin", "team_lead", "lead_manager", "operator"] as const);
  const membership = await authorizeWorkspaceRequest({ request, workspaceId, allowedRoles });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const parsedAction = FollowUpBossConflictActionRequestSchema.parse(body);
    const supabase = createServerSupabaseClient();
    const item = await actOnFollowUpBossConflict({
      workspaceId,
      backsyncEventId,
      request: parsedAction,
      repository: createSupabaseFollowUpBossConflictRepository(supabase),
    });

    if (item === null) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    try {
      await createSupabaseAuditLogRepository(supabase).insertAuditLog(buildFollowUpBossConflictAuditEntry({
        workspaceId,
        actorUserId: null,
        memberId: membership.memberId,
        backsyncEventId,
        request: parsedAction,
        result: item,
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      }));
    } catch (auditError) {
      console.warn("[operations] fub conflict audit log failed", auditError);
    }

    return NextResponse.json({ item }, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    throw error;
  }
}
