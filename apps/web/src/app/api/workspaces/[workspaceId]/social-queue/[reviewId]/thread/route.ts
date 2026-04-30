import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { loadSocialConversationThread } from "../../../../../../../features/operator-queues/operator-queues";
import { authorizeWorkspaceRequest } from "../../../../../../../lib/api/workspace-auth";
import { createSupabaseSocialReplyQueueRepository } from "../../../../../../../lib/supabase/operator-queues";
import { createServerSupabaseClient } from "../../../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    workspaceId: string;
    reviewId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { workspaceId, reviewId } = await context.params;
  if (!UuidSchema.safeParse(workspaceId).success || !UuidSchema.safeParse(reviewId).success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({ request, workspaceId });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const result = await loadSocialConversationThread({
    workspaceId,
    reviewId,
    repository: createSupabaseSocialReplyQueueRepository(createServerSupabaseClient()),
  });

  if (result === null) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(result, { status: 200 });
}
