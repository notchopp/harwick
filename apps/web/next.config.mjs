import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";

function readRootLocalEnv() {
  const envPath = fileURLToPath(new URL("../../.env.local", import.meta.url));
  if (!existsSync(envPath)) {
    return {};
  }

  return Object.fromEntries(
    readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        return [
          line.slice(0, separatorIndex).trim(),
          line.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, ""),
        ];
      }),
  );
}

const rootLocalEnv = readRootLocalEnv();

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? rootLocalEnv.NEXT_PUBLIC_SUPABASE_URL ?? "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? rootLocalEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  },
  reactStrictMode: true,
  typedRoutes: true,
  // Workspace packages live as TS source under packages/*; tell Next/Turbopack
  // to transpile them from source rather than expecting prebuilt dist output.
  // Without this, Vercel deploys fail with "Module not found: @realty-ops/core"
  // because the symlinked workspace point at .ts files.
  transpilePackages: [
    "@realty-ops/core",
    "@realty-ops/integrations",
    "@realty-ops/api-client",
  ],
  turbopack: {
    root: fileURLToPath(new URL("../..", import.meta.url)),
  },
};

export default nextConfig;
