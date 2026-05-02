import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { quickUpdateManualListingFact } from "../../../../../../features/listings/manual-listings";
import { authorizeWorkspaceRequest } from "../../../../../../lib/api/workspace-auth";
import { createSupabaseListingFactsRepository } from "../../../../../../lib/supabase/listings";
import { createServerSupabaseClient } from "../../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    workspaceId: string;
    listingId: string;
  }>;
};

const listingWriteAllowedRoles = new Set(["owner", "admin", "team_lead", "lead_manager", "operator", "agent"] as const);

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { workspaceId, listingId } = await context.params;
  if (!UuidSchema.safeParse(listingId).success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({
    request,
    workspaceId,
    allowedRoles: listingWriteAllowedRoles,
  });
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
    const listing = await quickUpdateManualListingFact({
      workspaceId,
      listingId,
      memberId: membership.memberId,
      request: body,
      repository: createSupabaseListingFactsRepository(createServerSupabaseClient()),
    });

    if (listing === null) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({ listing }, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    throw error;
  }
}
