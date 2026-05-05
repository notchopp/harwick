import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorizeWorkspaceRequest } from "../../../../../../../lib/api/workspace-auth";
import { createSupabaseHarwickWorkItemRepository } from "../../../../../../../lib/supabase/harwick-work-items";
import { createServerSupabaseClient } from "../../../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

const WorkItemActionRequestSchema = z.object({
  action: z.enum(["mark_seen", "dismiss", "complete"]),
});

const actionToStatus = {
  mark_seen: "seen",
  dismiss: "dismissed",
  complete: "completed",
} as const;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string; workItemId: string }> },
) {
  const params = await context.params;
  const workspaceId = UuidSchema.safeParse(params.workspaceId);
  const workItemId = UuidSchema.safeParse(params.workItemId);
  if (!workspaceId.success || !workItemId.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({
    request,
    workspaceId: workspaceId.data,
    allowedRoles: new Set(["owner", "admin", "team_lead", "lead_manager", "operator", "agent"]),
  });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsedBody = WorkItemActionRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const repository = createSupabaseHarwickWorkItemRepository(createServerSupabaseClient());
    const result = await repository.updateWorkItemStatus({
      workspaceId: workspaceId.data,
      workItemId: workItemId.data,
      status: actionToStatus[parsedBody.data.action],
    });

    return NextResponse.json({ status: "ok", workItemId: result.workItemId });
  } catch (error) {
    return NextResponse.json(
      {
        error: "work_item_action_failed",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
