import { createOpenAI } from "@ai-sdk/openai";
import { UuidSchema } from "@realty-ops/core";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { NextResponse, type NextRequest } from "next/server";

import { buildOnboardingSetupTools } from "../../../../../features/onboarding/setup-tools";
import { buildOnboardingSetupSystemPrompt } from "../../../../../features/onboarding/setup-system-prompt";
import { authorizeWorkspaceRequest } from "../../../../../lib/api/workspace-auth";
import { getServerEnvironment } from "../../../../../lib/server-env";
import { getWorkspaceSubscription } from "../../../../../lib/supabase/billing";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server-client";
import { getWorkspaceOnboardingState } from "../../../../../lib/supabase/workspace-onboarding";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatRequestBody = {
  messages: UIMessage[];
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId: rawWorkspaceId } = await context.params;
  const parsedWorkspaceId = UuidSchema.safeParse(rawWorkspaceId);
  if (!parsedWorkspaceId.success) {
    return NextResponse.json({ error: "invalid_workspace" }, { status: 400 });
  }
  const workspaceId = parsedWorkspaceId.data;

  const membership = await authorizeWorkspaceRequest({
    request,
    workspaceId,
    allowedRoles: new Set(["owner", "admin"]),
  });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let environment: ReturnType<typeof getServerEnvironment>;
  try {
    environment = getServerEnvironment();
  } catch {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 503 });
  }
  if (environment.OPENAI_API_KEY === undefined) {
    return NextResponse.json({ error: "openai_unavailable" }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as ChatRequestBody | null;
  if (body === null || !Array.isArray(body.messages)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const [state, subscription] = await Promise.all([
    getWorkspaceOnboardingState(supabase, workspaceId),
    getWorkspaceSubscription(supabase, workspaceId),
  ]);
  const planTier = subscription?.planTier ?? "free";

  const openai = createOpenAI({ apiKey: environment.OPENAI_API_KEY });
  const modelName = process.env["OPENAI_ONBOARDING_CHAT_MODEL"]
    ?? process.env["OPENAI_HARWICK_CHAT_MODEL"]
    ?? "gpt-4o";

  const tools = buildOnboardingSetupTools({ supabase, workspaceId });
  const systemPrompt = buildOnboardingSetupSystemPrompt({
    operatorName: membership.displayName,
    workspaceName: membership.workspaceName,
    planTier,
    state,
  });

  const modelMessages = await convertToModelMessages(body.messages);
  const result = streamText({
    model: openai(modelName),
    system: systemPrompt,
    messages: modelMessages,
    tools,
    // Bounded so a malformed loop can't burn turns. Each beat is one tool
    // call, and we'd never need more than ~4 chained calls in a session.
    stopWhen: stepCountIs(4),
    onError({ error }) {
      console.error("[onboarding-chat] streamText error", error);
    },
  });

  return result.toUIMessageStreamResponse({
    originalMessages: body.messages,
    onError(error) {
      return error instanceof Error ? error.message : "Onboarding chat failed.";
    },
  });
}
