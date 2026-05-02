import { NextResponse, type NextRequest } from "next/server";
import { testFollowUpBossConnection } from "../../../../../../../features/integrations/follow-up-boss-test";
import { authorizeWorkspaceRequest } from "../../../../../../../lib/api/workspace-auth";
import { getServerEnvironment } from "../../../../../../../lib/server-env";
import { createSupabaseFollowUpBossCredentialRepository } from "../../../../../../../lib/supabase/follow-up-boss";
import { createServerSupabaseClient } from "../../../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    workspaceId: string;
  }>;
};

const fubTestAllowedRoles = new Set(["owner", "admin", "team_lead", "lead_manager"] as const);

/**
 * POST /api/workspaces/[workspaceId]/integrations/follow-up-boss/test
 * Test Follow Up Boss connection with saved credentials
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { workspaceId } = await context.params;
  const membership = await authorizeWorkspaceRequest({
    request,
    workspaceId,
    allowedRoles: fubTestAllowedRoles,
  });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const environment = getServerEnvironment();
  if (environment.CREDENTIAL_ENCRYPTION_KEY === undefined) {
    return NextResponse.json({ error: "credential_encryption_not_configured" }, { status: 500 });
  }

  try {
    const result = await testFollowUpBossConnection({
      workspaceId,
      credentialSecret: environment.CREDENTIAL_ENCRYPTION_KEY,
      repository: createSupabaseFollowUpBossCredentialRepository(createServerSupabaseClient()),
    });

    if (result.success) {
      return NextResponse.json(result, { status: 200 });
    }

    // Return 400 for credential/auth failures, 500 for other errors
    const statusCode = result.errorCode === "credential_not_found" ? 400 : 400;
    return NextResponse.json(result, { status: statusCode });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message, errorCode: "internal_error" },
      { status: 500 },
    );
  }
}
