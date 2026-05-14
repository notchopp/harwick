import { NextResponse, type NextRequest } from "next/server";
import { createCookieSupabaseServerClient } from "../../../lib/supabase/ssr-server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const supabase = await createCookieSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
