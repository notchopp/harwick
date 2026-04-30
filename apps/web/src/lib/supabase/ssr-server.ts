import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { parseSupabasePublicEnvironment } from "@realty-ops/core";
import type { RealtyOpsDatabase } from "./database.types";
import { mergeLocalEnvFallback } from "../local-env";

function getSupabasePublicEnvironment(input: NodeJS.ProcessEnv = process.env) {
  return parseSupabasePublicEnvironment(mergeLocalEnvFallback(input));
}

export async function createCookieSupabaseServerClient() {
  const environment = getSupabasePublicEnvironment();
  const cookieStore = await cookies();

  return createServerClient<RealtyOpsDatabase>(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components cannot set cookies. Route Handlers and Proxy can.
          }
        },
      },
    },
  );
}
