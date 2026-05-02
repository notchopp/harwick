import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { importManualListingCsv } from "../../../../../../features/listings/manual-listings";
import { authorizeWorkspaceRequest } from "../../../../../../lib/api/workspace-auth";
import { createSupabaseListingFactsRepository } from "../../../../../../lib/supabase/listings";
import { createServerSupabaseClient } from "../../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    workspaceId: string;
  }>;
};

const listingImportAllowedRoles = new Set(["owner", "admin", "team_lead", "lead_manager", "operator", "agent"] as const);

export async function POST(request: NextRequest, context: RouteContext) {
  const { workspaceId } = await context.params;
  const membership = await authorizeWorkspaceRequest({
    request,
    workspaceId,
    allowedRoles: listingImportAllowedRoles,
  });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    const contentType = request.headers.get("content-type") ?? "";
    body = contentType.includes("text/csv")
      ? { csv: await request.text() }
      : await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const result = await importManualListingCsv({
      workspaceId,
      memberId: membership.memberId,
      request: body,
      repository: createSupabaseListingFactsRepository(createServerSupabaseClient()),
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    throw error;
  }
}
