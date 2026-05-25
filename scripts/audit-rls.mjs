#!/usr/bin/env node
/**
 * Read-only audit: lists every `public` table and whether RLS is enabled.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/audit-rls.mjs
 *
 * The Management API is invoked with `read_only: true` so this script cannot
 * mutate state under any circumstance.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readLocalEnv } from "./supabase-management.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

async function runReadOnlySql({ accessToken, projectRef, query }) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query, read_only: true }),
    },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase SQL failed (${response.status}): ${text}`);
  }
  return response.json();
}

async function main() {
  const accessToken =
    process.env.SUPABASE_ACCESS_TOKEN ??
    (() => {
      throw new Error("SUPABASE_ACCESS_TOKEN env var required");
    })();

  let projectRef = process.env.SUPABASE_PROJECT_REF;
  if (projectRef === undefined || projectRef.length === 0) {
    try {
      const env = await readLocalEnv(REPO_ROOT);
      projectRef = env.get("SUPABASE_PROJECT_REF");
    } catch {
      // .env.local optional; require explicit ref instead
    }
  }
  if (projectRef === undefined || projectRef.length === 0) {
    throw new Error("SUPABASE_PROJECT_REF env var or .env.local entry required");
  }

  const rows = await runReadOnlySql({
    accessToken,
    projectRef,
    query: `
      select
        c.relname as table_name,
        c.relrowsecurity as rls_enabled,
        c.relforcerowsecurity as rls_forced,
        (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policy_count
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
      order by c.relname;
    `,
  });

  const tables = Array.isArray(rows) ? rows : [];
  const missing = tables.filter((t) => t.rls_enabled === false);
  const policyless = tables.filter((t) => t.rls_enabled === true && Number(t.policy_count) === 0);

  process.stdout.write(`Total public tables: ${tables.length}\n`);
  process.stdout.write(`Tables WITHOUT RLS enabled: ${missing.length}\n`);
  for (const row of missing) {
    process.stdout.write(`  - ${row.table_name}\n`);
  }
  process.stdout.write(`Tables WITH RLS but ZERO policies: ${policyless.length}\n`);
  for (const row of policyless) {
    process.stdout.write(`  - ${row.table_name}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`audit-rls failed: ${error.message ?? error}\n`);
  process.exit(1);
});
