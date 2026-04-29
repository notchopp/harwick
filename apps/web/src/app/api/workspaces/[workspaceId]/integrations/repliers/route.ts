import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { connectWorkspaceRepliersIntegration } from "../../../../../../features/listings/repliers-connection";
import { getServerEnvironment } from "../../../../../../lib/server-env";
import { getAuthSessionSummary } from "../../../../../../lib/supabase/auth";
import { createSupabaseRepliersCredentialRepository } from "../../../../../../lib/supabase/integration-accounts";
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

const repliersConnectAllowedRoles = new Set(["owner", "admin", "lead_manager"]);

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

export async function POST(request: NextRequest, context: RouteContext) {
  const accessToken = readBearerToken(request);
  if (accessToken === null) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const environment = getServerEnvironment();
  if (environment.CREDENTIAL_ENCRYPTION_KEY === undefined) {
    return NextResponse.json({ error: "credential_encryption_not_configured" }, { status: 500 });
  }

  const { workspaceId } = await context.params;
  const userSupabase = createUserSupabaseClient(accessToken);
  const session = await getAuthSessionSummary({
    supabase: userSupabase,
    accessToken,
  });

  if (session === null) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const membership = session.memberships.find((candidate) => candidate.workspaceId === workspaceId);
  if (membership === undefined || !repliersConnectAllowedRoles.has(membership.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const result = await connectWorkspaceRepliersIntegration({
      workspaceId,
      request: body,
      credentialSecret: environment.CREDENTIAL_ENCRYPTION_KEY,
      repository: createSupabaseRepliersCredentialRepository(createServerSupabaseClient()),
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    throw error;
  }
}
