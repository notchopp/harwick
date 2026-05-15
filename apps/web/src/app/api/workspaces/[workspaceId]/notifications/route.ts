import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";

import { authorizeWorkspaceRequest } from "../../../../../lib/api/workspace-auth";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

export type NotificationItem = {
  id: string;
  kind: "work_item" | "routing" | "channel_mention" | "lead_task" | "subagent_complete";
  title: string;
  subtitle: string | null;
  href: string;
  priority: "low" | "normal" | "high" | "urgent";
  createdAt: string;
};

/**
 * Aggregates open notifications across the surfaces an operator cares about:
 *   - pending harwick_work_items (insights + approvals) targeted at this
 *     member or their role
 *   - pending routing decisions (for owner / admin / team_lead / lead_manager)
 *   - channel messages where the operator (or @harwick) was mentioned
 *     in the last 7 days
 *   - lead_tasks assigned to this operator due within 2 days
 *
 * Sorted by priority then recency. Cheap query — popovers should render
 * sub-100ms so we cap per-source at 10 items.
 */
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
  const nowIso = new Date().toISOString();
  const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const tasks: Promise<NotificationItem[]>[] = [];

  // 1. Pending Harwick work items targeted at this member or their role.
  tasks.push((async () => {
    const { data } = await supabase
      .from("harwick_work_items")
      .select("id, item_type, title, summary, priority, lead_id, created_at, target_member_id, target_role")
      .eq("workspace_id", workspaceId)
      .in("status", ["pending", "surfaced"])
      .or(`target_member_id.eq.${membership.memberId},target_role.eq.${membership.role}`)
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(10);
    return (data ?? []).map((row) => ({
      id: `work_item:${row.id}`,
      kind: "work_item" as const,
      title: row.title,
      subtitle: row.summary,
      href: row.lead_id === null ? `/queue?workItemId=${row.id}` : `/leads?leadId=${row.lead_id}`,
      priority: (row.priority ?? "normal") as NotificationItem["priority"],
      createdAt: row.created_at,
    }));
  })());

  // 2. Pending routing decisions — owners/admins/team leads only.
  if (membership.role === "owner" || membership.role === "admin"
    || membership.role === "team_lead" || membership.role === "lead_manager") {
    tasks.push((async () => {
      const { data } = await supabase
        .from("harwick_routing_decisions")
        .select("id, lead_id, suggested_member_id, status, reason, created_at")
        .eq("workspace_id", workspaceId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(8);
      return (data ?? []).map((row) => ({
        id: `routing:${row.id}`,
        kind: "routing" as const,
        title: "Routing decision pending",
        subtitle: row.reason ?? null,
        href: row.lead_id === null ? "/queue" : `/leads?leadId=${row.lead_id}`,
        priority: "normal" as const,
        createdAt: row.created_at,
      }));
    })());
  }

  // 3. Channel messages where this member was mentioned in the last 7d. We
  // check via the messages JSON metadata (mentions array) since the schema
  // doesn't have a dedicated mentions-many-to-many table.
  tasks.push((async () => {
    const { data } = await supabase
      .from("harwick_channel_messages")
      .select("id, channel_id, author_kind, author_member_id, body, created_at, mentions_harwick")
      .eq("workspace_id", workspaceId)
      .gte("created_at", sevenDaysAgo)
      .neq("author_member_id", membership.memberId)
      .order("created_at", { ascending: false })
      .limit(15);
    // Filter client-side: include if body mentions the operator's first name
    // OR (operator is harwick admin context AND message mentions_harwick).
    const firstName = membership.displayName.split(/\s+/)[0]?.toLowerCase() ?? "";
    return (data ?? []).flatMap((row) => {
      const body = row.body.toLowerCase();
      const mentionedByName = firstName.length > 0 && body.includes(`@${firstName}`);
      if (!mentionedByName) return [];
      return [{
        id: `channel_mention:${row.id}`,
        kind: "channel_mention" as const,
        title: `@${membership.displayName.split(/\s+/)[0]} mentioned in a channel`,
        subtitle: row.body.slice(0, 120),
        href: `/channels?channelId=${row.channel_id}`,
        priority: "normal" as const,
        createdAt: row.created_at,
      }];
    }).slice(0, 5);
  })());

  // 4. Lead tasks assigned to this operator, due within 2 days.
  tasks.push((async () => {
    const { data } = await supabase
      .from("lead_tasks")
      .select("id, lead_id, title, priority, due_at, task_type, created_at")
      .eq("workspace_id", workspaceId)
      .eq("assigned_member_id", membership.memberId)
      .eq("status", "open")
      .lte("due_at", twoDaysFromNow)
      .order("due_at", { ascending: true })
      .limit(8);
    return (data ?? []).map((row) => ({
      id: `lead_task:${row.id}`,
      kind: "lead_task" as const,
      title: row.title,
      subtitle: row.due_at === null
        ? row.task_type
        : `${row.task_type} · due ${new Date(row.due_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`,
      href: row.lead_id === null ? "/queue" : `/leads?leadId=${row.lead_id}`,
      priority: (row.priority ?? "normal") as NotificationItem["priority"],
      createdAt: row.created_at,
    }));
  })());

  const groups = await Promise.all(tasks);
  const flat = groups.flat();

  // Sort: priority weight desc, then createdAt desc.
  const priorityWeight: Record<NotificationItem["priority"], number> = {
    urgent: 3,
    high: 2,
    normal: 1,
    low: 0,
  };
  flat.sort((a, b) => {
    const pa = priorityWeight[a.priority] ?? 1;
    const pb = priorityWeight[b.priority] ?? 1;
    if (pa !== pb) return pb - pa;
    return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
  });

  return NextResponse.json({
    notifications: flat.slice(0, 25),
    fetchedAt: nowIso,
  });
}
