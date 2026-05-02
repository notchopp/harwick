import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { loadFollowUpBossConflictQueue } from "../../../../../../features/operations/follow-up-boss-conflicts";
import { authorizeWorkspaceRequest } from "../../../../../../lib/api/workspace-auth";
import { createSupabaseFollowUpBossConflictRepository } from "../../../../../../lib/supabase/follow-up-boss-conflicts";
import { createServerSupabaseClient } from "../../../../../../lib/supabase/server-client";

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

  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam === null ? undefined : Number(limitParam);
  const input: Parameters<typeof loadFollowUpBossConflictQueue>[0] = {
    workspaceId,
    repository: createSupabaseFollowUpBossConflictRepository(createServerSupabaseClient()),
  };
  if (limit !== undefined && Number.isInteger(limit) && limit > 0) {
    input.limit = limit;
  }

  return NextResponse.json(await loadFollowUpBossConflictQueue(input), { status: 200 });
}
