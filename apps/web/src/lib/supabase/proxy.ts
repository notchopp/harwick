import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { parseSupabasePublicEnvironment } from "@realty-ops/core";
import type { RealtyOpsDatabase } from "./database.types";
import { mergeLocalEnvFallback } from "../local-env";

export async function updateSupabaseSession(request: NextRequest) {
  const environment = parseSupabasePublicEnvironment(mergeLocalEnvFallback(process.env));
  let response = NextResponse.next({ request });

  const supabase = createServerClient<RealtyOpsDatabase>(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  await supabase.auth.getClaims();

  return response;
}
