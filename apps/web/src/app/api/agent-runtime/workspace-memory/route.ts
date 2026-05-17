import { NextResponse, type NextRequest } from "next/server";
import { createOpenAIEmbeddingClient, createOpenAISmallModelClient } from "@realty-ops/integrations";
import {
  createSmallModelWorkspaceMemorySynthesisClient,
  distillWorkspaceMemory,
} from "../../../../features/agent-runtime/distill-workspace-memory";
import { getServerEnvironment } from "../../../../lib/server-env";
import { createServerSupabaseClient } from "../../../../lib/supabase/server-client";
import { recordBillingUsageEvent } from "../../../../lib/supabase/billing";
import { createSupabaseWorkspaceMemoryRepository } from "../../../../lib/supabase/workspace-memory";

export const runtime = "nodejs";

function authorizeAgentRuntimeCron(request: NextRequest): boolean | "disabled" {
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
  const authorized = authorizeAgentRuntimeCron(request);
  if (authorized === "disabled") {
    return NextResponse.json({ error: "workspace_memory_disabled" }, { status: 503 });
  }
  if (!authorized) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const environment = getServerEnvironment();
    const embeddings = environment.OPENAI_API_KEY === undefined
      ? undefined
      : createOpenAIEmbeddingClient({ apiKey: environment.OPENAI_API_KEY });
    const synthesisClient = environment.OPENAI_API_KEY === undefined
      ? undefined
      : createSmallModelWorkspaceMemorySynthesisClient(createOpenAISmallModelClient({
        apiKey: environment.OPENAI_API_KEY,
        model: environment.OPENAI_SMALL_MODEL,
      }));
    const supabase = createServerSupabaseClient();
    const repository = createSupabaseWorkspaceMemoryRepository(supabase);
    const report = await distillWorkspaceMemory({
      repository,
      recordUsageEvent: (params) => recordBillingUsageEvent(supabase, {
        workspaceId: params.workspaceId,
        eventType: "memory_loop",
        sourceId: params.memoryId,
        idempotencyKey: `memory_loop:${params.memoryId}`,
        eventMetadata: {
          memoryType: params.memoryType,
        },
      }).then(() => undefined),
      ...(embeddings === undefined ? {} : { embeddings }),
      ...(synthesisClient === undefined ? {} : { synthesisClient }),
    });
    return NextResponse.json({ status: "ok", report }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "workspace_memory_failed",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
