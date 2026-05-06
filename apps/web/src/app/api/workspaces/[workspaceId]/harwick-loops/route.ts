import {
  HarwickLoopCreateRequestSchema,
  HarwickLoopCreateSchema,
  HarwickLoopListResponseSchema,
  UuidSchema,
} from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { computeNextHarwickLoopRunAt } from "../../../../../features/agent-runtime/execute-harwick-loops";
import { authorizeWorkspaceRequest } from "../../../../../lib/api/workspace-auth";
import { createSupabaseHarwickLoopRepository } from "../../../../../lib/supabase/harwick-loops";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

const readRoles = new Set(["owner", "admin", "team_lead", "lead_manager", "operator", "agent", "viewer"] as const);
const writeRoles = new Set(["owner", "admin", "team_lead"] as const);

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const params = await context.params;
  const workspaceId = UuidSchema.safeParse(params.workspaceId);
  if (!workspaceId.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({
    request,
    workspaceId: workspaceId.data,
    allowedRoles: readRoles,
  });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const repository = createSupabaseHarwickLoopRepository(createServerSupabaseClient());
  const loops = await repository.listWorkspaceLoops({ workspaceId: workspaceId.data, limit: 100 });
  return NextResponse.json(HarwickLoopListResponseSchema.parse({ loops }));
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const params = await context.params;
  const workspaceId = UuidSchema.safeParse(params.workspaceId);
  if (!workspaceId.success) {
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

  const parsedBody = HarwickLoopCreateRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const nextRunAt = parsedBody.data.nextRunAt
    ?? (parsedBody.data.scheduleSpec === null
      ? null
      : computeNextHarwickLoopRunAt(parsedBody.data.scheduleSpec, new Date()));
  const loop = HarwickLoopCreateSchema.safeParse({
    workspaceId: workspaceId.data,
    createdByMemberId: membership.memberId,
    name: parsedBody.data.name,
    instruction: parsedBody.data.instruction,
    triggerType: parsedBody.data.triggerType,
    scheduleSpec: parsedBody.data.scheduleSpec,
    eventType: parsedBody.data.eventType,
    status: parsedBody.data.status,
    approvalMode: parsedBody.data.approvalMode,
    outputMode: parsedBody.data.outputMode,
    toolAllowlist: parsedBody.data.toolAllowlist,
    nextRunAt,
    lastRunAt: null,
    lastRunStatus: null,
  });
  if (!loop.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const repository = createSupabaseHarwickLoopRepository(createServerSupabaseClient());
  const created = await repository.createLoop(loop.data);
  return NextResponse.json(created, { status: 201 });
}
