import { createClient } from "@supabase/supabase-js";
import { readLocalEnv, requireEnvValue } from "./supabase-management.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function requireProcessEnv(key) {
  const value = process.env[key];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`Missing required process env value: ${key}`);
  }

  return value;
}

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envValues = await readLocalEnv(rootDirectory);
const supabaseUrl = requireEnvValue(envValues, "NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = requireEnvValue(envValues, "SUPABASE_SERVICE_ROLE_KEY");
const email = requireProcessEnv("REALTY_OPS_AUTH_EMAIL");
const password = requireProcessEnv("REALTY_OPS_AUTH_PASSWORD");
const displayName = process.env.REALTY_OPS_AUTH_DISPLAY_NAME ?? email;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: {
    display_name: displayName,
  },
});

if (error !== null) {
  throw error;
}

if (data.user === null) {
  throw new Error("Supabase did not return a created user.");
}

console.log(JSON.stringify({
  id: data.user.id,
  email: data.user.email,
}, null, 2));

