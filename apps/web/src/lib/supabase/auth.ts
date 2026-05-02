import {
  AuthenticatedUserSchema,
  AuthSessionSummarySchema,
  type AuthSessionSummary,
  type AuthenticatedUser,
  type AuthWorkspaceMembership,
} from "@realty-ops/core";
import type { RealtyOpsSupabaseClient } from "./server-client";

type WorkspaceMembershipJoinRow = {
  id: string;
  workspace_id: string;
  role: AuthWorkspaceMembership["role"];
  display_name: string;
  workspaces: {
    name: string;
    slug: string;
  } | null;
};

export function mapSupabaseUserToAuthenticatedUser(input: {
  id: string;
  email?: string;
  created_at?: string;
}): AuthenticatedUser {
  return AuthenticatedUserSchema.parse({
    id: input.id,
    email: input.email ?? null,
    createdAt: input.created_at ?? null,
  });
}

export function mapMembershipRowsToAuthMemberships(
  rows: WorkspaceMembershipJoinRow[],
): AuthWorkspaceMembership[] {
  return rows.map((row) => ({
    workspaceId: row.workspace_id,
    workspaceName: row.workspaces?.name ?? "Workspace",
    workspaceSlug: row.workspaces?.slug ?? row.workspace_id,
    memberId: row.id,
    role: row.role,
    displayName: row.display_name,
  }));
}

export async function getAuthSessionSummary(params: {
  supabase: RealtyOpsSupabaseClient;
  accessToken: string;
}): Promise<AuthSessionSummary | null> {
  const { data: userData, error: userError } = await params.supabase.auth.getUser(params.accessToken);
  if (userError !== null || userData.user === null) {
    return null;
  }

  const { data: membershipRows, error: membershipError } = await params.supabase
    .from("workspace_members")
    .select("id,workspace_id,role,display_name,workspaces(name,slug)")
    .eq("user_id", userData.user.id)
    .eq("is_active", true)
    .returns<WorkspaceMembershipJoinRow[]>();

  if (membershipError !== null) {
    throw membershipError;
  }

  return AuthSessionSummarySchema.parse({
    user: mapSupabaseUserToAuthenticatedUser(userData.user),
    memberships: mapMembershipRowsToAuthMemberships(membershipRows ?? []),
  });
}
