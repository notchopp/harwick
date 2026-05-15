import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAISmallModelClient } from "@realty-ops/integrations";
import { UuidSchema } from "@realty-ops/core";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { NextResponse, type NextRequest } from "next/server";

import { createSmallModelHarwickSubagentExecutorClient } from "../../../../../features/agent-runtime/execute-subagent-tasks";
import { createSmallModelHarwickWorkItemIntelligenceClient } from "../../../../../features/agent-runtime/harwick-work-item-intelligence";
import { buildHarwickChatTools } from "../../../../../features/harwick-chat/tools";
import { buildHarwickChatSystemPrompt } from "../../../../../features/harwick-chat/system-prompt";
import { OPERATOR_CHAT_REGISTRY } from "../../../../../features/harwick-tools/operator-chat";
import { buildHarwickToolsForScope } from "../../../../../features/harwick-tools/registry";
import { authorizeWorkspaceRequest } from "../../../../../lib/api/workspace-auth";
import { getServerEnvironment } from "../../../../../lib/server-env";
import { createSupabaseAgentTrajectoryStore } from "../../../../../lib/supabase/agent-trajectory-store";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server-client";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatRequestBody = {
  messages: UIMessage[];
  id?: string;
};

function readTextFromMessage(message: UIMessage | undefined): string | null {
  if (message === undefined) return null;
  const text = message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();
  return text.length > 0 ? text : null;
}

function summarizeToolExecutions(messages: UIMessage[]): Array<{
  tool: string;
  status: string;
  output?: unknown;
}> {
  return messages.flatMap((message) => message.parts.flatMap((part) => {
    if (!part.type.startsWith("tool-")) return [];
    const toolPart = part as { type: string; state?: string; output?: unknown };
    return [{
      tool: toolPart.type.replace(/^tool-/, ""),
      status: toolPart.state ?? "unknown",
      ...(toolPart.output === undefined ? {} : { output: toolPart.output }),
    }];
  }));
}

async function loadPersistedMessages(params: {
  supabase: ReturnType<typeof createServerSupabaseClient>;
  workspaceId: string;
  threadId: string;
}): Promise<UIMessage[]> {
  const { data: trajectories, error: trajectoryError } = await params.supabase
    .from("agent_trajectories")
    .select("id")
    .eq("workspace_id", params.workspaceId)
    .eq("thread_id" as never, params.threadId as never)
    .order("started_at", { ascending: false })
    .limit(1);

  if (trajectoryError !== null || trajectories === null || trajectories.length === 0) {
    return [];
  }

  const trajectoryId = trajectories[0]?.id;
  if (trajectoryId === undefined) return [];

  const { data: steps, error: stepError } = await params.supabase
    .from("agent_steps")
    .select("turn_output")
    .eq("workspace_id", params.workspaceId)
    .eq("trajectory_id", trajectoryId)
    .order("iteration", { ascending: false })
    .limit(1);

  if (stepError !== null || steps === null || steps.length === 0) {
    return [];
  }

  const output = steps[0]?.turn_output;
  if (output === null || typeof output !== "object" || Array.isArray(output)) {
    return [];
  }

  const messages = (output as { uiMessages?: unknown }).uiMessages;
  return Array.isArray(messages) ? messages as UIMessage[] : [];
}

export async function GET(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId: rawWorkspaceId } = await context.params;
  const parsedWorkspaceId = UuidSchema.safeParse(rawWorkspaceId);
  if (!parsedWorkspaceId.success) {
    return NextResponse.json({ error: "invalid_workspace" }, { status: 400 });
  }
  const workspaceId = parsedWorkspaceId.data;

  const membership = await authorizeWorkspaceRequest({ request, workspaceId });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const threadId = request.nextUrl.searchParams.get("threadId");
  if (threadId === null || threadId.trim().length === 0 || threadId.length > 160) {
    return NextResponse.json({ error: "invalid_thread" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const messages = await loadPersistedMessages({ supabase, workspaceId, threadId });
  return NextResponse.json({ messages });
}

export async function POST(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId: rawWorkspaceId } = await context.params;
  const parsedWorkspaceId = UuidSchema.safeParse(rawWorkspaceId);
  if (!parsedWorkspaceId.success) {
    return NextResponse.json({ error: "invalid_workspace" }, { status: 400 });
  }
  const workspaceId = parsedWorkspaceId.data;

  const membership = await authorizeWorkspaceRequest({ request, workspaceId });
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
  const threadId = typeof body.id === "string" && body.id.trim().length > 0
    ? body.id.slice(0, 160)
    : `rail-${workspaceId}`;

  const supabase = createServerSupabaseClient();
  const trajectoryStore = createSupabaseAgentTrajectoryStore(supabase);
  const openai = createOpenAI({ apiKey: environment.OPENAI_API_KEY });
  const smallModel = createOpenAISmallModelClient({
    apiKey: environment.OPENAI_API_KEY,
    model: environment.OPENAI_SMALL_MODEL,
  });
  // Env override so we can flip models without redeploy; defaults to a real
  // tool-capable model (NOT mini, which fails structured output reliably).
  const modelName = process.env["OPENAI_HARWICK_CHAT_MODEL"] ?? "gpt-4o";

  // Two tool sources merged into one record for the model:
  //   1. The original inline rail tools (list_leads, surface_lead, etc.)
  //   2. The unified registry of new smart tools (memory, semantic search,
  //      calendar, pipeline mutations, cross-channel, self-awareness,
  //      briefings, query_workspace, delegate_complex_task).
  // The registry filters by scope + role capability automatically.
  const inlineTools = buildHarwickChatTools({
    supabase,
    workspaceId,
    workspaceName: membership.workspaceName,
    operatorMemberId: membership.memberId,
    operatorName: membership.displayName,
    operatorRole: membership.role,
    subagentExecutorClient: createSmallModelHarwickSubagentExecutorClient(smallModel),
    subagentIntelligenceClient: createSmallModelHarwickWorkItemIntelligenceClient(smallModel),
    openai,
  });
  const registryTools = buildHarwickToolsForScope({
    registry: OPERATOR_CHAT_REGISTRY,
    scope: "operator_chat",
    deps: {
      supabase,
      workspaceId,
      workspaceName: membership.workspaceName,
      operatorMemberId: membership.memberId,
      operatorName: membership.displayName,
      operatorRole: membership.role,
      openai,
    },
  });
  const tools = { ...inlineTools, ...registryTools };

  const systemPrompt = buildHarwickChatSystemPrompt({
    operatorName: membership.displayName,
    operatorRole: membership.role,
    workspaceName: membership.workspaceName,
    currentDate: new Date().toISOString().slice(0, 10),
  });

  const modelMessages = await convertToModelMessages(body.messages);
  const result = streamText({
    model: openai(modelName),
    system: systemPrompt,
    messages: modelMessages,
    tools,
    // Let the model chain tool calls — call list_leads, then read the result,
    // then call get_lead_detail, etc. Bounded at 6 steps so a bug can't loop.
    stopWhen: stepCountIs(6),
    onError({ error }) {
      console.error("[harwick-chat] streamText error", error);
    },
  });

  return result.toUIMessageStreamResponse({
    originalMessages: body.messages,
    async onFinish(event) {
      if (event.isAborted) return;
      const userText = readTextFromMessage(body.messages[body.messages.length - 1]);
      const assistantText = readTextFromMessage(event.responseMessage);
      const nowIso = new Date().toISOString();

      // Persist the turn (trajectory + step + completion). Each await is
      // wrapped so a single failure doesn't skip the rest — completion has
      // to land or every trajectory shows up as "pending forever".
      let trajectoryId: string | null = null;
      try {
        const result = await trajectoryStore.startTrajectory({
          workspaceId,
          leadId: null,
          channel: "harwick_chat",
          threadId,
          startedAt: nowIso,
        });
        trajectoryId = result.trajectoryId;
      } catch (error) {
        console.error("[harwick-chat] startTrajectory failed", error);
      }

      if (trajectoryId !== null) {
        const toolExecutions = summarizeToolExecutions(event.messages);
        try {
          await trajectoryStore.appendStep({
            trajectoryId,
            workspaceId,
            leadId: null,
            iteration: 1,
            inputSnapshot: {
              threadId,
              inboundText: userText,
              messageCount: body.messages.length,
            },
            turnOutput: {
              reply: assistantText,
              finishReason: event.finishReason ?? null,
              uiMessages: event.messages,
            },
            toolExecutions,
            selfGateAutoExecute: null,
            selfGateReason: null,
            deterministicGateAutoExecute: null,
            gatesAgreed: null,
            exitReason: event.finishReason ?? null,
            harwickAiTurnId: null,
          });
        } catch (error) {
          console.error("[harwick-chat] appendStep failed", error);
        }

        try {
          await trajectoryStore.completeTrajectory({
            trajectoryId,
            completedAt: nowIso,
            completionReason: event.finishReason ?? "completed",
            stepCount: 1,
            summaryText: assistantText,
            outcomeLabel: "pending",
          });
        } catch (error) {
          console.error("[harwick-chat] completeTrajectory failed", error);
        }
      }

      // Auto-title the thread on the first turn so "New chat" doesn't linger.
      // Cheap heuristic: derive a 3-7 word title from the user's first message
      // and only write if the thread is still on the default title.
      if (userText !== null && userText.length > 0) {
        try {
          const derivedTitle = userText
            .replace(/\s+/g, " ")
            .trim()
            .split(" ")
            .slice(0, 7)
            .join(" ")
            .slice(0, 60);
          if (derivedTitle.length >= 3) {
            await supabase
              .from("harwick_chat_threads")
              .update({ title: derivedTitle, updated_at: nowIso, last_message_at: nowIso })
              .eq("workspace_id", workspaceId)
              .eq("id", threadId)
              .eq("title", "New chat");
            // If the title was already customized, the .eq() filter no-ops it.
            // Always bump last_message_at separately so list ordering stays fresh.
            await supabase
              .from("harwick_chat_threads")
              .update({ last_message_at: nowIso, updated_at: nowIso })
              .eq("workspace_id", workspaceId)
              .eq("id", threadId);
          }
        } catch (error) {
          console.error("[harwick-chat] thread title update failed", error);
        }
      }
    },
    onError(error) {
      // Surface a friendly string instead of a raw Error to the client.
      return error instanceof Error ? error.message : "Harwick stream failed.";
    },
  });
}
