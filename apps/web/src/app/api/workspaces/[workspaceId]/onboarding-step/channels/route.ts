import {
  RegisterChannelIntentInputSchema,
  UuidSchema,
  isOnboardingComplete,
} from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";

import { authorizeWorkspaceRequest } from "../../../../../../lib/api/workspace-auth";
import { createServerSupabaseClient } from "../../../../../../lib/supabase/server-client";
import {
  markOnboardingBeatComplete,
  persistChannelIntents,
} from "../../../../../../lib/supabase/workspace-onboarding";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId: rawWorkspaceId } = await context.params;
  const parsed = UuidSchema.safeParse(rawWorkspaceId);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_workspace" }, { status: 400 });
  }
  const workspaceId = parsed.data;

  const membership = await authorizeWorkspaceRequest({
    request,
    workspaceId,
    allowedRoles: new Set(["owner", "admin"] as const),
  });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = RegisterChannelIntentInputSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "invalid_request", issues: body.error.issues }, { status: 400 });
  }

  try {
    const supabase = createServerSupabaseClient();
    const saved = await persistChannelIntents(supabase, workspaceId, body.data);
    const state = await markOnboardingBeatComplete(supabase, workspaceId, "channel_intent");
    return NextResponse.json(
      { savedCount: saved.length, state, completed: isOnboardingComplete(state) },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "channel_intents_persist_failed",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
