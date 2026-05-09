import {
  HarwickAssistantRequestSchema,
  HarwickAssistantResponseSchema,
  UuidSchema,
  type HarwickAssistantResponse,
} from "@realty-ops/core";
import { createOpenAIHarwickAssistantRuntime } from "@realty-ops/integrations";
import { NextResponse, type NextRequest } from "next/server";

import { loadRecentLeads } from "../../../../../features/home/recent-leads";
import { loadRoutingDesk } from "../../../../../features/home/routing-desk";
import { loadTeamPresence } from "../../../../../features/home/team-presence";
import { authorizeWorkspaceRequest } from "../../../../../lib/api/workspace-auth";
import { getServerEnvironment } from "../../../../../lib/server-env";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server-client";
import { createSupabaseRecentLeadsRepository } from "../../../../../lib/supabase/recent-leads";
import { createSupabaseRoutingDeskRepository } from "../../../../../lib/supabase/routing-desk";
import { createSupabaseTeamPresenceRepository } from "../../../../../lib/supabase/team-presence";

export const runtime = "nodejs";

type HarwickAssistantStreamEvent =
  | {
      type: "response-metadata";
      data: {
        reasoningSteps: HarwickAssistantResponse["reasoningSteps"];
        scope: string;
        toolCalls: HarwickAssistantResponse["toolCalls"];
      };
    }
  | { type: "answer-chunk"; data: string }
  | { type: "artifact-start"; data: NonNullable<HarwickAssistantResponse["artifact"]> }
  | { type: "artifact-chunk"; data: string }
  | { type: "follow-up-question"; data: HarwickAssistantResponse["followUpQuestion"] }
  | { type: "done"; data: null };

export function describeHarwickAssistantRuntimeError(error: unknown): {
  message: string;
  status: number;
} {
  const genericMessage = "Harwick couldn't catch that. Try again.";

  if (!(error instanceof Error)) {
    return {
      message: genericMessage,
      status: 502,
    };
  }

  const message = error.message.trim();
  if (/insufficient_quota/i.test(message)) {
    return {
      message: genericMessage,
      status: 429,
    };
  }

  if (/429\b/i.test(message)) {
    return {
      message: genericMessage,
      status: 429,
    };
  }

  const statusMatch = /failed \((\d{3})\)/i.exec(message);
  if (statusMatch?.[1] !== undefined) {
    return {
      message: genericMessage,
      status: Number(statusMatch[1]),
    };
  }

  if (
    /did not include text output/i.test(message)
    || /non-json/i.test(message)
    || /invalid response/i.test(message)
    || /zod/i.test(message)
  ) {
    return {
      message: genericMessage,
      status: 502,
    };
  }

  return {
    message: genericMessage,
    status: 502,
  };
}

function splitIntoChunks(value: string, size = 220, preserveWhitespace = false): string[] {
  const text = preserveWhitespace ? value : value.trim();
  if (text.length <= size) return [text];

  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const slice = text.slice(cursor, cursor + size);
    if (cursor + size >= text.length) {
      chunks.push(slice);
      break;
    }

    const breakpoint = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("\n"));
    const end = breakpoint >= Math.floor(size * 0.45) ? cursor + breakpoint + 1 : cursor + size;
    chunks.push(preserveWhitespace ? text.slice(cursor, end) : text.slice(cursor, end).trim());
    cursor = end;
  }

  return chunks.filter((chunk) => chunk.length > 0);
}

function encodeAssistantEvent(event: HarwickAssistantStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function createStreamResponse(response: HarwickAssistantResponse): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const push = async (event: HarwickAssistantStreamEvent) => {
        controller.enqueue(encoder.encode(encodeAssistantEvent(event)));
        await new Promise((resolve) => setTimeout(resolve, 18));
      };

      await push({
        type: "response-metadata",
        data: {
          reasoningSteps: response.reasoningSteps,
          scope: response.scope,
          toolCalls: response.toolCalls,
        },
      });

      for (const chunk of splitIntoChunks(response.answer)) {
        await push({ type: "answer-chunk", data: chunk });
      }

      if (response.artifact !== undefined) {
        await push({ type: "artifact-start", data: response.artifact });
        for (const chunk of splitIntoChunks(response.artifact.body, 260, true)) {
          await push({ type: "artifact-chunk", data: chunk });
        }
      }

      await push({ type: "follow-up-question", data: response.followUpQuestion });
      await push({ type: "done", data: null });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
    },
  });
}

function respond(parsedBody: { stream: boolean }, response: HarwickAssistantResponse) {
  return parsedBody.stream ? createStreamResponse(response) : NextResponse.json(response);
}

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
  const membership = await authorizeWorkspaceRequest({ request, workspaceId });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsedBody = HarwickAssistantRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  let environment: ReturnType<typeof getServerEnvironment>;
  try {
    environment = getServerEnvironment();
  } catch (error) {
    console.error("POST /harwick-assistant missing runtime environment:", error);
    return NextResponse.json({
      error: "assistant_unavailable",
      message: "Harwick assistant is unavailable because server runtime configuration is incomplete.",
    }, { status: 503 });
  }

  if (environment.OPENAI_API_KEY === undefined) {
    return NextResponse.json({
      error: "assistant_unavailable",
      message: "Harwick assistant is unavailable because OPENAI_API_KEY is not configured.",
    }, { status: 503 });
  }

  const supabase = createServerSupabaseClient();
  const [recentLeads, routingDesk, teamPresence] = await Promise.all([
    loadRecentLeads({
      workspaceId,
      repository: createSupabaseRecentLeadsRepository(supabase),
      limit: 8,
    }),
    loadRoutingDesk({
      workspaceId,
      repository: createSupabaseRoutingDeskRepository(supabase),
      limit: 5,
    }),
    loadTeamPresence({
      workspaceId,
      repository: createSupabaseTeamPresenceRepository(supabase),
    }),
  ]);

  const runtimeClient = createOpenAIHarwickAssistantRuntime({
    apiKey: environment.OPENAI_API_KEY,
    model: environment.OPENAI_SMALL_MODEL,
  });

  try {
    const response = HarwickAssistantResponseSchema.parse(await runtimeClient.run({
      workspaceName: membership.workspaceName,
      operatorName: membership.displayName,
      message: parsedBody.data.message,
      mentions: parsedBody.data.mentions,
      recentLeads: recentLeads.items.map((lead) =>
        `${lead.name}: ${lead.stageLabel}, ${lead.sourceLabel} ${lead.channelLabel}, ${lead.lastTouchLabel}, assigned ${lead.assignedDisplayName ?? "unassigned"}`
      ),
      routing: routingDesk.items.map((item) =>
        `${item.leadName}: ${item.decision.assignedDisplayName ?? "unassigned"} because ${item.decision.reasons.join("; ") || item.decision.taskLabel}`
      ),
      team: teamPresence.members.map((member) =>
        `${member.name}: ${member.roleLabel}, ${member.status}, ${member.openWork} open work`
      ),
    }));
    return respond(parsedBody.data, response);
  } catch (error) {
    console.error("POST /harwick-assistant failed:", error);
    const runtimeError = describeHarwickAssistantRuntimeError(error);
    return NextResponse.json({
      error: "assistant_failed",
      message: runtimeError.message,
    }, { status: runtimeError.status });
  }
}
