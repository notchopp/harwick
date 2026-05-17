import { notFound } from "next/navigation";

import { WorkspaceInvitationPreviewSchema } from "@realty-ops/core";

import { getCookieAuthSessionSummary } from "../../../features/auth/session";
import { InvitePage } from "../../../features/invitations/invite-page";
import { createServerSupabaseClient } from "../../../lib/supabase/server-client";

export const dynamic = "force-dynamic";

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

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (typeof token !== "string" || token.length < 16 || token.length > 128) {
    notFound();
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .rpc("preview_workspace_invitation", { p_token: token })
    .returns<PreviewRow[]>();
  if (error !== null) {
    throw new Error(`Failed to preview invitation: ${error.message}`);
  }
  const row = data?.[0];
  if (row === undefined) {
    notFound();
  }

  const now = new Date();
  const expired = new Date(row.expires_at) < now;
  const preview = WorkspaceInvitationPreviewSchema.parse({
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    workspaceSlug: row.workspace_slug,
    invitedEmail: row.invited_email,
    role: row.role,
    inviterDisplayName:
      row.inviter_display_name === null || row.inviter_display_name.length === 0
        ? null
        : row.inviter_display_name,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    revokedAt: row.revoked_at,
    expired,
  });

  const session = await getCookieAuthSessionSummary();
  const viewerEmail = session?.user.email ?? null;

  return <InvitePage token={token} preview={preview} viewerEmail={viewerEmail} />;
}
