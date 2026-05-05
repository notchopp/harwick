import { NextResponse, type NextRequest } from "next/server";
import { createOpenAIEmbeddingClient } from "@realty-ops/integrations";
import { embedPendingTrajectories } from "../../../../features/agent-runtime/embed-trajectories";
import { getServerEnvironment } from "../../../../lib/server-env";
import { createSupabaseAgentTrajectoryStore } from "../../../../lib/supabase/agent-trajectory-store";
import { createServerSupabaseClient } from "../../../../lib/supabase/server-client";

export const runtime = "nodejs";

/**
 * Cron entry point for the trajectory embedding worker.
 *
 * Runs alongside /api/agent-runtime/reconcile on the same cadence. Picks
 * up trajectories whose outcome_label was promoted to non-pending and
 * embeds their summaries so the in-context retrieval RL pathway can find
 * them at decision time.
 *
 * Auth: shared secret (AGENT_RECONCILE_CRON_SECRET) — reuses the
 * reconcile secret since both run on the same trust boundary.
 */
export async function POST(request: NextRequest) {
  const explicitSecret = process.env["AGENT_RECONCILE_CRON_SECRET"];
  const vercelCronSecret = process.env["CRON_SECRET"];
  const acceptedSecrets = [explicitSecret, vercelCronSecret].filter((s): s is string => s !== undefined && s.length > 0);
  if (acceptedSecrets.length === 0) {
    return NextResponse.json({ error: "embed_disabled" }, { status: 503 });
  }

  const headerSecret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const querySecret = request.nextUrl.searchParams.get("secret") ?? "";
  if (!acceptedSecrets.includes(headerSecret) && !acceptedSecrets.includes(querySecret)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const environment = getServerEnvironment();
  if (environment.OPENAI_API_KEY === undefined) {
    return NextResponse.json({ error: "embeddings_disabled", reason: "OPENAI_API_KEY not set" }, { status: 503 });
  }

  try {
    const supabase = createServerSupabaseClient();
    const store = createSupabaseAgentTrajectoryStore(supabase);
    const embeddings = createOpenAIEmbeddingClient({ apiKey: environment.OPENAI_API_KEY });
    const report = await embedPendingTrajectories({ supabase, store, embeddings });
    return NextResponse.json({ status: "ok", report }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "embed_failed",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
