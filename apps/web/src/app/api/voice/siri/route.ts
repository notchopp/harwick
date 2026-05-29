import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { runJudgmentDefault } from "../../../../features/judgment-tools/supabase-cache";
import { createServerSupabaseClient } from "../../../../lib/supabase/server-client";

export const runtime = "nodejs";

/**
 * VOICE-1: three Siri/Assistant-callable voice endpoints.
 *
 * Surfaced as one route with an `action` discriminator so a single Siri
 * Shortcut can route by URL param. Auth via a per-workspace API key (Siri
 * Shortcuts can include a Bearer header).
 *
 *   action=quick_brief    -> "Hey Siri, brief Harwick" — returns the
 *                            owner-altitude workspace brief as plain text
 *                            for Siri to speak.
 *   action=next_action    -> "Hey Siri, what's next" — returns the top
 *                            triage item.
 *   action=log_voice_note -> POST a voice transcription as a typed-card
 *                            message into the operator's rail.
 *
 * Returns text/plain so Siri reads it naturally.
 */

const KeyHeader = "x-harwick-voice-key";

const QuerySchema = z.object({
  workspaceId: UuidSchema,
  action: z.enum(["quick_brief", "next_action", "log_voice_note"]),
  note: z.string().max(2000).optional(),
});

async function authorize(request: NextRequest, workspaceId: string): Promise<{ memberId: string } | null> {
  const headerKey = request.headers.get(KeyHeader);
  if (headerKey === null || headerKey.length < 16) return null;
  const supabase = createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const untyped = supabase as any;
  const { data } = await untyped
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("voice_api_key", headerKey)
    .eq("is_active", true)
    .maybeSingle();
  if (data === null || data === undefined) return null;
  return { memberId: data.id as string };
}

export async function GET(request: NextRequest) {
  const params = QuerySchema.safeParse({
    workspaceId: request.nextUrl.searchParams.get("workspaceId"),
    action: request.nextUrl.searchParams.get("action"),
    note: request.nextUrl.searchParams.get("note") ?? undefined,
  });
  if (!params.success) return new NextResponse("Bad request", { status: 400 });
  const auth = await authorize(request, params.data.workspaceId);
  if (auth === null) return new NextResponse("Forbidden", { status: 403 });

  if (params.data.action === "quick_brief") {
    const result = await runJudgmentDefault({
      workspaceId: params.data.workspaceId,
      tool: "briefWorkspace",
      audience: { role: "owner", memberId: auth.memberId, voicePersona: null, scope: "workspace" },
      destination: "harwick_owner_brief",
      input: { workspaceId: params.data.workspaceId, period: "today", workspaceSnapshot: {} },
      forceRegen: false,
    });
    return new NextResponse(result.envelope.brief.body, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (params.data.action === "next_action") {
    const result = await runJudgmentDefault({
      workspaceId: params.data.workspaceId,
      tool: "triageQueue",
      audience: { role: "agent", memberId: auth.memberId, voicePersona: null, scope: "personal" },
      destination: "harwick_drawer",
      input: {
        workspaceId: params.data.workspaceId,
        pendingTasks: [], pendingReplies: [], voiceHandoffs: [],
        fubConflicts: [], unassignedLeads: [], teamCapacity: [],
        operatorTier: "agent",
      },
      forceRegen: false,
    });
    const top = result.envelope.suggestedActions[0];
    const reply = top
      ? `${result.envelope.brief.headline} ${top.label}.`
      : result.envelope.brief.headline;
    return new NextResponse(reply, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new NextResponse("Use POST for log_voice_note", { status: 405 });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { workspaceId?: string; action?: string; note?: string } | null;
  const params = QuerySchema.safeParse(body);
  if (!params.success || params.data.action !== "log_voice_note") {
    return new NextResponse("Bad request", { status: 400 });
  }
  if (params.data.note === undefined || params.data.note.length === 0) {
    return new NextResponse("note required", { status: 400 });
  }
  const auth = await authorize(request, params.data.workspaceId);
  if (auth === null) return new NextResponse("Forbidden", { status: 403 });

  // Log the voice note as a brokerage_announcement card the operator can see
  // in their main channel later. Real Siri integration can swap this for a
  // more targeted destination.
  const supabase = createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const untyped = supabase as any;
  const { data: defaultChannel } = await untyped
    .from("harwick_channels")
    .select("id")
    .eq("workspace_id", params.data.workspaceId)
    .eq("kind", "channel")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (defaultChannel !== null && defaultChannel !== undefined) {
    await untyped.from("harwick_channel_messages").insert({
      channel_id: defaultChannel.id,
      workspace_id: params.data.workspaceId,
      author_kind: "member",
      author_member_id: auth.memberId,
      body: `🎤 Voice note: ${params.data.note}`,
      card_kind: "brokerage_announcement",
      card_payload: { kind: "brokerage_announcement", title: "Voice note", body: params.data.note, authorMemberId: auth.memberId },
    });
  }

  return new NextResponse("logged", { status: 200, headers: { "Content-Type": "text/plain" } });
}
