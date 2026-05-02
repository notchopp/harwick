import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { authorizeWorkspaceRequest } from "../../../../../lib/api/workspace-auth";
import { loadOperationsQueueSummary } from "../../../../../features/operations/workspace-operations";
import { createSupabaseWorkspaceOperationsRepository } from "../../../../../lib/supabase/operations";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    workspaceId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { workspaceId } = await context.params;
  if (!UuidSchema.safeParse(workspaceId).success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const allowedRoles = new Set(["owner", "admin", "team_lead", "lead_manager", "operator"] as const);
  const membership = await authorizeWorkspaceRequest({ request, workspaceId, allowedRoles });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const summary = await loadOperationsQueueSummary({
    workspaceId,
    repository: createSupabaseWorkspaceOperationsRepository(createServerSupabaseClient()),
  });

  return NextResponse.json(summary, { status: 200 });
}
