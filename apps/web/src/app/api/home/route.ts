import { TeamPresenceResponseSchema, UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { loadConversationsInbox } from "../../../features/conversations/conversations-data";
import { loadRecentLeads } from "../../../features/home/recent-leads";
import { loadRoutingDesk } from "../../../features/home/routing-desk";
import { loadTeamPresence } from "../../../features/home/team-presence";
import { loadOperationsFailureQueue } from "../../../features/operations/failure-operations";
import { loadFollowUpBossConflictQueue } from "../../../features/operations/follow-up-boss-conflicts";
import { loadOperationsQueueSummary, loadWorkspaceReadiness } from "../../../features/operations/workspace-operations";
import { loadSocialReplyQueue, loadVoiceHandoffQueue } from "../../../features/operator-queues/operator-queues";
import { authorizeWorkspaceRequest } from "../../../lib/api/workspace-auth";
import { createSupabaseConversationsInboxRepository } from "../../../lib/supabase/conversations-page";
import { createSupabaseFailureOperationsRepository } from "../../../lib/supabase/failure-operations";
import { createSupabaseFollowUpBossConflictRepository } from "../../../lib/supabase/follow-up-boss-conflicts";
import { createServerSupabaseClient } from "../../../lib/supabase/server-client";
import { createSupabaseWorkspaceOperationsRepository } from "../../../lib/supabase/operations";
import { createSupabaseSocialReplyQueueRepository, createSupabaseVoiceHandoffQueueRepository } from "../../../lib/supabase/operator-queues";
import { createSupabaseRecentLeadsRepository } from "../../../lib/supabase/recent-leads";
import { createSupabaseRoutingDeskRepository } from "../../../lib/supabase/routing-desk";
import { createSupabaseTeamPresenceRepository } from "../../../lib/supabase/team-presence";
import { createSupabaseHarwickWorkItemRepository } from "../../../lib/supabase/harwick-work-items";

export const runtime = "nodejs";

const emptyTeamPresence = (workspaceId: string) =>
  TeamPresenceResponseSchema.parse({ workspaceId, members: [] });

/**
 * Surface pending callback tasks as a home-queue payload. This is what
 * makes scheduled callbacks (created from the /leads drawer Schedule
 * popover or by Harwick when the buyer asked for one) actually appear
 * in /home. Without this, lead_tasks rows existed in the DB but never
 * rendered anywhere — the queue looked empty even when work was waiting.
 *
 * Joined to the lead so we have a display name for the title.
 */
async function loadCallbackTaskQueue(params: {
  workspaceId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  limit: number;
}): Promise<{
  workspaceId: string;
  items: Array<{
    id: string;
    workspaceId: string;
    leadId: string | null;
    title: string;
    detail: string;
    priority: string;
    dueAt: string | null;
    createdAt: string;
    leadName: string | null;
    leadPhone: string | null;
  }>;
}> {
  const { data, error } = await params.supabase
    .from("lead_tasks")
    .select(
      "id, workspace_id, lead_id, title, description, priority, due_at, created_at, leads!inner(full_name, phone, instagram_username)",
    )
    .eq("workspace_id", params.workspaceId)
    .eq("task_type", "callback")
    .eq("status", "pending")
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(params.limit);
  if (error !== null) throw error;

  const items = (data ?? []).map((row: {
    id: string;
    workspace_id: string;
    lead_id: string | null;
    title: string;
    description: string | null;
    priority: string;
    due_at: string | null;
    created_at: string;
    leads: { full_name: string | null; phone: string | null; instagram_username: string | null } | null;
  }) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    leadId: row.lead_id,
    title: row.title,
    detail: row.description ?? "Scheduled callback awaiting action.",
    priority: row.priority,
    dueAt: row.due_at,
    createdAt: row.created_at,
    leadName: row.leads?.full_name?.trim()
      ?? row.leads?.phone?.trim()
      ?? row.leads?.instagram_username?.trim()
      ?? null,
    leadPhone: row.leads?.phone ?? null,
  }));

  return { workspaceId: params.workspaceId, items };
}

export async function GET(request: NextRequest) {
  try {
    const requestedWorkspaceId = request.nextUrl.searchParams.get("workspaceId");
    const parsedWorkspaceId = UuidSchema.safeParse(requestedWorkspaceId);
    if (!parsedWorkspaceId.success) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const workspaceId = parsedWorkspaceId.data;
    const membership = await authorizeWorkspaceRequest({ request, workspaceId });
    if (membership === null) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const supabase = createServerSupabaseClient();
    const canManageFubConflicts = new Set<string>(["owner", "admin", "team_lead", "lead_manager", "operator"])
      .has(membership.role);
    const [
      teamPresence,
      operations,
      readiness,
      socialQueue,
      voiceQueue,
      recentLeads,
      conversations,
      routingDesk,
      harwickWorkItems,
      fubConflicts,
      operationsFailures,
      callbackQueue,
    ] = await Promise.all([
      loadTeamPresence({
        workspaceId,
        repository: createSupabaseTeamPresenceRepository(supabase),
      }).catch((error: unknown) => {
        console.error("GET /api/home team presence error:", error);
        return emptyTeamPresence(workspaceId);
      }),
      loadOperationsQueueSummary({
        workspaceId,
        repository: createSupabaseWorkspaceOperationsRepository(supabase),
      }).catch((error: unknown) => {
        console.error("GET /api/home operations error:", error);
        return null;
      }),
      loadWorkspaceReadiness({
        workspaceId,
        repository: createSupabaseWorkspaceOperationsRepository(supabase),
      }).catch((error: unknown) => {
        console.error("GET /api/home readiness error:", error);
        return null;
      }),
      loadSocialReplyQueue({
        workspaceId,
        repository: createSupabaseSocialReplyQueueRepository(supabase),
        limit: 10,
      }).catch((error: unknown) => {
        console.error("GET /api/home social queue error:", error);
        return null;
      }),
      loadVoiceHandoffQueue({
        workspaceId,
        repository: createSupabaseVoiceHandoffQueueRepository(supabase),
        limit: 10,
      }).catch((error: unknown) => {
        console.error("GET /api/home voice queue error:", error);
        return null;
      }),
      loadRecentLeads({
        workspaceId,
        repository: createSupabaseRecentLeadsRepository(supabase),
        limit: 5,
      }).catch((error: unknown) => {
        console.error("GET /api/home recent leads error:", error);
        return null;
      }),
      loadConversationsInbox({
        workspaceId,
        repository: createSupabaseConversationsInboxRepository(supabase),
        limit: 8,
      }).catch((error: unknown) => {
        console.error("GET /api/home conversations error:", error);
        return null;
      }),
      loadRoutingDesk({
        workspaceId,
        repository: createSupabaseRoutingDeskRepository(supabase),
        limit: 3,
      }).catch((error: unknown) => {
        console.error("GET /api/home routing desk error:", error);
        return null;
      }),
      createSupabaseHarwickWorkItemRepository(supabase).listVisibleHomeWorkItems({
        workspaceId,
        memberId: membership.memberId,
        role: membership.role,
        limit: 10,
      }).catch((error: unknown) => {
        console.error("GET /api/home Harwick work items error:", error);
        return [];
      }),
      canManageFubConflicts
        ? loadFollowUpBossConflictQueue({
          workspaceId,
          repository: createSupabaseFollowUpBossConflictRepository(supabase),
          limit: 5,
        }).catch((error: unknown) => {
          console.error("GET /api/home FUB conflicts error:", error);
          return null;
        })
        : Promise.resolve(null),
      canManageFubConflicts
        ? loadOperationsFailureQueue({
          workspaceId,
          repository: createSupabaseFailureOperationsRepository(supabase),
          limit: 5,
        }).catch((error: unknown) => {
          console.error("GET /api/home operations failures error:", error);
          return null;
        })
        : Promise.resolve(null),
      loadCallbackTaskQueue({
        workspaceId,
        supabase,
        limit: 10,
      }).catch((error: unknown) => {
        console.error("GET /api/home callback queue error:", error);
        return null;
      }),
    ]);

    return NextResponse.json({
      workspaceId,
      teamPresence,
      operations,
      readiness,
      socialQueue,
      voiceQueue,
      recentLeads,
      conversations,
      routingDesk,
      harwickWorkItems: {
        workspaceId,
        items: harwickWorkItems,
      },
      fubConflicts,
      operationsFailures,
      callbackQueue,
    });
  } catch (error) {
    console.error("GET /api/home error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
