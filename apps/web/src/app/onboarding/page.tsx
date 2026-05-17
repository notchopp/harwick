import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import {
  getCookieAuthSessionSummary,
  selectWorkspaceMembership,
  selectedWorkspaceCookieName,
} from "../../features/auth/session";
import { createServerSupabaseClient } from "../../lib/supabase/server-client";
import { getWorkspaceOnboardingState } from "../../lib/supabase/workspace-onboarding";

export const dynamic = "force-dynamic";

/**
 * /onboarding is the *intent* to onboard. Route by state:
 *   no session                                    → /login
 *   session + no workspace                        → /onboarding/plan-pick
 *   session + workspace + incomplete onboarding   → /onboarding/setup
 *   session + workspace + completed onboarding    → /onboarding/setup?reset=1
 *
 * The last case is deliberate — if a user explicitly navigates to /onboarding
 * with a finished workspace, they probably want to re-run setup (e.g. they
 * want to update reply examples or channel intent). We hand them off to
 * setup with ?reset=1 so the page renders the conversation instead of
 * bouncing them to /home.
 */
export default async function Page() {
  const session = await getCookieAuthSessionSummary();
  if (session === null) {
    redirect("/login?next=/onboarding");
  }

  if (session.memberships.length === 0) {
    redirect("/onboarding/plan-pick");
  }

  // Pick the active workspace the same way protected pages do so we read
  // the right onboarding row.
  const cookieStore = await cookies();
  const membership = selectWorkspaceMembership({
    session,
    selectedWorkspaceId: cookieStore.get(selectedWorkspaceCookieName)?.value ?? null,
  });
  if (membership === null) {
    redirect("/onboarding/plan-pick");
  }

  const state = await getWorkspaceOnboardingState(
    createServerSupabaseClient(),
    membership.workspaceId,
  );

  if (state.completedAt === null) {
    redirect("/onboarding/setup");
  }

  // Already complete — let the user re-run setup intentionally.
  redirect("/onboarding/setup?reset=1");
}
