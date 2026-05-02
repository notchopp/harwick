import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { loadLeadsPageData } from "../../../features/leads/leads-data";
import { authorizeWorkspaceRequest } from "../../../lib/api/workspace-auth";
import { createSupabaseLeadsPageRepository } from "../../../lib/supabase/leads-page";
import { createServerSupabaseClient } from "../../../lib/supabase/server-client";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const requestedWorkspaceId = request.nextUrl.searchParams.get("workspaceId");
  const parsedWorkspaceId = UuidSchema.safeParse(requestedWorkspaceId);
  if (!parsedWorkspaceId.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam === null ? undefined : Number(limitParam);
  if (limitParam !== null && (!Number.isInteger(limit) || (limit ?? 0) <= 0)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const workspaceId = parsedWorkspaceId.data;
  const membership = await authorizeWorkspaceRequest({
    request,
    workspaceId,
  });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const data = await loadLeadsPageData({
      workspaceId,
      viewer: {
        memberId: membership.memberId,
        role: membership.role,
      },
      repository: createSupabaseLeadsPageRepository(createServerSupabaseClient()),
      ...(limit !== undefined && Number.isInteger(limit) && limit > 0 ? { limit } : {}),
    });

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error("GET /api/leads error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
