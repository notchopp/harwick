import { redirect } from "next/navigation";
import { getAuthSessionSummary } from "../../lib/supabase/auth";
import { createUserSupabaseClient } from "../../lib/supabase/server-client";
import { createCookieSupabaseServerClient } from "../../lib/supabase/ssr-server";
import { normalizeAuthRedirect } from "./redirects";

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

  if (session.memberships.length === 0) {
    redirect("/login?error=no_workspace");
  }

  return session;
}
