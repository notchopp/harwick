import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { mergeLocalEnvFallback } from "./local-env";

const originalCwd = process.cwd();
const tempDirs: string[] = [];

function withLocalEnv(contents: string): string {
  const directory = mkdtempSync(path.join(tmpdir(), "realty-ops-env-"));
  tempDirs.push(directory);
  writeFileSync(path.join(directory, ".env.local"), contents);
  process.chdir(directory);
  return directory;
}

afterEach(() => {
  process.chdir(originalCwd);
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("mergeLocalEnvFallback", () => {
  it("uses .env.local as a development fallback", () => {
    withLocalEnv("NEXT_PUBLIC_APP_URL=https://local.example\n");

    expect(mergeLocalEnvFallback({ APP_ENV: "development" } as unknown as NodeJS.ProcessEnv)).toMatchObject({
      APP_ENV: "development",
      NEXT_PUBLIC_APP_URL: "https://local.example",
    });
  });

  it("does not read .env.local when staging or production env is explicit", () => {
    withLocalEnv("RETELL_API_KEY=local-retell-key\n");

    expect(mergeLocalEnvFallback({
      APP_ENV: "production",
      RETELL_API_KEY: "deployed-retell-key",
    } as unknown as NodeJS.ProcessEnv)).toEqual({
      APP_ENV: "production",
      RETELL_API_KEY: "deployed-retell-key",
    });
  });
});
