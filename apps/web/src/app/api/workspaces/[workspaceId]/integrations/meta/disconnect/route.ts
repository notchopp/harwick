import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";

import { authorizeWorkspaceRequest } from "../../../../../../../lib/api/workspace-auth";
import { createSupabaseAuditLogRepository } from "../../../../../../../lib/supabase/audit-logs";
import { createServerSupabaseClient } from "../../../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ workspaceId: string }>;
};

/**
 * In-app Meta disconnect. Reviewers expect a one-click path that:
 *   - revokes our stored access tokens for this workspace's Meta accounts
 *   - sets the rows to status='disconnected' so the integrations UI reflects it
 *   - returns a confirmation code the user can quote if they need to follow up
 *
 * 30-day data purge is policy (privacy page). The webhook stops firing once
 * tokens are dead; remaining conversation rows age out via the standard
 * deletion sweep.
 */
const ALLOWED_ROLES = new Set(["owner", "admin", "team_lead", "lead_manager"] as const);

export async function POST(request: NextRequest, context: RouteContext) {
  const { workspaceId } = await context.params;

  const membership = await authorizeWorkspaceRequest({
    request,
    workspaceId,
    allowedRoles: ALLOWED_ROLES,
  });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();
  const occurredAt = new Date().toISOString();

  const { data: accounts, error: selectError } = await supabase
    .from("integration_accounts")
    .select("id, provider_account_id, provider_account_name, status")
    .eq("workspace_id", workspaceId)
    .eq("provider", "meta");

  if (selectError !== null) {
    return NextResponse.json({ error: "lookup_failed", detail: selectError.message }, { status: 500 });
  }

  const candidateIds = (accounts ?? [])
    .filter((row) => row.status !== "disconnected")
    .map((row) => row.id);

  if (candidateIds.length > 0) {
    const { error: updateError } = await supabase
      .from("integration_accounts")
      .update({
        status: "disconnected",
        encrypted_credential_ref: null,
        updated_at: occurredAt,
      })
      .in("id", candidateIds);

    if (updateError !== null) {
      return NextResponse.json({ error: "disconnect_failed", detail: updateError.message }, { status: 500 });
    }
  }

  const confirmationCode = randomUUID();
  const auditRepository = createSupabaseAuditLogRepository(supabase);
  await auditRepository.insertAuditLog({
    workspaceId,
    userId: null,
    actorType: "user",
    action: "integration.disconnected",
    resourceType: "integration",
    resourceId: candidateIds[0] ?? null,
    metadata: {
      provider: "meta",
      source: "in_app_disconnect_button",
      confirmationCode,
      disconnectedAccountIds: candidateIds,
      memberId: membership.memberId,
    },
  });

  return NextResponse.json({
    status: "ok",
    disconnectedAccounts: candidateIds.length,
    confirmationCode,
    purgeBy: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
}
