import { UuidSchema, VoiceShowingDebriefRequestSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { submitVoiceShowingDebrief } from "../../../../../../features/voice/voice-briefs";
import { authorizeWorkspaceRequest } from "../../../../../../lib/api/workspace-auth";
import { createServerSupabaseClient } from "../../../../../../lib/supabase/server-client";
import { createSupabaseVoiceBriefsRepository } from "../../../../../../lib/supabase/voice-briefs";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    workspaceId: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { workspaceId } = await context.params;
  if (!UuidSchema.safeParse(workspaceId).success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({ request, workspaceId });
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
    const parsed = VoiceShowingDebriefRequestSchema.parse(body);
    const result = await submitVoiceShowingDebrief({
      workspaceId,
      workspaceName: membership.workspaceName,
      request: parsed,
      repository: createSupabaseVoiceBriefsRepository(createServerSupabaseClient()),
    });
    if (result === null) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    throw error;
  }
}
