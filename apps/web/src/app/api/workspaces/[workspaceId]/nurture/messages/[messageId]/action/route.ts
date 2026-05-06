import { NurtureMessageActionRequestSchema, UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { actOnNurtureMessage } from "../../../../../../../../features/nurture/nurture-message-actions";
import { buildNurtureMessageQueueAuditEntry } from "../../../../../../../../features/operator-queues/work-queue-audit";
import { authorizeWorkspaceRequest } from "../../../../../../../../lib/api/workspace-auth";
import { createSupabaseAuditLogRepository } from "../../../../../../../../lib/supabase/audit-logs";
import { createSupabaseNurtureMessageRepository } from "../../../../../../../../lib/supabase/nurture-messages";
import { createServerSupabaseClient } from "../../../../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    workspaceId: string;
    messageId: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { workspaceId, messageId } = await context.params;
  if (!UuidSchema.safeParse(workspaceId).success || !UuidSchema.safeParse(messageId).success) {
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

  try {
    const parsedAction = NurtureMessageActionRequestSchema.parse(body);
    const supabase = createServerSupabaseClient();
    const item = await actOnNurtureMessage({
      workspaceId,
      messageId,
      request: parsedAction,
      repository: createSupabaseNurtureMessageRepository(supabase),
    });

    if (item === null) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    try {
      await createSupabaseAuditLogRepository(supabase).insertAuditLog(buildNurtureMessageQueueAuditEntry({
        workspaceId,
        actorUserId: null,
        memberId: membership.memberId,
        messageId,
        request: parsedAction,
        result: item,
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      }));
    } catch (auditError) {
      console.warn("[nurture] audit log failed", auditError);
    }

    return NextResponse.json({ item }, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    throw error;
  }
}
