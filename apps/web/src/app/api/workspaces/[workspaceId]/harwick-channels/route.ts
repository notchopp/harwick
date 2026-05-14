import { UuidSchema, HarwickChannelCreateSchema, type HarwickChannel } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";

import { authorizeWorkspaceRequest } from "../../../../../lib/api/workspace-auth";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

type ChannelRow = {
  id: string;
  workspace_id: string;
  kind: string;
  name: string;
  description: string | null;
  created_by_member_id: string | null;
  created_by_kind: string;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  archived_at: string | null;
};

function toChannel(row: ChannelRow): HarwickChannel {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    kind: (row.kind as HarwickChannel["kind"]),
    name: row.name,
    description: row.description,
    createdByMemberId: row.created_by_member_id,
    createdByKind: (row.created_by_kind as HarwickChannel["createdByKind"]),
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
  // Service-role: filter to channels the caller is a member of (RLS isn't on
  // this client, so we apply the membership filter explicitly).
  const { data: memberRows, error: memberError } = await supabase
    .from("harwick_channel_members")
    .select("channel_id")
    .eq("workspace_id", workspaceId)
    .eq("member_id", membership.memberId);

  if (memberError !== null) {
    return NextResponse.json({ error: "list_failed", detail: memberError.message }, { status: 500 });
  }
  const channelIds = (memberRows ?? []).map((row) => row.channel_id);
  if (channelIds.length === 0) {
    return NextResponse.json({ channels: [] });
  }

  const { data, error } = await supabase
    .from("harwick_channels")
    .select("id, workspace_id, kind, name, description, created_by_member_id, created_by_kind, created_at, updated_at, last_message_at, archived_at")
    .eq("workspace_id", workspaceId)
    .in("id", channelIds)
    .is("archived_at", null)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(80);

  if (error !== null) {
    return NextResponse.json({ error: "list_failed", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ channels: (data ?? []).map(toChannel) });
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
  const parsedBody = HarwickChannelCreateSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsedBody.error.issues }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data: channelData, error: channelError } = await supabase
    .from("harwick_channels")
    .insert({
      workspace_id: workspaceId,
      kind: parsedBody.data.kind,
      name: parsedBody.data.name,
      description: parsedBody.data.description ?? null,
      created_by_member_id: membership.memberId,
      created_by_kind: "member",
    })
    .select("id, workspace_id, kind, name, description, created_by_member_id, created_by_kind, created_at, updated_at, last_message_at, archived_at")
    .single();

  if (channelError !== null || channelData === null) {
    return NextResponse.json({ error: "create_failed", detail: channelError?.message ?? "unknown" }, { status: 500 });
  }

  const memberIds = Array.from(new Set([membership.memberId, ...parsedBody.data.memberIds]));
  const memberRows = memberIds.map((memberId) => ({
    channel_id: channelData.id,
    member_id: memberId,
    workspace_id: workspaceId,
  }));
  const { error: memberInsertError } = await supabase.from("harwick_channel_members").insert(memberRows);
  if (memberInsertError !== null) {
    // Channel exists but members weren't fully added — surface so we can fix.
    return NextResponse.json(
      { channel: toChannel(channelData), warning: `member_insert_failed: ${memberInsertError.message}` },
      { status: 201 },
    );
  }

  return NextResponse.json({ channel: toChannel(channelData) }, { status: 201 });
}
