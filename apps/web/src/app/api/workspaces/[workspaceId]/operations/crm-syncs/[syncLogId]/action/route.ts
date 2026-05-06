import { CrmSyncActionRequestSchema, UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { actOnCrmSyncFailure } from "../../../../../../../../features/operations/failure-operations";
import { buildOperationsFailureAuditEntry } from "../../../../../../../../features/operator-queues/work-queue-audit";
import { authorizeWorkspaceRequest } from "../../../../../../../../lib/api/workspace-auth";
import { createSupabaseAuditLogRepository } from "../../../../../../../../lib/supabase/audit-logs";
import { createSupabaseFailureOperationsRepository } from "../../../../../../../../lib/supabase/failure-operations";
import { createServerSupabaseClient } from "../../../../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    workspaceId: string;
    syncLogId: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { workspaceId, syncLogId } = await context.params;
  if (!UuidSchema.safeParse(workspaceId).success || !UuidSchema.safeParse(syncLogId).success) {
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
    const parsedAction = CrmSyncActionRequestSchema.parse(body);
    const supabase = createServerSupabaseClient();
    const item = await actOnCrmSyncFailure({
      workspaceId,
      syncLogId,
      request: parsedAction,
      repository: createSupabaseFailureOperationsRepository(supabase),
    });

    if (item === null) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    try {
      await createSupabaseAuditLogRepository(supabase).insertAuditLog(buildOperationsFailureAuditEntry({
        workspaceId,
        actorUserId: null,
        memberId: membership.memberId,
        resourceId: syncLogId,
        request: parsedAction,
        result: item,
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      }));
    } catch (auditError) {
      console.warn("[operations] crm sync audit log failed", auditError);
    }

    return NextResponse.json({ item }, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    throw error;
  }
}
