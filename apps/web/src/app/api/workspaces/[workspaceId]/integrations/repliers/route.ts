import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { connectWorkspaceRepliersIntegration } from "../../../../../../features/listings/repliers-connection";
import { authorizeWorkspaceRequest } from "../../../../../../lib/api/workspace-auth";
import { getServerEnvironment } from "../../../../../../lib/server-env";
import { createSupabaseRepliersCredentialRepository } from "../../../../../../lib/supabase/integration-accounts";
import { createServerSupabaseClient } from "../../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    workspaceId: string;
  }>;
};

const repliersConnectAllowedRoles = new Set(["owner", "admin", "team_lead", "lead_manager"] as const);

export async function POST(request: NextRequest, context: RouteContext) {
  const environment = getServerEnvironment();
  if (environment.CREDENTIAL_ENCRYPTION_KEY === undefined) {
    return NextResponse.json({ error: "credential_encryption_not_configured" }, { status: 500 });
  }

  const { workspaceId } = await context.params;
  const membership = await authorizeWorkspaceRequest({
    request,
    workspaceId,
    allowedRoles: repliersConnectAllowedRoles,
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
