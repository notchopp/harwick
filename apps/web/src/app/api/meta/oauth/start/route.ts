import { NextResponse } from "next/server";
import { getServerEnvironment } from "../../../../../lib/server-env";
import { createSupabaseMetaOAuthRepository } from "../../../../../lib/supabase/integration-accounts";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server-client";
import { startMetaOAuth } from "../../../../../features/integrations/meta-oauth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const environment = getServerEnvironment();
  const redirectUri = environment.META_OAUTH_REDIRECT_URI
    ?? `${environment.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/api/meta/oauth/callback`;
  const result = await startMetaOAuth({
    request: body,
    appId: environment.META_APP_ID,
    redirectUri,
    repository: createSupabaseMetaOAuthRepository(createServerSupabaseClient()),
  });

  return NextResponse.json(result.body, { status: result.status });
}
