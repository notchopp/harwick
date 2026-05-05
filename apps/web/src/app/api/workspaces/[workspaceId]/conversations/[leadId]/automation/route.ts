import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { updateConversationAutomation } from "../../../../../../../features/conversations/conversation-automation-control";
import { recordAgentOutcome } from "../../../../../../../features/agent-runtime/record-agent-outcome";
import { authorizeWorkspaceRequest } from "../../../../../../../lib/api/workspace-auth";
import { createSupabaseAgentTrajectoryStore } from "../../../../../../../lib/supabase/agent-trajectory-store";
import { createSupabaseConversationAutomationRepository } from "../../../../../../../lib/supabase/conversation-automation";
import { createServerSupabaseClient } from "../../../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    workspaceId: string;
    leadId: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { workspaceId, leadId } = await context.params;
  if (!UuidSchema.safeParse(workspaceId).success || !UuidSchema.safeParse(leadId).success) {
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
    const supabase = createServerSupabaseClient();
    const automationRepository = createSupabaseConversationAutomationRepository(supabase);
    const result = await updateConversationAutomation({
      workspaceId,
      conversationId: leadId,
      memberId: membership.memberId,
      request: body,
      repository: automationRepository,
    });

    // Reward signal: takeover/release toggle on this thread is attributed
    // back to the latest trajectory for the lead. Takeover is negative
    // (operator had to step in); release is neutral (handing back to AI).
    if (result.status === 200 && body !== null && typeof body === "object") {
      const mode = (body as { mode?: unknown }).mode;
      const signalType = mode === "human_takeover"
        ? ("operator_takeover" as const)
        : mode === "ai_on"
          ? ("operator_release" as const)
          : null;
      if (signalType !== null) {
        const trajectoryStore = createSupabaseAgentTrajectoryStore(supabase);
        await recordAgentOutcome(supabase, trajectoryStore, {
          workspaceId,
          leadId,
          signalType,
          signalValue: {
            mode,
            memberId: membership.memberId,
            reason: (body as { reason?: string }).reason ?? null,
          },
        });
      }
    }

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[CONVERSATION AUTOMATION PATCH] Error:", { errorMessage });
    return NextResponse.json({ error: "internal_server_error" }, { status: 500 });
  }
}
