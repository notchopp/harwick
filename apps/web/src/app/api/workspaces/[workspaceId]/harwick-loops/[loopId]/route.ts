import { HarwickLoopUpdateRequestSchema, UuidSchema, type HarwickLoopCreate } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { computeNextHarwickLoopRunAt } from "../../../../../../features/agent-runtime/execute-harwick-loops";
import { authorizeWorkspaceRequest } from "../../../../../../lib/api/workspace-auth";
import { createSupabaseHarwickLoopRepository } from "../../../../../../lib/supabase/harwick-loops";
import { createServerSupabaseClient } from "../../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

const writeRoles = new Set(["owner", "admin", "team_lead"] as const);

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string; loopId: string }> },
) {
  const params = await context.params;
  const workspaceId = UuidSchema.safeParse(params.workspaceId);
  const loopId = UuidSchema.safeParse(params.loopId);
  if (!workspaceId.success || !loopId.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({
    request,
    workspaceId: workspaceId.data,
    allowedRoles: writeRoles,
  });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsedBody = HarwickLoopUpdateRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const nextRunAt = parsedBody.data.nextRunAt
    ?? (parsedBody.data.scheduleSpec === undefined || parsedBody.data.scheduleSpec === null
      ? undefined
      : computeNextHarwickLoopRunAt(parsedBody.data.scheduleSpec, new Date()));
  const patch: Partial<HarwickLoopCreate> = {};
  if (parsedBody.data.name !== undefined) patch.name = parsedBody.data.name;
  if (parsedBody.data.instruction !== undefined) patch.instruction = parsedBody.data.instruction;
  if (parsedBody.data.triggerType !== undefined) patch.triggerType = parsedBody.data.triggerType;
  if (parsedBody.data.scheduleSpec !== undefined) patch.scheduleSpec = parsedBody.data.scheduleSpec;
  if (parsedBody.data.eventType !== undefined) patch.eventType = parsedBody.data.eventType;
  if (parsedBody.data.status !== undefined) patch.status = parsedBody.data.status;
  if (parsedBody.data.approvalMode !== undefined) patch.approvalMode = parsedBody.data.approvalMode;
  if (parsedBody.data.outputMode !== undefined) patch.outputMode = parsedBody.data.outputMode;
  if (parsedBody.data.toolAllowlist !== undefined) patch.toolAllowlist = parsedBody.data.toolAllowlist;
  if (nextRunAt !== undefined) patch.nextRunAt = nextRunAt;

  const repository = createSupabaseHarwickLoopRepository(createServerSupabaseClient());
  const updated = await repository.updateLoop({
    workspaceId: workspaceId.data,
    loopId: loopId.data,
    patch,
    nowIso: new Date().toISOString(),
  });
  return NextResponse.json(updated);
}
