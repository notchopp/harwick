import { NextResponse, type NextRequest } from "next/server";
import { getServerEnvironment } from "../../../../../../lib/server-env";
import { authorizeWorkspaceRequest } from "../../../../../../lib/api/workspace-auth";
import { createServerSupabaseClient } from "../../../../../../lib/supabase/server-client";
import { createSupabaseVoiceAgentRepository } from "../../../../../../lib/supabase/voice-agents";
import { provisionWorkspaceVoiceAgent } from "../../../../../../features/voice-agent/provision-workspace-voice-agent";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    workspaceId: string;
  }>;
};

const workspaceProvisionAllowedRoles = new Set(["owner", "admin", "team_lead", "lead_manager"]);

export async function POST(request: NextRequest, context: RouteContext) {
  const { workspaceId } = await context.params;
  const membership = await authorizeWorkspaceRequest({
    request,
    workspaceId,
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

  const bodyRecord = body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
  const requestedAccountScope = bodyRecord["accountScope"] === "member" ? "member" : "workspace";
  const requestedOwnerMemberId = typeof bodyRecord["ownerMemberId"] === "string"
    ? bodyRecord["ownerMemberId"]
    : null;
  const canProvisionWorkspaceVoiceAgent = workspaceProvisionAllowedRoles.has(membership.role);
  const canProvisionOwnMemberVoiceAgent =
    requestedAccountScope === "member" && requestedOwnerMemberId === membership.memberId;

  if (!canProvisionWorkspaceVoiceAgent && !canProvisionOwnMemberVoiceAgent) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const result = await provisionWorkspaceVoiceAgent({
    workspaceId,
    request: body,
    dependencies: {
      repository: createSupabaseVoiceAgentRepository(createServerSupabaseClient()),
      environment: getServerEnvironment(),
    },
  });

  return NextResponse.json(result.body, { status: result.status });
}
