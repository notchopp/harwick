import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import {
  listManualListingFacts,
  upsertManualListingFact,
} from "../../../../../features/listings/manual-listings";
import { getAuthSessionSummary } from "../../../../../lib/supabase/auth";
import { createSupabaseListingFactsRepository } from "../../../../../lib/supabase/listings";
import {
  createServerSupabaseClient,
  createUserSupabaseClient,
} from "../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    workspaceId: string;
  }>;
};

const listingWriteAllowedRoles = new Set(["owner", "admin", "lead_manager"]);

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

async function authorizeWorkspaceRequest(request: NextRequest, workspaceId: string) {
  const accessToken = readBearerToken(request);
  if (accessToken === null) {
    return null;
  }

  const userSupabase = createUserSupabaseClient(accessToken);
  const session = await getAuthSessionSummary({
    supabase: userSupabase,
    accessToken,
  });

  return session?.memberships.find((candidate) => candidate.workspaceId === workspaceId) ?? null;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { workspaceId } = await context.params;
  const membership = await authorizeWorkspaceRequest(request, workspaceId);
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
  const membership = await authorizeWorkspaceRequest(request, workspaceId);
  if (membership === null) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!listingWriteAllowedRoles.has(membership.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const listing = await upsertManualListingFact({
      workspaceId,
      request: body,
      repository: createSupabaseListingFactsRepository(createServerSupabaseClient()),
    });

    return NextResponse.json({ listing }, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    throw error;
  }
}
