import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { loadOpenHouseAttendees } from "../../../../../../../features/public-listings/open-house-attendees";
import { authorizeWorkspaceRequest } from "../../../../../../../lib/api/workspace-auth";
import { createSupabaseOpenHouseAttendeesRepository } from "../../../../../../../lib/supabase/open-house-attendees";
import { createServerSupabaseClient } from "../../../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

const attendeeRoles = new Set(["owner", "admin", "team_lead", "lead_manager", "operator", "agent"] as const);

type RouteContext = {
  params: Promise<{
    workspaceId: string;
    listingId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { workspaceId, listingId } = await context.params;
  if (!UuidSchema.safeParse(workspaceId).success || !UuidSchema.safeParse(listingId).success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({
    request,
    workspaceId,
    allowedRoles: attendeeRoles,
  });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam === null ? undefined : Number(limitParam);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 250)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const data = await loadOpenHouseAttendees({
    workspaceId,
    listingId,
    repository: createSupabaseOpenHouseAttendeesRepository(createServerSupabaseClient()),
    ...(limit === undefined ? {} : { limit }),
  });

  return NextResponse.json(data, { status: 200 });
}
