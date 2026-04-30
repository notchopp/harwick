import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { authorizeWorkspaceRequest } from "../../../../../lib/api/workspace-auth";
import { loadSocialReplyQueue } from "../../../../../features/operator-queues/operator-queues";
import { createSupabaseSocialReplyQueueRepository } from "../../../../../lib/supabase/operator-queues";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server-client";

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

  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam === null ? undefined : Number(limitParam);
  const queueInput: Parameters<typeof loadSocialReplyQueue>[0] = {
    workspaceId,
    repository: createSupabaseSocialReplyQueueRepository(createServerSupabaseClient()),
  };
  if (limit !== undefined && Number.isInteger(limit) && limit > 0) {
    queueInput.limit = limit;
  }
  const queue = await loadSocialReplyQueue(queueInput);

  return NextResponse.json(queue, { status: 200 });
}
