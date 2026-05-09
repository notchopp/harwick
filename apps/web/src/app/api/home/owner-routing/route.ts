import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { loadOwnerRouting } from "../../../../features/home/owner-home-data";
import { authorizeWorkspaceRequest } from "../../../../lib/api/workspace-auth";
import { createSupabaseRoutingDeskRepository } from "../../../../lib/supabase/routing-desk";
import { createServerSupabaseClient } from "../../../../lib/supabase/server-client";

export const runtime = "nodejs";

const ownerHomeRoles = new Set(["owner", "admin"] as const);

export async function GET(request: NextRequest) {
  try {
    const requestedWorkspaceId = request.nextUrl.searchParams.get("workspaceId");
    const parsedWorkspaceId = UuidSchema.safeParse(requestedWorkspaceId);
    if (!parsedWorkspaceId.success) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const workspaceId = parsedWorkspaceId.data;
    const authorized = await authorizeWorkspaceRequest({
      request,
      workspaceId,
      allowedRoles: ownerHomeRoles,
    });
    if (authorized === null) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const supabase = createServerSupabaseClient();
    return NextResponse.json(await loadOwnerRouting({
      workspaceId,
      repository: createSupabaseRoutingDeskRepository(supabase),
      limit: 6,
    }));
  } catch (error) {
    console.error("GET /api/home/owner-routing error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
