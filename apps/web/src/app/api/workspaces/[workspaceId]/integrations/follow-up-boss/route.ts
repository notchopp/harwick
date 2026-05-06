import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import {
  FollowUpBossConnectionValidationError,
  connectWorkspaceFollowUpBossIntegration,
} from "../../../../../../features/integrations/follow-up-boss-connection";
import { authorizeWorkspaceRequest } from "../../../../../../lib/api/workspace-auth";
import { getServerEnvironment } from "../../../../../../lib/server-env";
import { createSupabaseFollowUpBossCredentialRepository } from "../../../../../../lib/supabase/follow-up-boss";
import { createServerSupabaseClient } from "../../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    workspaceId: string;
  }>;
};

const fubConnectAllowedRoles = new Set(["owner", "admin", "team_lead", "lead_manager"] as const);

export async function POST(request: NextRequest, context: RouteContext) {
  const { workspaceId } = await context.params;
  const membership = await authorizeWorkspaceRequest({
    request,
    workspaceId,
    allowedRoles: fubConnectAllowedRoles,
  });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const environment = getServerEnvironment();
  if (environment.CREDENTIAL_ENCRYPTION_KEY === undefined) {
    return NextResponse.json({ error: "credential_encryption_not_configured" }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const result = await connectWorkspaceFollowUpBossIntegration({
      workspaceId,
      request: body,
      credentialSecret: environment.CREDENTIAL_ENCRYPTION_KEY,
      repository: createSupabaseFollowUpBossCredentialRepository(createServerSupabaseClient()),
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    if (error instanceof FollowUpBossConnectionValidationError) {
      return NextResponse.json(error.result, { status: 400 });
    }

    throw error;
  }
}
