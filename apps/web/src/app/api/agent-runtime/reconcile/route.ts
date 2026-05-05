import { NextResponse, type NextRequest } from "next/server";
import { reconcileAgentTrajectories } from "../../../../features/agent-runtime/reconcile-trajectories";
import { createSupabaseAgentTrajectoryStore } from "../../../../lib/supabase/agent-trajectory-store";
import { createServerSupabaseClient } from "../../../../lib/supabase/server-client";

export const runtime = "nodejs";

/**
 * Cron entry point for the trajectory outcome reconciliation worker.
 *
 * Invoked by Vercel Cron (vercel.json) or any scheduler that can hit a URL
 * with the shared secret. Scans pending trajectories, derives implicit
 * outcomes, promotes outcome_label.
 *
 * Auth: pass `Authorization: Bearer ${AGENT_RECONCILE_CRON_SECRET}` or
 *  `?secret=${AGENT_RECONCILE_CRON_SECRET}`. The secret is a shared
 *  password set in env. Without a configured secret the route refuses to
 *  run (fails closed) so accidental public exposure cannot trigger writes.
 */
export async function POST(request: NextRequest) {
  const expected = process.env["AGENT_RECONCILE_CRON_SECRET"];
  if (expected === undefined || expected.length === 0) {
    return NextResponse.json({ error: "reconcile_disabled" }, { status: 503 });
  }

  const headerSecret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const querySecret = request.nextUrl.searchParams.get("secret") ?? "";
  if (headerSecret !== expected && querySecret !== expected) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const supabase = createServerSupabaseClient();
    const store = createSupabaseAgentTrajectoryStore(supabase);
    const report = await reconcileAgentTrajectories({ supabase, store });
    return NextResponse.json({ status: "ok", report }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "reconcile_failed",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  // Convenience for Vercel Cron which uses GET by default.
  return POST(request);
}
