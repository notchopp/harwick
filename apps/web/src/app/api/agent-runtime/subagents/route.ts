import { createOpenAISmallModelClient } from "@realty-ops/integrations";
import { NextResponse, type NextRequest } from "next/server";
import {
  createSmallModelHarwickSubagentExecutorClient,
  executeHarwickSubagentTasks,
} from "../../../../features/agent-runtime/execute-subagent-tasks";
import { getServerEnvironment } from "../../../../lib/server-env";
import { createSupabaseHarwickSubagentTaskRepository } from "../../../../lib/supabase/harwick-subagent-tasks";
import { createSupabaseHarwickWorkItemRepository } from "../../../../lib/supabase/harwick-work-items";
import { createServerSupabaseClient } from "../../../../lib/supabase/server-client";

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
    return NextResponse.json({ error: "subagents_disabled" }, { status: 503 });
  }
  if (!authorized) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const environment = getServerEnvironment();
    const executorClient = environment.OPENAI_API_KEY === undefined
      ? undefined
      : createSmallModelHarwickSubagentExecutorClient(createOpenAISmallModelClient({
        apiKey: environment.OPENAI_API_KEY,
        model: environment.OPENAI_SMALL_MODEL,
      }));
    const supabase = createServerSupabaseClient();
    const report = await executeHarwickSubagentTasks({
      taskRepository: createSupabaseHarwickSubagentTaskRepository(supabase),
      workItemRepository: createSupabaseHarwickWorkItemRepository(supabase),
      ...(executorClient === undefined ? {} : { executorClient }),
    });

    return NextResponse.json({ status: "ok", report }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "subagents_failed",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
