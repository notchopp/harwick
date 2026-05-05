import {
  UuidSchema,
  WorkspacePolicyNarrativeResponseSchema,
  WorkspacePolicyNarrativeUpdateRequestSchema,
} from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { authorizeWorkspaceRequest } from "../../../../../lib/api/workspace-auth";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server-client";
import { createSupabaseWorkspacePolicyNarrativeRepository } from "../../../../../lib/supabase/workspace-policy-narrative";

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

  const repository = createSupabaseWorkspacePolicyNarrativeRepository(createServerSupabaseClient());
  const record = await repository.readRecord(workspaceId.data);
  return NextResponse.json(WorkspacePolicyNarrativeResponseSchema.parse(record));
}

export async function PATCH(
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

  const parsedBody = WorkspacePolicyNarrativeUpdateRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const repository = createSupabaseWorkspacePolicyNarrativeRepository(createServerSupabaseClient());
  await repository.write({
    workspaceId: workspaceId.data,
    body: parsedBody.data.body,
    source: "manual",
  });

  const record = await repository.readRecord(workspaceId.data);
  return NextResponse.json(WorkspacePolicyNarrativeResponseSchema.parse(record));
}
