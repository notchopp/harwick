import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { AuthSessionSummary, AuthWorkspaceMembership } from "@realty-ops/core";
import { getAuthSessionSummary } from "../../lib/supabase/auth";
import { createUserSupabaseClient } from "../../lib/supabase/server-client";
import { createCookieSupabaseServerClient } from "../../lib/supabase/ssr-server";
import { normalizeAuthRedirect } from "./redirects";

export const selectedWorkspaceCookieName = "realty_ops_workspace_id";

export async function getCookieAuthSessionSummary() {
  const supabase = await createCookieSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError !== null || userData.user === null) {
    return null;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session === null) {
    return null;
  }

  return getAuthSessionSummary({
    supabase: createUserSupabaseClient(sessionData.session.access_token),
    accessToken: sessionData.session.access_token,
  });
}

export async function requireWorkspaceSession(nextPath = "/home") {
  const session = await getCookieAuthSessionSummary();
  if (session === null) {
    redirect(`/login?next=${encodeURIComponent(normalizeAuthRedirect(nextPath))}`);
  }

  // A signed-in user with no workspace memberships is mid-onboarding —
  // route them into the plan picker instead of bouncing back to /login with
  // an error. /onboarding/page.tsx itself handles the "already has a
  // workspace" case so there's no loop risk for steady-state users.
  if (session.memberships.length === 0) {
    redirect("/onboarding");
  }

  return session;
}

export function selectWorkspaceMembership(params: {
  session: AuthSessionSummary;
  workspaceId?: string | null;
  workspaceSlug?: string | null;
  selectedWorkspaceId?: string | null;
}): AuthWorkspaceMembership | null {
  const byWorkspaceId = params.workspaceId === null || params.workspaceId === undefined
    ? null
    : params.session.memberships.find((membership) => membership.workspaceId === params.workspaceId) ?? null;
  if (byWorkspaceId !== null) {
    return byWorkspaceId;
  }

  const byWorkspaceSlug = params.workspaceSlug === null || params.workspaceSlug === undefined
    ? null
    : params.session.memberships.find((membership) => membership.workspaceSlug === params.workspaceSlug) ?? null;
  if (byWorkspaceSlug !== null) {
    return byWorkspaceSlug;
  }

  const byCookie = params.selectedWorkspaceId === null || params.selectedWorkspaceId === undefined
    ? null
    : params.session.memberships.find((membership) => membership.workspaceId === params.selectedWorkspaceId) ?? null;
  if (byCookie !== null) {
    return byCookie;
  }

  return params.session.memberships[0] ?? null;
}

export async function requireActiveWorkspace(params: {
  nextPath?: string;
  workspaceId?: string | null;
  workspaceSlug?: string | null;
} = {}) {
  const nextPath = params.nextPath ?? "/home";
  const session = await requireWorkspaceSession(nextPath);
  const cookieStore = await cookies();
  const membership = selectWorkspaceMembership({
    session,
    ...(params.workspaceId !== undefined ? { workspaceId: params.workspaceId } : {}),
    ...(params.workspaceSlug !== undefined ? { workspaceSlug: params.workspaceSlug } : {}),
    selectedWorkspaceId: cookieStore.get(selectedWorkspaceCookieName)?.value ?? null,
  });

  if (membership === null) {
    redirect("/login?error=no_workspace");
  }

  return {
    session,
    membership,
  };
}
