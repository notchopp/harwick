import { createOpenAISmallModelClient } from "@realty-ops/integrations";
import { NextResponse, type NextRequest } from "next/server";
import {
  createSmallModelHarwickLoopPlannerClient,
  executeDueHarwickLoops,
} from "../../../../features/agent-runtime/execute-harwick-loops";
import { createSmallModelHarwickWorkItemIntelligenceClient } from "../../../../features/agent-runtime/harwick-work-item-intelligence";
import { getServerEnvironment } from "../../../../lib/server-env";
import { createSupabaseHarwickLoopRepository } from "../../../../lib/supabase/harwick-loops";
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
    return NextResponse.json({ error: "loops_disabled" }, { status: 503 });
  }
  if (!authorized) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const environment = getServerEnvironment();
    const smallModel = environment.OPENAI_API_KEY === undefined
      ? undefined
      : createOpenAISmallModelClient({
        apiKey: environment.OPENAI_API_KEY,
        model: environment.OPENAI_SMALL_MODEL,
      });
    const supabase = createServerSupabaseClient();
    const report = await executeDueHarwickLoops({
      loopRepository: createSupabaseHarwickLoopRepository(supabase),
      workItemRepository: createSupabaseHarwickWorkItemRepository(supabase),
      ...(smallModel === undefined ? {} : {
        plannerClient: createSmallModelHarwickLoopPlannerClient(smallModel),
        intelligenceClient: createSmallModelHarwickWorkItemIntelligenceClient(smallModel),
      }),
    });

    return NextResponse.json({ status: "ok", report }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "loops_failed",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
