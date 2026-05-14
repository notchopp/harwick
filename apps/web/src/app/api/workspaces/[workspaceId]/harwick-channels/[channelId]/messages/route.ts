import {
  UuidSchema,
  HarwickChannelMessageCreateSchema,
  detectHarwickMention,
  type HarwickChannelMessage,
} from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";

import { authorizeWorkspaceRequest } from "../../../../../../../lib/api/workspace-auth";
import { createServerSupabaseClient } from "../../../../../../../lib/supabase/server-client";
import { enqueueHarwickChannelReply } from "../../../../../../../features/harwick-chat/channel-reply";

export const runtime = "nodejs";

type MessageRow = {
  id: string;
  channel_id: string;
  workspace_id: string;
  author_kind: string;
  author_member_id: string | null;
  body: string;
  metadata: unknown;
  mentions_harwick: boolean;
  created_at: string;
  edited_at: string | null;
};

function toMessage(row: MessageRow): HarwickChannelMessage {
  return {
    id: row.id,
    channelId: row.channel_id,
    workspaceId: row.workspace_id,
    authorKind: (row.author_kind as HarwickChannelMessage["authorKind"]),
    authorMemberId: row.author_member_id,
    body: row.body,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    mentionsHarwick: row.mentions_harwick,
    createdAt: row.created_at,
    editedAt: row.edited_at,
  };
}

async function assertChannelMembership(params: {
  supabase: ReturnType<typeof createServerSupabaseClient>;
  workspaceId: string;
  channelId: string;
  memberId: string;
}): Promise<boolean> {
  const { data, error } = await params.supabase
    .from("harwick_channel_members")
    .select("channel_id")
    .eq("workspace_id", params.workspaceId)
    .eq("channel_id", params.channelId)
    .eq("member_id", params.memberId)
    .maybeSingle();
  return error === null && data !== null;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string; channelId: string }> },
) {
  const { workspaceId: rawWorkspaceId, channelId: rawChannelId } = await context.params;
  const parsedWorkspaceId = UuidSchema.safeParse(rawWorkspaceId);
  const parsedChannelId = UuidSchema.safeParse(rawChannelId);
  if (!parsedWorkspaceId.success || !parsedChannelId.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({ request, workspaceId: parsedWorkspaceId.data });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();
  const isMember = await assertChannelMembership({
    supabase,
    workspaceId: parsedWorkspaceId.data,
    channelId: parsedChannelId.data,
    memberId: membership.memberId,
  });
  if (!isMember) {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("harwick_channel_messages")
    .select("id, channel_id, workspace_id, author_kind, author_member_id, body, metadata, mentions_harwick, created_at, edited_at")
    .eq("channel_id", parsedChannelId.data)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error !== null) {
    return NextResponse.json({ error: "list_failed", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ messages: (data ?? []).map(toMessage) });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string; channelId: string }> },
) {
  const { workspaceId: rawWorkspaceId, channelId: rawChannelId } = await context.params;
  const parsedWorkspaceId = UuidSchema.safeParse(rawWorkspaceId);
  const parsedChannelId = UuidSchema.safeParse(rawChannelId);
  if (!parsedWorkspaceId.success || !parsedChannelId.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({ request, workspaceId: parsedWorkspaceId.data });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const rawBody = (await request.json().catch(() => ({}))) as unknown;
  const parsedBody = HarwickChannelMessageCreateSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsedBody.error.issues }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const isMember = await assertChannelMembership({
    supabase,
    workspaceId: parsedWorkspaceId.data,
    channelId: parsedChannelId.data,
    memberId: membership.memberId,
  });
  if (!isMember) {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 });
  }

  const mentionsHarwick = detectHarwickMention(parsedBody.data.body);
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("harwick_channel_messages")
    .insert({
      channel_id: parsedChannelId.data,
      workspace_id: parsedWorkspaceId.data,
      author_kind: "member",
      author_member_id: membership.memberId,
      body: parsedBody.data.body,
      mentions_harwick: mentionsHarwick,
    })
    .select("id, channel_id, workspace_id, author_kind, author_member_id, body, metadata, mentions_harwick, created_at, edited_at")
    .single();

  if (error !== null || data === null) {
    return NextResponse.json({ error: "create_failed", detail: error?.message ?? "unknown" }, { status: 500 });
  }

  // Touch the channel so list-order reflects the new activity.
  await supabase
    .from("harwick_channels")
    .update({ last_message_at: nowIso, updated_at: nowIso })
    .eq("id", parsedChannelId.data);

  // If the message tagged @harwick, queue a Harwick reply turn into the channel.
  // The reply runs through the same ai-sdk runtime as the rail chat.
  if (mentionsHarwick) {
    void enqueueHarwickChannelReply({
      supabase,
      workspaceId: parsedWorkspaceId.data,
      channelId: parsedChannelId.data,
      authorMessage: toMessage(data),
      operator: {
        memberId: membership.memberId,
        displayName: membership.displayName,
        role: membership.role,
        workspaceName: membership.workspaceName,
      },
    }).catch((replyError) => {
      console.error("[harwick-channel] reply enqueue failed", replyError);
    });
  }

  return NextResponse.json({ message: toMessage(data) }, { status: 201 });
}
