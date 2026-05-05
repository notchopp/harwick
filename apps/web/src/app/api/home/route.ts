import { TeamPresenceResponseSchema, UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { loadRecentLeads } from "../../../features/home/recent-leads";
import { loadRoutingDesk } from "../../../features/home/routing-desk";
import { loadTeamPresence } from "../../../features/home/team-presence";
import { loadOperationsQueueSummary, loadWorkspaceReadiness } from "../../../features/operations/workspace-operations";
import { loadSocialReplyQueue, loadVoiceHandoffQueue } from "../../../features/operator-queues/operator-queues";
import { authorizeWorkspaceRequest } from "../../../lib/api/workspace-auth";
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
    const [
      teamPresence,
      operations,
      readiness,
      socialQueue,
      voiceQueue,
      recentLeads,
      routingDesk,
      harwickWorkItems,
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
    ]);

    return NextResponse.json({
      workspaceId,
      teamPresence,
      operations,
      readiness,
      socialQueue,
      voiceQueue,
      recentLeads,
      routingDesk,
      harwickWorkItems: {
        workspaceId,
        items: harwickWorkItems,
      },
    });
  } catch (error) {
    console.error("GET /api/home error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
