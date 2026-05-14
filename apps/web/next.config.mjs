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
  // Permit LAN origins during `next dev` so phones/tablets on the same Wi-Fi can
  // hit the dev server. Without this, Next rejects HMR/asset fetches from
  // 192.168.* origins; pages render SSR but never hydrate, and forms fall back
  // to native submits (login appears broken from mobile, lands on /login?).
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "192.168.*.*",
    "10.*.*.*",
    "172.16.*.*",
    "172.17.*.*",
    "172.18.*.*",
    "172.19.*.*",
    "172.20.*.*",
    "172.21.*.*",
    "172.22.*.*",
    "172.23.*.*",
    "172.24.*.*",
    "172.25.*.*",
    "172.26.*.*",
    "172.27.*.*",
    "172.28.*.*",
    "172.29.*.*",
    "172.30.*.*",
    "172.31.*.*",
  ],
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
