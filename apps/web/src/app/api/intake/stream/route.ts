import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";

import { authorizeWorkspaceRequest } from "../../../../lib/api/workspace-auth";
import { createServerSupabaseClient } from "../../../../lib/supabase/server-client";

export const runtime = "nodejs";

/**
 * GTM-23: /intake live-conversation feed.
 *
 * Returns the most recent intake moments across all channels for a workspace —
 * public-chat sessions, voice calls, lead captures, FUB outbound events —
 * unified into a single time-ordered feed. Powers an operator surface where
 * you watch capture happen in real time during high-volume periods (open
 * houses, ad pushes, etc.).
 *
 * Returns up to 50 most recent events with a typed kind discriminator.
 */

export async function GET(request: NextRequest) {
  const workspaceIdParam = request.nextUrl.searchParams.get("workspaceId");
  const parsed = UuidSchema.safeParse(workspaceIdParam);
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const membership = await authorizeWorkspaceRequest({ request, workspaceId: parsed.data });
  if (membership === null) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const supabase = createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const untyped = supabase as any;

  const [leads, sessions, events] = await Promise.all([
    untyped
      .from("leads")
      .select("id, full_name, source_channel, score, lead_type, created_at")
      .eq("workspace_id", parsed.data)
      .order("created_at", { ascending: false })
      .limit(20),
    untyped
      .from("public_listing_sessions")
      .select("id, listing_id, promoted_lead_id, started_at, last_active_at")
      .eq("workspace_id", parsed.data)
      .order("started_at", { ascending: false })
      .limit(20),
    untyped
      .from("lead_events")
      .select("id, lead_id, event_type, source_channel, text, occurred_at")
      .eq("workspace_id", parsed.data)
      .order("occurred_at", { ascending: false })
      .limit(20),
  ]);

  type Item = {
    kind: "lead_captured" | "session_started" | "event_received";
    occurredAt: string;
    title: string;
    detail: string;
  };

  const items: Item[] = [];

  for (const lead of (leads.data ?? []) as Array<Record<string, unknown>>) {
    items.push({
      kind: "lead_captured",
      occurredAt: lead["created_at"] as string,
      title: `Lead captured: ${(lead["full_name"] as string | null) ?? "anonymous"}`,
      detail: `${lead["source_channel"]} · ${lead["lead_type"]} · score ${lead["score"]}`,
    });
  }
  for (const session of (sessions.data ?? []) as Array<Record<string, unknown>>) {
    items.push({
      kind: "session_started",
      occurredAt: session["started_at"] as string,
      title: session["promoted_lead_id"] === null
        ? "Anonymous chat session"
        : "Chat session (promoted to lead)",
      detail: `listing ${(session["listing_id"] as string).slice(0, 8)}`,
    });
  }
  for (const ev of (events.data ?? []) as Array<Record<string, unknown>>) {
    items.push({
      kind: "event_received",
      occurredAt: ev["occurred_at"] as string,
      title: `${ev["event_type"]} on ${ev["source_channel"]}`,
      detail: ((ev["text"] as string | null) ?? "").slice(0, 140),
    });
  }

  items.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  return NextResponse.json({ items: items.slice(0, 50) });
}
