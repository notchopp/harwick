import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { buildVoiceDailyBrief } from "../../../../../../features/voice/voice-briefs";
import { authorizeWorkspaceRequest } from "../../../../../../lib/api/workspace-auth";
import { createServerSupabaseClient } from "../../../../../../lib/supabase/server-client";
import { createSupabaseVoiceBriefsRepository } from "../../../../../../lib/supabase/voice-briefs";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    workspaceId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { workspaceId } = await context.params;
  if (!UuidSchema.safeParse(workspaceId).success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({ request, workspaceId });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const brief = await buildVoiceDailyBrief({
    workspaceId,
    workspaceName: membership.workspaceName,
    repository: createSupabaseVoiceBriefsRepository(createServerSupabaseClient()),
  });

  return NextResponse.json(brief, { status: 200 });
}
