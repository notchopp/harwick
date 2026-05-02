import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { buildFallbackConversationsInbox, loadConversationsInbox } from "../../../features/conversations/conversations-data";
import { authorizeWorkspaceRequest } from "../../../lib/api/workspace-auth";
import { createSupabaseConversationsInboxRepository } from "../../../lib/supabase/conversations-page";
import { createServerSupabaseClient } from "../../../lib/supabase/server-client";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const requestedWorkspaceId = request.nextUrl.searchParams.get("workspaceId");
  const parsedWorkspaceId = UuidSchema.safeParse(requestedWorkspaceId);
  if (!parsedWorkspaceId.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam === null ? undefined : Number(limitParam);
  if (limitParam !== null && (!Number.isInteger(limit) || (limit ?? 0) <= 0)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({
    request,
    workspaceId: parsedWorkspaceId.data,
  });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const workspaceId = parsedWorkspaceId.data;
  const canUseDevelopmentDataBridge = process.env["NODE_ENV"] === "development";

  try {
    const data = await loadConversationsInbox({
      workspaceId,
      repository: createSupabaseConversationsInboxRepository(createServerSupabaseClient()),
      ...(limit === undefined ? {} : { limit }),
    });

    if (canUseDevelopmentDataBridge && data.threads.length === 0) {
      return NextResponse.json(buildFallbackConversationsInbox(workspaceId), { status: 200 });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    if (canUseDevelopmentDataBridge) {
      console.error("GET /api/conversations fallback:", error);
      return NextResponse.json(buildFallbackConversationsInbox(workspaceId), { status: 200 });
    }

    console.error("GET /api/conversations error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
