import { ShowingApprovalActionRequestSchema, UuidSchema } from "@realty-ops/core";
import { createGoogleCalendarClient } from "@realty-ops/integrations";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { actOnShowingApproval } from "../../../../../../../features/calendar/showing-approval-actions";
import { buildShowingTaskQueueAuditEntry } from "../../../../../../../features/operator-queues/work-queue-audit";
import { authorizeWorkspaceRequest } from "../../../../../../../lib/api/workspace-auth";
import { getServerEnvironment } from "../../../../../../../lib/server-env";
import { createSupabaseAuditLogRepository } from "../../../../../../../lib/supabase/audit-logs";
import { createSupabaseMemberCalendarConnectionRepository } from "../../../../../../../lib/supabase/member-calendar-connections";
import { createServerSupabaseClient } from "../../../../../../../lib/supabase/server-client";
import { createSupabaseShowingApprovalRepository } from "../../../../../../../lib/supabase/showing-approval-tasks";

export const runtime = "nodejs";

const showingActionAllowedRoles = new Set(["owner", "admin", "team_lead", "lead_manager", "operator", "agent"] as const);

type RouteContext = {
  params: Promise<{
    workspaceId: string;
    taskId: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { workspaceId, taskId } = await context.params;
  if (!UuidSchema.safeParse(workspaceId).success || !UuidSchema.safeParse(taskId).success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({
    request,
    workspaceId,
    allowedRoles: showingActionAllowedRoles,
  });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const environment = getServerEnvironment();
  if (environment.CREDENTIAL_ENCRYPTION_KEY === undefined) {
    return NextResponse.json({ error: "calendar_credentials_unavailable" }, { status: 503 });
  }

  const googleCalendarOAuth = environment.GOOGLE_CALENDAR_CLIENT_ID === undefined
    || environment.GOOGLE_CALENDAR_CLIENT_SECRET === undefined
    ? undefined
    : {
        clientId: environment.GOOGLE_CALENDAR_CLIENT_ID,
        clientSecret: environment.GOOGLE_CALENDAR_CLIENT_SECRET,
      };

  try {
    const parsedAction = ShowingApprovalActionRequestSchema.parse(body);
    const supabase = createServerSupabaseClient();
    const result = await actOnShowingApproval({
      workspaceId,
      taskId,
      memberId: membership.memberId,
      memberRole: membership.role,
      request: parsedAction,
      repository: createSupabaseShowingApprovalRepository(supabase),
      calendarConnectionRepository: createSupabaseMemberCalendarConnectionRepository(supabase),
      calendarClient: createGoogleCalendarClient(),
      credentialSecret: environment.CREDENTIAL_ENCRYPTION_KEY,
      ...(googleCalendarOAuth === undefined ? {} : { googleCalendarOAuth }),
    });

    if (result === null) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    try {
      await createSupabaseAuditLogRepository(supabase).insertAuditLog(buildShowingTaskQueueAuditEntry({
        workspaceId,
        actorUserId: null,
        memberId: membership.memberId,
        taskId,
        request: parsedAction,
        result,
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      }));
    } catch (auditError) {
      console.warn("[showing-tasks] audit log failed", auditError);
    }

    return NextResponse.json({ item: result }, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    throw error;
  }
}
