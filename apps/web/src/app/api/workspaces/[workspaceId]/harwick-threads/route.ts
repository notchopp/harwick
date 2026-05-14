import { UuidSchema, HarwickChatThreadCreateSchema, type HarwickChatThread } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";

import { authorizeWorkspaceRequest } from "../../../../../lib/api/workspace-auth";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

type ThreadRow = {
  id: string;
  workspace_id: string;
  created_by_member_id: string | null;
  title: string;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  archived_at: string | null;
};

function toThread(row: ThreadRow): HarwickChatThread {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    createdByMemberId: row.created_by_member_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at,
    archivedAt: row.archived_at,
  };
}

export async function GET(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId: rawWorkspaceId } = await context.params;
  const parsed = UuidSchema.safeParse(rawWorkspaceId);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_workspace" }, { status: 400 });
  }
  const workspaceId = parsed.data;

  const membership = await authorizeWorkspaceRequest({ request, workspaceId });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("harwick_chat_threads")
    .select("id, workspace_id, created_by_member_id, title, created_at, updated_at, last_message_at, archived_at")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(40);

  if (error !== null) {
    return NextResponse.json({ error: "list_failed", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ threads: (data ?? []).map(toThread) });
}

export async function POST(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId: rawWorkspaceId } = await context.params;
  const parsed = UuidSchema.safeParse(rawWorkspaceId);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_workspace" }, { status: 400 });
  }
  const workspaceId = parsed.data;

  const membership = await authorizeWorkspaceRequest({ request, workspaceId });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const rawBody = (await request.json().catch(() => ({}))) as unknown;
  const parsedBody = HarwickChatThreadCreateSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsedBody.error.issues }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("harwick_chat_threads")
    .insert({
      workspace_id: workspaceId,
      created_by_member_id: membership.memberId,
      title: parsedBody.data.title ?? "New chat",
    })
    .select("id, workspace_id, created_by_member_id, title, created_at, updated_at, last_message_at, archived_at")
    .single();

  if (error !== null || data === null) {
    return NextResponse.json({ error: "create_failed", detail: error?.message ?? "unknown" }, { status: 500 });
  }

  return NextResponse.json({ thread: toThread(data) }, { status: 201 });
}
