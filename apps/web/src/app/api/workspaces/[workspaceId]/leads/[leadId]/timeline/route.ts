import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { authorizeWorkspaceRequest } from "../../../../../../../lib/api/workspace-auth";
import { loadLeadTimeline } from "../../../../../../../features/operations/workspace-operations";
import { createSupabaseWorkspaceOperationsRepository } from "../../../../../../../lib/supabase/operations";
import { createServerSupabaseClient } from "../../../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    workspaceId: string;
    leadId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { workspaceId, leadId } = await context.params;
  if (!UuidSchema.safeParse(workspaceId).success || !UuidSchema.safeParse(leadId).success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({ request, workspaceId });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const timeline = await loadLeadTimeline({
    workspaceId,
    leadId,
    repository: createSupabaseWorkspaceOperationsRepository(createServerSupabaseClient()),
  });

  return NextResponse.json(timeline, { status: 200 });
}
