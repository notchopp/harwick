import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { AuthSessionSummary, AuthWorkspaceMembership } from "@realty-ops/core";
import { getAuthSessionSummary } from "../../lib/supabase/auth";
import { createServerSupabaseClient, createUserSupabaseClient } from "../../lib/supabase/server-client";
import { createCookieSupabaseServerClient } from "../../lib/supabase/ssr-server";
import { getWorkspaceOnboardingState } from "../../lib/supabase/workspace-onboarding";
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

// Routes that should NEVER trigger the onboarding redirect — even when the
// signed-in user's workspace has incomplete onboarding state. Onboarding
// itself is one of them (would loop), and we let users finish billing /
// invite acceptance / sign-out without bouncing into setup.
const ONBOARDING_BYPASS_PREFIXES = ["/onboarding", "/invite", "/auth", "/api"];

function shouldBypassOnboardingGate(nextPath: string): boolean {
  return ONBOARDING_BYPASS_PREFIXES.some((prefix) => nextPath === prefix || nextPath.startsWith(`${prefix}/`));
}

export async function requireActiveWorkspace(params: {
  nextPath?: string;
  workspaceId?: string | null;
  workspaceSlug?: string | null;
  /** Set to true to skip the onboarding-complete check (e.g. /onboarding/setup itself). */
  skipOnboardingCheck?: boolean;
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

  // Onboarding gate: if the workspace hasn't finished the conversational
  // setup, send the user to /onboarding/setup before they land anywhere
  // else. Onboarding/invite/auth/api routes self-handle and skip this.
  const skipGate = params.skipOnboardingCheck === true || shouldBypassOnboardingGate(nextPath);
  if (!skipGate) {
    try {
      const onboardingState = await getWorkspaceOnboardingState(
        createServerSupabaseClient(),
        membership.workspaceId,
      );
      if (onboardingState.completedAt === null) {
        redirect("/onboarding/setup");
      }
    } catch (error) {
      // Soft-fail: if the onboarding-state read throws an unexpected error,
      // log it but don't block the page. The reader already returns a
      // synthetic "complete" state for missing-relation cases.
      if ((error as { digest?: string } | null)?.digest?.startsWith?.("NEXT_REDIRECT") === true) {
        throw error;
      }
      console.warn("[requireActiveWorkspace] onboarding state check failed", error);
    }
  }

  return {
    session,
    membership,
  };
}
