import { NextResponse, type NextRequest } from "next/server";
import { createCookieSupabaseServerClient } from "../../../lib/supabase/ssr-server";
import { createServerSupabaseClient } from "../../../lib/supabase/server-client";
import { createSupabaseCaptureGoogleCalendarRepository } from "../../../lib/supabase/integration-accounts";
import { captureGoogleCalendarFromSession } from "../../../features/auth/capture-google-calendar-from-session";
import { normalizeAuthRedirect } from "../../../features/auth/redirects";
import { getServerEnvironment } from "../../../lib/server-env";

export const runtime = "nodejs";

type WorkspaceMembershipLookupRow = {
  id: string;
  workspace_id: string;
};

async function captureCalendarTokensFromSignIn(params: {
  cookieSupabase: Awaited<ReturnType<typeof createCookieSupabaseServerClient>>;
}): Promise<void> {
  const environment = getServerEnvironment();
  if (environment.CREDENTIAL_ENCRYPTION_KEY === undefined) {
    return;
  }

  const { data: sessionData, error: sessionError } = await params.cookieSupabase.auth.getSession();
  if (sessionError !== null || sessionData.session === null) {
    return;
  }
  const session = sessionData.session;
  const providerToken = session.provider_token ?? null;
  const providerRefreshToken = session.provider_refresh_token ?? null;
  if (providerToken === null || providerRefreshToken === null) {
    return;
  }

  const userId = session.user.id;
  const providerAccountEmail = session.user.email ?? null;

  const serviceClient = createServerSupabaseClient();
  const { data: membershipRows, error: membershipError } = await serviceClient
    .from("workspace_members")
    .select("id,workspace_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .returns<WorkspaceMembershipLookupRow[]>();
  if (membershipError !== null) {
    return;
  }

  const memberships = (membershipRows ?? []).map((row) => ({
    workspaceId: row.workspace_id,
    memberId: row.id,
  }));
  if (memberships.length === 0) {
    return;
  }

  await captureGoogleCalendarFromSession({
    tokens: {
      providerToken,
      providerRefreshToken,
      providerAccountEmail,
    },
    memberships,
    credentialSecret: environment.CREDENTIAL_ENCRYPTION_KEY,
    repository: createSupabaseCaptureGoogleCalendarRepository(serviceClient),
  });
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = normalizeAuthRedirect(requestUrl.searchParams.get("next"));

  if (code === null || code.trim().length === 0) {
    return NextResponse.redirect(new URL("/login?error=callback", requestUrl.origin));
  }

  const supabase = await createCookieSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error !== null) {
    return NextResponse.redirect(new URL("/login?error=callback", requestUrl.origin));
  }

  try {
    await captureCalendarTokensFromSignIn({ cookieSupabase: supabase });
  } catch (capturedError) {
    console.error("[auth/callback] google calendar capture failed", capturedError);
  }

  return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
}
