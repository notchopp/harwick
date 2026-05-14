#!/usr/bin/env node
// Probe for coyasystems@gmail.com's user_id + workspace_id so we can target
// the seed against the right workspace. Run: node scripts/probe-coyasystems-workspace.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnv() {
  const envPath = path.resolve(__dirname, "../.env.local");
  const raw = readFileSync(envPath, "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

const env = loadEnv();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const TARGET_EMAIL = "coyasystems@gmail.com";

async function findUser(email) {
  let page = 1;
  while (page < 20) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (data.users.length < 1000) return null;
    page += 1;
  }
  return null;
}

const user = await findUser(TARGET_EMAIL);
if (!user) {
  console.log(`No supabase auth user found for ${TARGET_EMAIL}`);
  console.log("Sign up that email first via the app's /login flow.");
  process.exit(1);
}

console.log(`✓ User: ${user.email}  id=${user.id}`);
console.log(`  metadata: ${JSON.stringify(user.user_metadata)}`);

const { data: memberships, error: memErr } = await supabase
  .from("workspace_members")
  .select("workspace_id, role, role_label, display_name, is_active, workspaces(id, name, slug)")
  .eq("user_id", user.id);

if (memErr) {
  console.error("workspace_members query failed:", memErr.message);
  process.exit(1);
}

if (!memberships || memberships.length === 0) {
  console.log("\nNo workspace memberships. User exists but has not been onboarded into a workspace.");
  process.exit(2);
}

console.log(`\nWorkspaces (${memberships.length}):`);
for (const m of memberships) {
  console.log(`  workspace_id=${m.workspace_id}  role=${m.role}  name="${m.workspaces?.name}"  slug=${m.workspaces?.slug}  active=${m.is_active}`);
}

const primary = memberships.find((m) => m.is_active && (m.role === "owner" || m.role === "admin")) ?? memberships[0];
console.log(`\nPrimary workspace to target: ${primary.workspace_id}`);
