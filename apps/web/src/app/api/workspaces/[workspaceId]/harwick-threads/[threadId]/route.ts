import { UuidSchema, HarwickChatThreadUpdateSchema, type HarwickChatThread } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";

import { authorizeWorkspaceRequest } from "../../../../../../lib/api/workspace-auth";
import { createServerSupabaseClient } from "../../../../../../lib/supabase/server-client";

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

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string; threadId: string }> },
) {
  const { workspaceId: rawWorkspaceId, threadId: rawThreadId } = await context.params;
  const parsedWorkspaceId = UuidSchema.safeParse(rawWorkspaceId);
  const parsedThreadId = UuidSchema.safeParse(rawThreadId);
  if (!parsedWorkspaceId.success || !parsedThreadId.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({ request, workspaceId: parsedWorkspaceId.data });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const rawBody = (await request.json().catch(() => ({}))) as unknown;
  const parsedBody = HarwickChatThreadUpdateSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsedBody.error.issues }, { status: 400 });
  }

  const patch: { title?: string; archived_at?: string | null; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (parsedBody.data.title !== undefined) patch.title = parsedBody.data.title;
  if (parsedBody.data.archived === true) patch.archived_at = new Date().toISOString();
  if (parsedBody.data.archived === false) patch.archived_at = null;

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("harwick_chat_threads")
    .update(patch)
    .eq("workspace_id", parsedWorkspaceId.data)
    .eq("id", parsedThreadId.data)
    .select("id, workspace_id, created_by_member_id, title, created_at, updated_at, last_message_at, archived_at")
    .maybeSingle();

  if (error !== null || data === null) {
    return NextResponse.json({ error: "update_failed", detail: error?.message ?? "not_found" }, { status: 404 });
  }

  return NextResponse.json({ thread: toThread(data) });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string; threadId: string }> },
) {
  const { workspaceId: rawWorkspaceId, threadId: rawThreadId } = await context.params;
  const parsedWorkspaceId = UuidSchema.safeParse(rawWorkspaceId);
  const parsedThreadId = UuidSchema.safeParse(rawThreadId);
  if (!parsedWorkspaceId.success || !parsedThreadId.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({ request, workspaceId: parsedWorkspaceId.data });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("harwick_chat_threads")
    .update({ archived_at: new Date().toISOString() })
    .eq("workspace_id", parsedWorkspaceId.data)
    .eq("id", parsedThreadId.data);

  if (error !== null) {
    return NextResponse.json({ error: "archive_failed", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
