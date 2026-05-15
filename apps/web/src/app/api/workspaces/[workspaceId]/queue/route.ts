import { UuidSchema, type FollowUpBossConflictQueueResponse, type OperationsFailureQueueResponse, type OperationsQueueSummary, type RoutingDeskResponse, type WorkspaceReadinessSummary } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";

import { loadConversationsInbox } from "../../../../../features/conversations/conversations-data";
import { loadOwnerQueue, loadOwnerRouting } from "../../../../../features/home/owner-home-data";
import { loadOperationsFailureQueue } from "../../../../../features/operations/failure-operations";
import { loadFollowUpBossConflictQueue } from "../../../../../features/operations/follow-up-boss-conflicts";
import { loadOperationsQueueSummary, loadWorkspaceReadiness } from "../../../../../features/operations/workspace-operations";
import { authorizeWorkspaceRequest } from "../../../../../lib/api/workspace-auth";
import { createSupabaseConversationsInboxRepository } from "../../../../../lib/supabase/conversations-page";
import { createSupabaseFailureOperationsRepository } from "../../../../../lib/supabase/failure-operations";
import { createSupabaseFollowUpBossConflictRepository } from "../../../../../lib/supabase/follow-up-boss-conflicts";
import { createSupabaseHarwickWorkItemRepository } from "../../../../../lib/supabase/harwick-work-items";
import { createSupabaseWorkspaceOperationsRepository } from "../../../../../lib/supabase/operations";
import { createSupabaseRoutingDeskRepository } from "../../../../../lib/supabase/routing-desk";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

const emptyRoutingDesk: RoutingDeskResponse = {
  workspaceId: "00000000-0000-0000-0000-000000000000",
  agents: [],
  items: [],
};

/**
 * Role-aware /queue endpoint. Same OwnerHomeQueueResponse shape as the
 * legacy /api/home/owner-queue route, but loaders are skipped per role so
 * we don't pull data the operator isn't allowed to see anyway:
 *
 *   - owner / admin           — everything (current behavior)
 *   - team_lead / lead_manager — work items + routing + inbox; no ops failures
 *   - operator                — work items + ops failures + readiness; no routing
 *   - agent                   — only their own targeted work items
 *                               (listVisibleHomeWorkItems handles the per-member
 *                               filter via canSeeWorkItem)
 *   - viewer                  — everything they have read access to, but the
 *                               client will render actions disabled
 */
export async function GET(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  try {
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
    const operationsRepository = createSupabaseWorkspaceOperationsRepository(supabase);

    const role = membership.role;
    const isManager = role === "owner" || role === "admin" || role === "team_lead" || role === "lead_manager";
    const isOpsRole = role === "owner" || role === "admin" || role === "operator";
    const isAgentLevel = role === "agent";

    const [conversations, routingDesk, operations, readiness, harwickWorkItems, fubConflicts, operationsFailures] = await Promise.all([
      loadConversationsInbox({
        workspaceId,
        repository: createSupabaseConversationsInboxRepository(supabase),
        limit: isAgentLevel ? 8 : 16,
      }),
      isManager
        ? loadOwnerRouting({
          workspaceId,
          repository: createSupabaseRoutingDeskRepository(supabase),
          limit: 8,
        })
        : Promise.resolve<RoutingDeskResponse>({ ...emptyRoutingDesk, workspaceId }),
      isOpsRole
        ? loadOperationsQueueSummary({ workspaceId, repository: operationsRepository })
        : Promise.resolve<OperationsQueueSummary | null>(null),
      isOpsRole
        ? loadWorkspaceReadiness({ workspaceId, repository: operationsRepository })
        : Promise.resolve<WorkspaceReadinessSummary | null>(null),
      createSupabaseHarwickWorkItemRepository(supabase).listVisibleHomeWorkItems({
        workspaceId,
        memberId: membership.memberId,
        role,
        limit: isAgentLevel ? 12 : 20,
      }),
      isOpsRole
        ? loadFollowUpBossConflictQueue({
          workspaceId,
          repository: createSupabaseFollowUpBossConflictRepository(supabase),
          limit: 6,
        })
        : Promise.resolve<FollowUpBossConflictQueueResponse | null>(null),
      isOpsRole
        ? loadOperationsFailureQueue({
          workspaceId,
          repository: createSupabaseFailureOperationsRepository(supabase),
          limit: 6,
        })
        : Promise.resolve<OperationsFailureQueueResponse | null>(null),
    ]);

    return NextResponse.json(loadOwnerQueue({
      workspaceId,
      conversations,
      routingDesk,
      harwickWorkItems,
      fubConflicts,
      operationsFailures,
      operations,
      readiness,
      limit: isAgentLevel ? 20 : 40,
    }));
  } catch (error) {
    console.error("GET /api/workspaces/[id]/queue error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
