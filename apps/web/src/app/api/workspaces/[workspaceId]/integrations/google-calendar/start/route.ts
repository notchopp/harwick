import { NextResponse, type NextRequest } from "next/server";
import { startGoogleCalendarOAuth } from "../../../../../../../features/integrations/google-calendar-oauth";
import { authorizeWorkspaceRequest } from "../../../../../../../lib/api/workspace-auth";
import { getServerEnvironment } from "../../../../../../../lib/server-env";
import { createSupabaseGoogleCalendarOAuthRepository } from "../../../../../../../lib/supabase/integration-accounts";
import { createServerSupabaseClient } from "../../../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    workspaceId: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { workspaceId } = await context.params;
  const membership = await authorizeWorkspaceRequest({
    request,
    workspaceId,
  });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const environment = getServerEnvironment();
  if (environment.GOOGLE_CALENDAR_CLIENT_ID === undefined) {
    return NextResponse.json({ error: "google_calendar_oauth_not_configured" }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const redirectUri = environment.GOOGLE_CALENDAR_OAUTH_REDIRECT_URI
    ?? `${environment.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/api/integrations/google-calendar/callback`;
  const result = await startGoogleCalendarOAuth({
    request: body,
    workspaceId,
    defaultMemberId: membership.memberId,
    clientId: environment.GOOGLE_CALENDAR_CLIENT_ID,
    redirectUri,
    repository: createSupabaseGoogleCalendarOAuthRepository(createServerSupabaseClient()),
  });

  return NextResponse.json(result.body, { status: result.status });
}
