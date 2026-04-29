import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { verifyManualListingFact } from "../../../../../../../features/listings/manual-listings";
import { getAuthSessionSummary } from "../../../../../../../lib/supabase/auth";
import { createSupabaseListingFactsRepository } from "../../../../../../../lib/supabase/listings";
import {
  createServerSupabaseClient,
  createUserSupabaseClient,
} from "../../../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    workspaceId: string;
    listingId: string;
  }>;
};

const listingVerifyAllowedRoles = new Set(["owner", "admin", "lead_manager"]);

function readBearerToken(request: NextRequest): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization === null) {
    return null;
  }

  const [scheme, token] = authorization.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || token === undefined || token.trim().length === 0) {
    return null;
  }

  return token.trim();
}

async function authorizeWorkspaceVerify(request: NextRequest, workspaceId: string) {
  const accessToken = readBearerToken(request);
  if (accessToken === null) {
    return null;
  }

  const userSupabase = createUserSupabaseClient(accessToken);
  const session = await getAuthSessionSummary({
    supabase: userSupabase,
    accessToken,
  });
  const membership = session?.memberships.find((candidate) => candidate.workspaceId === workspaceId) ?? null;
  if (membership === null || !listingVerifyAllowedRoles.has(membership.role)) {
    return null;
  }

  return membership;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { workspaceId, listingId } = await context.params;
  if (!UuidSchema.safeParse(listingId).success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceVerify(request, workspaceId);
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  try {
    const listing = await verifyManualListingFact({
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
