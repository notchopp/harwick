import { NextResponse, type NextRequest } from "next/server";
import { createCookieSupabaseServerClient } from "../../../lib/supabase/ssr-server";
import { normalizeAuthRedirect } from "../../../features/auth/redirects";

export const runtime = "nodejs";

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

  return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
}
