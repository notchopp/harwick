import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RealtyOpsDatabase } from "./database.types";

export type BrowserSupabaseEnvironment = {
  url: string;
  anonKey: string;
};

export type BrowserSupabaseClient = SupabaseClient<RealtyOpsDatabase>;

export function createBrowserSupabaseClient(
  environment: BrowserSupabaseEnvironment,
): BrowserSupabaseClient {
  return createClient<RealtyOpsDatabase>(environment.url, environment.anonKey);
}

