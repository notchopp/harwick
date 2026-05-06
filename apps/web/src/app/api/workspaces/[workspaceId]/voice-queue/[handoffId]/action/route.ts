import { UuidSchema, VoiceHandoffQueueActionRequestSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { actOnVoiceHandoff } from "../../../../../../../features/operator-queues/operator-queues";
import { buildVoiceHandoffQueueAuditEntry } from "../../../../../../../features/operator-queues/work-queue-audit";
import { authorizeWorkspaceRequest } from "../../../../../../../lib/api/workspace-auth";
import { createSupabaseAuditLogRepository } from "../../../../../../../lib/supabase/audit-logs";
import { createSupabaseVoiceHandoffQueueRepository } from "../../../../../../../lib/supabase/operator-queues";
import { createServerSupabaseClient } from "../../../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    workspaceId: string;
    handoffId: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { workspaceId, handoffId } = await context.params;
  if (!UuidSchema.safeParse(workspaceId).success || !UuidSchema.safeParse(handoffId).success) {
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
    const parsedAction = VoiceHandoffQueueActionRequestSchema.parse(body);
    const supabase = createServerSupabaseClient();
    const result = await actOnVoiceHandoff({
      workspaceId,
      handoffId,
      memberId: membership.memberId,
      request: parsedAction,
      repository: createSupabaseVoiceHandoffQueueRepository(supabase),
    });

    if (result === null) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    try {
      await createSupabaseAuditLogRepository(supabase).insertAuditLog(buildVoiceHandoffQueueAuditEntry({
        workspaceId,
        actorUserId: null,
        memberId: membership.memberId,
        handoffId,
        request: parsedAction,
        result,
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      }));
    } catch (auditError) {
      console.warn("[voice-queue] audit log failed", auditError);
    }

    return NextResponse.json({ item: result }, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    throw error;
  }
}
