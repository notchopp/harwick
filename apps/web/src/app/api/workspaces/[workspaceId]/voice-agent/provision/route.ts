import { NextResponse, type NextRequest } from "next/server";
import { getServerEnvironment } from "../../../../../../lib/server-env";
import {
  createServerSupabaseClient,
  createUserSupabaseClient,
} from "../../../../../../lib/supabase/server-client";
import { getAuthSessionSummary } from "../../../../../../lib/supabase/auth";
import { createSupabaseVoiceAgentRepository } from "../../../../../../lib/supabase/voice-agents";
import { provisionWorkspaceVoiceAgent } from "../../../../../../features/voice-agent/provision-workspace-voice-agent";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    workspaceId: string;
  }>;
};

const workspaceProvisionAllowedRoles = new Set(["owner", "admin", "lead_manager"]);

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

  const { workspaceId } = await context.params;
  const userSupabase = createUserSupabaseClient(accessToken);
  const session = await getAuthSessionSummary({
    supabase: userSupabase,
    accessToken,
  });

  if (session === null) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = session.memberships.find((candidate) => candidate.workspaceId === workspaceId);
  if (membership === undefined) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
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
