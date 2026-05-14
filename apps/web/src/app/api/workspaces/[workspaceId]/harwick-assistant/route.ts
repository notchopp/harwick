import {
  HarwickAssistantRequestSchema,
  HarwickAssistantResponseSchema,
  UuidSchema,
  type HarwickAssistantResponse,
} from "@realty-ops/core";
import { createHarwickAiRuntime } from "../../../../../features/lead-intake/ai-sdk-runtime";
import { NextResponse, type NextRequest } from "next/server";

import {
  buildHarwickRecentLeadSummary,
  buildHarwickRoutingSummary,
  buildHarwickTeamSummary,
} from "../../../../../features/home/harwick-assistant-context";
import { createDefaultHomeHarwickRuntimeService } from "../../../../../features/home/home-harwick-runtime";
import { buildHarwickResponseCards } from "../../../../../features/home/harwick-response-cards";
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
        responseCards: HarwickAssistantResponse["responseCards"];
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

/** Split prose into word-sized chunks that simulate token streaming. Each
 * chunk is a single word with its trailing whitespace, so reassembly is just
 * concatenation. Keeps punctuation attached. */
function splitIntoWords(value: string): string[] {
  const text = value.trim();
  if (text.length === 0) return [];
  const matches = text.match(/\S+\s*/g);
  return matches ?? [text];
}

function encodeAssistantEvent(event: HarwickAssistantStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function createStreamResponse(response: HarwickAssistantResponse): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const pushNow = (event: HarwickAssistantStreamEvent) => {
        controller.enqueue(encoder.encode(encodeAssistantEvent(event)));
      };
      const pushDelayed = async (event: HarwickAssistantStreamEvent, delayMs: number) => {
        pushNow(event);
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      };

      // 1) Metadata first — cards + tool chips appear instantly, before prose.
      pushNow({
        type: "response-metadata",
        data: {
          reasoningSteps: response.reasoningSteps,
          scope: response.scope,
          toolCalls: response.toolCalls,
          responseCards: response.responseCards,
        },
      });

      // 2) Prose streams word-by-word so it feels like Claude's typing. The
      // model call is single-shot upstream (see TODO in note below), so this
      // is visual streaming, not true token streaming yet.
      const words = splitIntoWords(response.answer);
      for (const word of words) {
        await pushDelayed({ type: "answer-chunk", data: word }, 22);
      }

      // 3) Artifact body streams larger chunks (less critical for "live" feel).
      if (response.artifact !== undefined) {
        pushNow({ type: "artifact-start", data: response.artifact });
        for (const chunk of splitIntoChunks(response.artifact.body, 260, true)) {
          await pushDelayed({ type: "artifact-chunk", data: chunk }, 12);
        }
      }

      pushNow({ type: "follow-up-question", data: response.followUpQuestion });
      pushNow({ type: "done", data: null });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      // AI-SDK-style stream marker so a future client can use useChat directly.
      "X-Vercel-AI-Data-Stream": "v1",
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

  const runtimeClient = createHarwickAiRuntime({
    apiKey: environment.OPENAI_API_KEY,
    model: environment.OPENAI_REPLY_MODEL,
  });
  const assistantRuntime = createDefaultHomeHarwickRuntimeService({
    supabase,
    runtime: runtimeClient,
  });

  try {
    const rawResponse = await assistantRuntime.run({
      workspaceId,
      workspaceName: membership.workspaceName,
      operatorName: membership.displayName,
      message: parsedBody.data.message,
      mentions: parsedBody.data.mentions,
      activeLeadId: parsedBody.data.activeLeadId,
      threadId: parsedBody.data.threadId ?? null,
      recentLeadSummaries: recentLeads.items.map((lead) => buildHarwickRecentLeadSummary(lead)),
      routingSummaries: routingDesk.items.map((item) => buildHarwickRoutingSummary(item)),
      teamSummaries: teamPresence.members.map((member) => buildHarwickTeamSummary(member)),
    });

    const responseCards = buildHarwickResponseCards({
      message: parsedBody.data.message,
      recentLeads: recentLeads.items,
      routingDesk: routingDesk.items,
      teamPresence: teamPresence.members,
      toolCalls: rawResponse.toolCalls,
    });

    const response = HarwickAssistantResponseSchema.parse({
      ...rawResponse,
      responseCards,
    });
    return respond(parsedBody.data, response);
  } catch (error) {
    // Full stack + message to dev log so we can debug the rail next time.
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("[harwick-assistant] runtime failed", {
      workspaceId,
      message: parsedBody.data.message.slice(0, 200),
      activeLeadId: parsedBody.data.activeLeadId,
      threadId: parsedBody.data.threadId ?? null,
      errorName: error instanceof Error ? error.name : "unknown",
      errorMessage: error instanceof Error ? error.message : String(error),
      stack: stack === undefined ? undefined : stack.split("\n").slice(0, 5).join(" | "),
    });
    const runtimeError = describeHarwickAssistantRuntimeError(error);
    return NextResponse.json({
      error: "assistant_failed",
      message: runtimeError.message,
    }, { status: runtimeError.status });
  }
}
