import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readLocalEnv, requireEnvValue, runSupabaseSql } from "./supabase-management.mjs";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envValues = await readLocalEnv(rootDirectory);
const accessToken = requireEnvValue(envValues, "SUPABASE_ACCESS_TOKEN");
const projectRef = requireEnvValue(envValues, "SUPABASE_PROJECT_REF");
const requestedMigrationPath = process.argv[2] ?? "supabase/migrations/20260424000100_initial_realty_ops_schema.sql";
const migrationPath = path.resolve(rootDirectory, requestedMigrationPath);
const migrationsDirectory = path.join(rootDirectory, "supabase", "migrations");

if (!migrationPath.startsWith(`${migrationsDirectory}${path.sep}`)) {
  throw new Error("Migration path must be inside supabase/migrations.");
}

const migrationSql = await readFile(migrationPath, "utf8");

await runSupabaseSql({
  accessToken,
  projectRef,
  query: migrationSql,
});

console.log(`Applied ${path.basename(migrationPath)} to Supabase project ${projectRef}.`);
