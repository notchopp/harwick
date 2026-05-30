import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";

import { authorizeWorkspaceRequest } from "../../../../lib/api/workspace-auth";
import { createServerSupabaseClient } from "../../../../lib/supabase/server-client";
import { loadBuyerChatThreads } from "../../../../features/conversations/listing-chats-data";

export const runtime = "nodejs";

/**
 * Lists in-progress public-listing-chat sessions for /conversations.
 *
 * Powers the "buyer chats" section of the /conversations refactor —
 * shows live + recent visitor conversations BEFORE they promote to a
 * lead, with the auto-generated profile (name, headline, life context)
 * the model has built turn-by-turn.
 *
 * Auth: workspace membership (operator-only view, never public).
 * Returns: top N sessions ordered by last_active_at, default 30.
 */
export async function GET(request: NextRequest) {
  const workspaceIdParam = request.nextUrl.searchParams.get("workspaceId");
  const parsed = UuidSchema.safeParse(workspaceIdParam);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({
    request,
    workspaceId: parsed.data,
  });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam === null ? 30 : Math.max(1, Math.min(100, Number(limitParam) || 30));

  const supabase = createServerSupabaseClient();
  const threads = await loadBuyerChatThreads({
    supabase,
    workspaceId: parsed.data,
    limit,
  });

  return NextResponse.json({ threads });
}
