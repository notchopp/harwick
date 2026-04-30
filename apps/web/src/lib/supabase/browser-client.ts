import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RealtyOpsDatabase } from "./database.types";

export type BrowserSupabaseEnvironment = {
  url: string;
  anonKey: string;
};

export type BrowserSupabaseClient = SupabaseClient<RealtyOpsDatabase>;

export function createBrowserSupabaseClient(
  environment: BrowserSupabaseEnvironment = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
): BrowserSupabaseClient {
  return createBrowserClient<RealtyOpsDatabase>(environment.url, environment.anonKey);
}
