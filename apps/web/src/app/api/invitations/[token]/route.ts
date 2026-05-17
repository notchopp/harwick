import { WorkspaceInvitationPreviewSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabaseClient } from "../../../../lib/supabase/server-client";

export const runtime = "nodejs";

type PreviewRow = {
  workspace_id: string;
  workspace_name: string;
  workspace_slug: string;
  invited_email: string;
  role: string;
  inviter_display_name: string | null;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (typeof token !== "string" || token.length < 16 || token.length > 128) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .rpc("preview_workspace_invitation", { p_token: token })
    .returns<PreviewRow[]>();
  if (error !== null) {
    return NextResponse.json(
      { error: "preview_failed", message: error.message },
      { status: 500 },
    );
  }
  const row = data?.[0];
  if (row === undefined) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const now = new Date();
  const expired = new Date(row.expires_at) < now;
  const preview = WorkspaceInvitationPreviewSchema.parse({
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    workspaceSlug: row.workspace_slug,
    invitedEmail: row.invited_email,
    role: row.role,
    inviterDisplayName: row.inviter_display_name === null || row.inviter_display_name.length === 0
      ? null
      : row.inviter_display_name,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    revokedAt: row.revoked_at,
    expired,
  });
  return NextResponse.json(preview, { status: 200 });
}
