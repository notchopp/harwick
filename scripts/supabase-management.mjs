import { readFile } from "node:fs/promises";
import path from "node:path";

export async function readLocalEnv(rootDirectory) {
  const envPath = path.join(rootDirectory, ".env.local");
  const raw = await readFile(envPath, "utf8");
  const values = new Map();

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    values.set(trimmed.slice(0, separatorIndex), trimmed.slice(separatorIndex + 1));
  }

  return values;
}

export function requireEnvValue(values, key) {
  const value = values.get(key);
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`Missing required env value: ${key}`);
  }

  return value;
}

export async function runSupabaseSql(params) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${params.projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${params.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        query: params.query,
        read_only: false,
      }),
    },
  );

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Supabase SQL failed with ${response.status}: ${responseText}`);
  }

  return response.json();
}
