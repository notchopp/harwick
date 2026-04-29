import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { importManualListingCsv } from "../../../../../../features/listings/manual-listings";
import { getAuthSessionSummary } from "../../../../../../lib/supabase/auth";
import { createSupabaseListingFactsRepository } from "../../../../../../lib/supabase/listings";
import {
  createServerSupabaseClient,
  createUserSupabaseClient,
} from "../../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    workspaceId: string;
  }>;
};

const listingImportAllowedRoles = new Set(["owner", "admin", "lead_manager"]);

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

async function authorizeWorkspaceImport(request: NextRequest, workspaceId: string) {
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
  if (membership === null || !listingImportAllowedRoles.has(membership.role)) {
    return null;
  }

  return membership;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { workspaceId } = await context.params;
  const membership = await authorizeWorkspaceImport(request, workspaceId);
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
