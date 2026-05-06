import { NextResponse, type NextRequest } from "next/server";
import { createGoogleCalendarClient } from "@realty-ops/integrations";
import { handleGoogleCalendarOAuthCallback } from "../../../../../features/integrations/google-calendar-oauth";
import { getServerEnvironment } from "../../../../../lib/server-env";
import { createSupabaseGoogleCalendarOAuthRepository } from "../../../../../lib/supabase/integration-accounts";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const environment = getServerEnvironment();
  if (
    environment.CREDENTIAL_ENCRYPTION_KEY === undefined
    || environment.GOOGLE_CALENDAR_CLIENT_ID === undefined
    || environment.GOOGLE_CALENDAR_CLIENT_SECRET === undefined
  ) {
    return NextResponse.json({ error: "google_calendar_oauth_not_configured" }, { status: 500 });
  }

  const redirectUri = environment.GOOGLE_CALENDAR_OAUTH_REDIRECT_URI
    ?? `${environment.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/api/integrations/google-calendar/callback`;
  const response = await handleGoogleCalendarOAuthCallback({
    query: {
      state: request.nextUrl.searchParams.get("state"),
      code: request.nextUrl.searchParams.get("code"),
    },
    clientId: environment.GOOGLE_CALENDAR_CLIENT_ID,
    clientSecret: environment.GOOGLE_CALENDAR_CLIENT_SECRET,
    redirectUri,
    oauthClient: createGoogleCalendarClient(),
    repository: createSupabaseGoogleCalendarOAuthRepository(createServerSupabaseClient()),
    credentialSecret: environment.CREDENTIAL_ENCRYPTION_KEY,
    appBaseUrl: `${environment.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/integrations`,
  });

  if (response.status !== 302) {
    return NextResponse.json(response.body, { status: response.status });
  }

  return NextResponse.redirect(response.body.redirectUrl);
}
