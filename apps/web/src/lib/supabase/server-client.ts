import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseSupabaseRuntimeEnvironment } from "@realty-ops/core";
import type { RealtyOpsDatabase } from "./database.types";
import { mergeLocalEnvFallback } from "../local-env";

export type RealtyOpsSupabaseClient = SupabaseClient<RealtyOpsDatabase>;

function getSupabaseRuntimeEnvironment(input: NodeJS.ProcessEnv = process.env) {
  return parseSupabaseRuntimeEnvironment(mergeLocalEnvFallback(input));
}

export function createServiceRoleSupabaseClient(): RealtyOpsSupabaseClient {
  const environment = getSupabaseRuntimeEnvironment();

  return createClient<RealtyOpsDatabase>(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

export function createUserSupabaseClient(accessToken: string): RealtyOpsSupabaseClient {
  const environment = getSupabaseRuntimeEnvironment();

  return createClient<RealtyOpsDatabase>(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

export const createServerSupabaseClient = createServiceRoleSupabaseClient;
