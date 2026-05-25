import { NextResponse, type NextRequest } from "next/server";

import { processFubSyncBatch } from "../../../../features/agent-runtime/fub-sync-worker";
import { getServerEnvironment } from "../../../../lib/server-env";
import { createServerSupabaseClient } from "../../../../lib/supabase/server-client";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Cron entry point for draining the fub_sync workflow queue.
 *
 * Recommended schedule: every minute (Vercel Pro). Scheduling tier-throttled via vercel.json crons.
 * Auth: requires CRON_SECRET (Vercel native) OR AGENT_RECONCILE_CRON_SECRET (legacy override).
 */

function authorize(request: NextRequest): boolean | "disabled" {
  const explicitSecret = process.env["AGENT_RECONCILE_CRON_SECRET"];
  const vercelCronSecret = process.env["CRON_SECRET"];
  const acceptedSecrets = [explicitSecret, vercelCronSecret].filter((secret): secret is string =>
    secret !== undefined && secret.length > 0
  );
  if (acceptedSecrets.length === 0) {
    return "disabled";
  }

  const headerSecret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const querySecret = request.nextUrl.searchParams.get("secret") ?? "";
  return acceptedSecrets.includes(headerSecret) || acceptedSecrets.includes(querySecret);
}

export async function POST(request: NextRequest) {
  const authorized = authorize(request);
  if (authorized === "disabled") {
    return NextResponse.json({ error: "fub_sync_disabled" }, { status: 503 });
  }
  if (!authorized) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let environment: ReturnType<typeof getServerEnvironment>;
  try {
    environment = getServerEnvironment();
  } catch {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 503 });
  }

  if (environment.CREDENTIAL_ENCRYPTION_KEY === undefined) {
    return NextResponse.json({ error: "credentials_unavailable" }, { status: 503 });
  }

  const supabase = createServerSupabaseClient();
  const report = await processFubSyncBatch({
    supabase,
    credentialSecret: environment.CREDENTIAL_ENCRYPTION_KEY,
  });

  return NextResponse.json({ ok: true, report }, { status: 200 });
}
