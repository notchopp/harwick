import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";

import { authorizeWorkspaceRequest } from "../../../../lib/api/workspace-auth";
import { createServerSupabaseClient } from "../../../../lib/supabase/server-client";
import { loadBuyerChatTranscriptByLeadId } from "../../../../features/conversations/listing-chats-data";

export const runtime = "nodejs";

/**
 * Returns the full transcript for a buyer-chat session linked to a lead.
 * Used by the /conversations detail pane for threads where source ==
 * 'listing_chat' so the operator sees the actual visitor ↔ harwick
 * conversation instead of the Meta-style synthesis/draft chrome.
 */
export async function GET(request: NextRequest) {
  const workspaceIdParam = request.nextUrl.searchParams.get("workspaceId");
  const leadIdParam = request.nextUrl.searchParams.get("leadId");
  const parsedWorkspace = UuidSchema.safeParse(workspaceIdParam);
  const parsedLead = UuidSchema.safeParse(leadIdParam);
  if (!parsedWorkspace.success || !parsedLead.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({
    request,
    workspaceId: parsedWorkspace.data,
  });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();
  const transcript = await loadBuyerChatTranscriptByLeadId({
    supabase,
    workspaceId: parsedWorkspace.data,
    leadId: parsedLead.data,
  });

  if (transcript === null) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ transcript });
}
