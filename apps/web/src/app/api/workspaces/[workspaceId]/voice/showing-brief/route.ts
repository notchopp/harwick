import { UuidSchema, VoiceShowingBriefQuerySchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { buildVoiceShowingBrief } from "../../../../../../features/voice/voice-briefs";
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

  try {
    const query = VoiceShowingBriefQuerySchema.parse({
      leadId: request.nextUrl.searchParams.get("leadId"),
      taskId: request.nextUrl.searchParams.get("taskId") ?? undefined,
    });

    const brief = await buildVoiceShowingBrief({
      workspaceId,
      query,
      repository: createSupabaseVoiceBriefsRepository(createServerSupabaseClient()),
    });
    if (brief === null) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json(brief, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    throw error;
  }
}
