import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { mergeLocalEnvFallback } from "./environment.js";

const originalCwd = process.cwd();
const tempDirs: string[] = [];

function withLocalEnv(contents: string): void {
  const directory = mkdtempSync(path.join(tmpdir(), "realty-ops-worker-env-"));
  tempDirs.push(directory);
  writeFileSync(path.join(directory, ".env.local"), contents);
  process.chdir(directory);
}

afterEach(() => {
  process.chdir(originalCwd);
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("worker mergeLocalEnvFallback", () => {
  it("keeps .env.local fallback for development", () => {
    withLocalEnv("WORKER_ID=local-worker\n");

    expect(mergeLocalEnvFallback({ APP_ENV: "development" } as NodeJS.ProcessEnv)).toMatchObject({
      APP_ENV: "development",
      WORKER_ID: "local-worker",
    });
  });

  it("does not read .env.local for explicit production runtime", () => {
    withLocalEnv("SUPABASE_SERVICE_ROLE_KEY=local-service-role\n");

    expect(mergeLocalEnvFallback({
      APP_ENV: "production",
      SUPABASE_SERVICE_ROLE_KEY: "deployed-service-role",
    } as NodeJS.ProcessEnv)).toEqual({
      APP_ENV: "production",
      SUPABASE_SERVICE_ROLE_KEY: "deployed-service-role",
    });
  });
});
