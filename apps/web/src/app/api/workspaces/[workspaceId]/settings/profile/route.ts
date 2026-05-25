import {
  UuidSchema,
  WorkspaceMemberProfileUpdateRequestSchema,
  WorkspaceMemberProfileUpdateResponseSchema,
} from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { authorizeWorkspaceRequest } from "../../../../../../lib/api/workspace-auth";
import { createServerSupabaseClient } from "../../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const params = await context.params;
  const workspaceId = UuidSchema.safeParse(params.workspaceId);
  if (!workspaceId.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({ request, workspaceId: workspaceId.data });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsedBody = WorkspaceMemberProfileUpdateRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("workspace_members")
    .update({
      display_name: parsedBody.data.displayName,
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspaceId.data)
    .eq("id", membership.memberId)
    .select("display_name")
    .single<{ display_name: string }>();

  if (error !== null) {
    return NextResponse.json({ error: "profile_update_failed" }, { status: 500 });
  }

  return NextResponse.json(WorkspaceMemberProfileUpdateResponseSchema.parse({
    displayName: data.display_name,
  }));
}
