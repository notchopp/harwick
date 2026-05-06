import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function parseEnvFile(raw: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    values[key] = value.replace(/^["']|["']$/g, "");
  }

  return values;
}

function findNearestLocalEnv(startDirectory: string): string | null {
  let currentDirectory = startDirectory;

  for (let depth = 0; depth < 4; depth += 1) {
    const candidatePath = path.join(currentDirectory, ".env.local");
    if (existsSync(candidatePath)) {
      return candidatePath;
    }

    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      return null;
    }

    currentDirectory = parentDirectory;
  }

  return null;
}

function shouldUseLocalEnvFallback(input: NodeJS.ProcessEnv): boolean {
  const appEnv = input["APP_ENV"]?.trim().toLowerCase();
  const nodeEnv = input["NODE_ENV"]?.trim().toLowerCase();

  return appEnv === undefined
    || appEnv.length === 0
    || appEnv === "development"
    || nodeEnv === "test";
}

export function mergeLocalEnvFallback(input: NodeJS.ProcessEnv = process.env): Record<string, string | undefined> {
  if (!shouldUseLocalEnvFallback(input)) {
    return input;
  }

  const localEnvPath = findNearestLocalEnv(process.cwd());
  if (localEnvPath === null) {
    return input;
  }

  const localValues = parseEnvFile(readFileSync(localEnvPath, "utf8"));

  return {
    ...localValues,
    ...input,
  };
}
