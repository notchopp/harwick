import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { updateConversationAutomation } from "../../../../../../../features/conversations/conversation-automation-control";
import { authorizeWorkspaceRequest } from "../../../../../../../lib/api/workspace-auth";
import { createSupabaseSocialReplyQueueRepository } from "../../../../../../../lib/supabase/operator-queues";
import { createSupabaseConversationAutomationRepository } from "../../../../../../../lib/supabase/conversation-automation";
import { createServerSupabaseClient } from "../../../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    workspaceId: string;
    reviewId: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { workspaceId, reviewId } = await context.params;
  if (!UuidSchema.safeParse(workspaceId).success || !UuidSchema.safeParse(reviewId).success) {
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
    // Look up the social reply review to get the leadId
    const queueRepository = createSupabaseSocialReplyQueueRepository(createServerSupabaseClient());
    const review = await queueRepository.findSocialReplyReview({
      workspaceId,
      reviewId,
    });

    if (review === null || review.leadId === null) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // Update conversation_automation_states using the lead ID (unified endpoint)
    const automationRepository = createSupabaseConversationAutomationRepository(createServerSupabaseClient());
    const result = await updateConversationAutomation({
      workspaceId,
      conversationId: review.leadId, // leadId is the conversation ID
      memberId: membership.memberId,
      request: body,
      repository: automationRepository,
    });

    if (result.status !== 200) {
      return NextResponse.json(result.body, { status: result.status });
    }

    // Return the updated review for compatibility
    const updatedReview = await queueRepository.findSocialReplyReview({
      workspaceId,
      reviewId,
    });

    return NextResponse.json({ item: updatedReview }, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[SOCIAL QUEUE AUTOMATION PATCH] Error:", { errorMessage, error });
    return NextResponse.json({ error: "internal_server_error", details: errorMessage }, { status: 500 });
  }
}
