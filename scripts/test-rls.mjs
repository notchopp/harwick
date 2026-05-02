import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readLocalEnv, requireEnvValue, runSupabaseSql } from "./supabase-management.mjs";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envValues = await readLocalEnv(rootDirectory);
const accessToken = requireEnvValue(envValues, "SUPABASE_ACCESS_TOKEN");
const projectRef = requireEnvValue(envValues, "SUPABASE_PROJECT_REF");

const testsDirectory = path.join(rootDirectory, "supabase", "tests");
const testFiles = [
  "rls_workspace_boundaries.sql",
  "rls_role_behavior.sql",
];

for (const testFile of testFiles) {
  const testPath = path.join(testsDirectory, testFile);
  const testSql = await readFile(testPath, "utf8");

  console.log(`Running ${testFile}...`);
  
  try {
    const result = await runSupabaseSql({
      accessToken,
      projectRef,
      query: testSql,
    });
    
    console.log(`✓ ${testFile} passed`);
    if (result.length > 0 && result[0].status) {
      console.log(`  Status: ${result[0].status}`);
    }
  } catch (error) {
    console.error(`✗ ${testFile} failed:`);
    console.error(`  ${error.message}`);
    process.exit(1);
  }
}

console.log("\nAll RLS tests passed.");
