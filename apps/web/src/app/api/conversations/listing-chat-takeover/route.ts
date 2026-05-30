import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";

import { authorizeWorkspaceRequest } from "../../../../lib/api/workspace-auth";
import { createServerSupabaseClient } from "../../../../lib/supabase/server-client";

export const runtime = "nodejs";

/**
 * /convos take-over endpoints. Phase 1:
 *   POST   → operator claims a buyer-chat session. Harwick stops auto-
 *            responding on that session's next turn; buyer sees one
 *            "an agent is jumping in" message instead.
 *   DELETE → operator releases the session back to Harwick.
 *
 * Phase 2 (not in this commit): operator-message injection — operator
 * types a manual message into /convos that lands in the buyer's chat
 * (real-time via Supabase subscription on session turns).
 *
 * Resolution: takes leadId, finds the linked public_listing_session,
 * mutates the takeover state. Workspace-auth'd.
 */

async function resolveSessionId(supabase: ReturnType<typeof createServerSupabaseClient>, workspaceId: string, leadId: string): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const untyped = supabase as any;
  const { data } = await untyped
    .from("public_listing_sessions")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("promoted_lead_id", leadId)
    .order("last_active_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { workspaceId?: string; leadId?: string } | null;
  if (body === null) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const parsedWorkspace = UuidSchema.safeParse(body.workspaceId);
  const parsedLead = UuidSchema.safeParse(body.leadId);
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
  const sessionId = await resolveSessionId(supabase, parsedWorkspace.data, parsedLead.data);
  if (sessionId === null) {
    return NextResponse.json({ error: "session_not_found" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const untyped = supabase as any;
  await untyped
    .from("public_listing_sessions")
    .update({
      taken_over_by_member_id: membership.memberId,
      taken_over_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  return NextResponse.json({ ok: true, sessionId, takenOverByMemberId: membership.memberId });
}

export async function DELETE(request: NextRequest) {
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
  const sessionId = await resolveSessionId(supabase, parsedWorkspace.data, parsedLead.data);
  if (sessionId === null) {
    return NextResponse.json({ error: "session_not_found" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const untyped = supabase as any;
  await untyped
    .from("public_listing_sessions")
    .update({
      taken_over_by_member_id: null,
      taken_over_at: null,
    })
    .eq("id", sessionId);

  return NextResponse.json({ ok: true, sessionId });
}
