import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { loadConversationsInbox } from "../../../../features/conversations/conversations-data";
import { loadOwnerQueue, loadOwnerRouting } from "../../../../features/home/owner-home-data";
import { loadOperationsFailureQueue } from "../../../../features/operations/failure-operations";
import { loadFollowUpBossConflictQueue } from "../../../../features/operations/follow-up-boss-conflicts";
import { loadOperationsQueueSummary, loadWorkspaceReadiness } from "../../../../features/operations/workspace-operations";
import { authorizeWorkspaceRequest } from "../../../../lib/api/workspace-auth";
import { createSupabaseConversationsInboxRepository } from "../../../../lib/supabase/conversations-page";
import { createSupabaseFailureOperationsRepository } from "../../../../lib/supabase/failure-operations";
import { createSupabaseFollowUpBossConflictRepository } from "../../../../lib/supabase/follow-up-boss-conflicts";
import { createSupabaseHarwickWorkItemRepository } from "../../../../lib/supabase/harwick-work-items";
import { createSupabaseWorkspaceOperationsRepository } from "../../../../lib/supabase/operations";
import { createSupabaseRoutingDeskRepository } from "../../../../lib/supabase/routing-desk";
import { createServerSupabaseClient } from "../../../../lib/supabase/server-client";

export const runtime = "nodejs";

const ownerHomeRoles = new Set(["owner", "admin", "team_lead", "lead_manager"] as const);

export async function GET(request: NextRequest) {
  try {
    const requestedWorkspaceId = request.nextUrl.searchParams.get("workspaceId");
    const parsedWorkspaceId = UuidSchema.safeParse(requestedWorkspaceId);
    if (!parsedWorkspaceId.success) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const workspaceId = parsedWorkspaceId.data;
    const membership = await authorizeWorkspaceRequest({
      request,
      workspaceId,
      allowedRoles: ownerHomeRoles,
    });
    if (membership === null) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const supabase = createServerSupabaseClient();
    const operationsRepository = createSupabaseWorkspaceOperationsRepository(supabase);
    const [conversations, routingDesk, operations, readiness, harwickWorkItems, fubConflicts, operationsFailures] = await Promise.all([
      loadConversationsInbox({
        workspaceId,
        repository: createSupabaseConversationsInboxRepository(supabase),
        limit: 12,
      }),
      loadOwnerRouting({
        workspaceId,
        repository: createSupabaseRoutingDeskRepository(supabase),
        limit: 6,
      }),
      loadOperationsQueueSummary({
        workspaceId,
        repository: operationsRepository,
      }),
      loadWorkspaceReadiness({
        workspaceId,
        repository: operationsRepository,
      }),
      createSupabaseHarwickWorkItemRepository(supabase).listVisibleHomeWorkItems({
        workspaceId,
        memberId: membership.memberId,
        role: membership.role,
        limit: 8,
      }),
      loadFollowUpBossConflictQueue({
        workspaceId,
        repository: createSupabaseFollowUpBossConflictRepository(supabase),
        limit: 5,
      }),
      loadOperationsFailureQueue({
        workspaceId,
        repository: createSupabaseFailureOperationsRepository(supabase),
        limit: 5,
      }),
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
      limit: 8,
    }));
  } catch (error) {
    console.error("GET /api/home/owner-queue error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
