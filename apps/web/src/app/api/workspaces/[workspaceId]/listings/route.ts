import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import {
  listManualListingFacts,
  upsertManualListingFact,
} from "../../../../../features/listings/manual-listings";
import { authorizeWorkspaceRequest } from "../../../../../lib/api/workspace-auth";
import { checkListingLimit } from "../../../../../lib/supabase/billing";
import { createSupabaseListingFactsRepository } from "../../../../../lib/supabase/listings";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    workspaceId: string;
  }>;
};

const listingWriteAllowedRoles = new Set(["owner", "admin", "team_lead", "lead_manager", "operator", "agent"] as const);

export async function GET(request: NextRequest, context: RouteContext) {
  const { workspaceId } = await context.params;
  const membership = await authorizeWorkspaceRequest({
    request,
    workspaceId,
  });
  if (membership === null) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam === null ? 50 : Number(limitParam);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const listings = await listManualListingFacts({
    workspaceId,
    limit,
    repository: createSupabaseListingFactsRepository(createServerSupabaseClient()),
  });

  return NextResponse.json({ listings }, { status: 200 });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { workspaceId } = await context.params;
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

  const supabase = createServerSupabaseClient();

  const listingLimitCheck = await checkListingLimit(supabase, workspaceId);
  if (!listingLimitCheck.allowed) {
    return NextResponse.json(
      {
        error: "plan_limit_reached",
        message: listingLimitCheck.reason,
        currentCount: listingLimitCheck.currentCount,
        maxCount: listingLimitCheck.maxCount,
      },
      { status: 402 }
    );
  }

  try {
    const listing = await upsertManualListingFact({
      workspaceId,
      request: body,
      repository: createSupabaseListingFactsRepository(supabase),
    });

    return NextResponse.json({ listing }, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    throw error;
  }
}
