import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAISmallModelClient } from "@realty-ops/integrations";
import type { WorkspaceRole, HarwickChannelMessage } from "@realty-ops/core";
import { generateText, stepCountIs, type ModelMessage } from "ai";

import { createSmallModelHarwickSubagentExecutorClient } from "../agent-runtime/execute-subagent-tasks";
import { createSmallModelHarwickWorkItemIntelligenceClient } from "../agent-runtime/harwick-work-item-intelligence";
import { getServerEnvironment } from "../../lib/server-env";
import type { RealtyOpsSupabaseClient } from "../../lib/supabase/server-client";

import { OPERATOR_CHAT_REGISTRY } from "../harwick-tools/operator-chat";
import { buildHarwickToolsForScope } from "../harwick-tools/registry";
import { buildHarwickChatTools } from "./tools";
import { buildHarwickChatSystemPrompt } from "./system-prompt";

type ChannelRow = {
  id: string;
  name: string;
  kind: "channel" | "dm" | "group";
};

type ChannelMessageRow = {
  id: string;
  author_kind: "member" | "harwick" | "system";
  author_member_id: string | null;
  body: string;
  created_at: string;
};

type Operator = {
  memberId: string;
  displayName: string;
  role: WorkspaceRole;
  workspaceName: string;
};

const HARWICK_CHANNEL_HISTORY_LIMIT = 24;

async function loadChannelContext(params: {
  supabase: RealtyOpsSupabaseClient;
  channelId: string;
}): Promise<{ channel: ChannelRow | null; messages: ChannelMessageRow[] }> {
  const { data: channelData } = await params.supabase
    .from("harwick_channels")
    .select("id, name, kind")
    .eq("id", params.channelId)
    .maybeSingle();

  const { data: messagesData } = await params.supabase
    .from("harwick_channel_messages")
    .select("id, author_kind, author_member_id, body, created_at")
    .eq("channel_id", params.channelId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(HARWICK_CHANNEL_HISTORY_LIMIT);

  return {
    channel: (channelData as ChannelRow | null) ?? null,
    messages: ((messagesData as ChannelMessageRow[] | null) ?? []).reverse(),
  };
}

async function loadMemberDisplayNames(params: {
  supabase: RealtyOpsSupabaseClient;
  workspaceId: string;
  memberIds: string[];
}): Promise<Map<string, string>> {
  if (params.memberIds.length === 0) return new Map();
  const { data } = await params.supabase
    .from("workspace_members")
    .select("id, display_name")
    .eq("workspace_id", params.workspaceId)
    .in("id", params.memberIds);
  const map = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ id: string; display_name: string }>) {
    map.set(row.id, row.display_name);
  }
  return map;
}

export async function enqueueHarwickChannelReply(params: {
  supabase: RealtyOpsSupabaseClient;
  workspaceId: string;
  channelId: string;
  authorMessage: HarwickChannelMessage;
  operator: Operator;
}): Promise<void> {
  const environment = getServerEnvironment();
  if (environment.OPENAI_API_KEY === undefined) {
    await params.supabase.from("harwick_channel_messages").insert({
      channel_id: params.channelId,
      workspace_id: params.workspaceId,
      author_kind: "harwick",
      author_member_id: null,
      body: "OpenAI is not configured for this workspace yet — ask the owner to set OPENAI_API_KEY.",
      mentions_harwick: false,
      metadata: { trigger: "mention", error: "openai_unavailable" },
    });
    return;
  }

  const context = await loadChannelContext({ supabase: params.supabase, channelId: params.channelId });
  if (context.channel === null) return;

  const memberIds = Array.from(new Set(context.messages.flatMap((m) => (m.author_member_id === null ? [] : [m.author_member_id]))));
  const names = await loadMemberDisplayNames({ supabase: params.supabase, workspaceId: params.workspaceId, memberIds });

  const conversation: ModelMessage[] = context.messages.map((message) => {
    if (message.author_kind === "harwick") {
      return { role: "assistant", content: message.body };
    }
    const speakerName = message.author_member_id === null ? "Member" : (names.get(message.author_member_id) ?? "Member");
    return { role: "user", content: `${speakerName}: ${message.body}` };
  });

  const openai = createOpenAI({ apiKey: environment.OPENAI_API_KEY });
  const smallModel = createOpenAISmallModelClient({
    apiKey: environment.OPENAI_API_KEY,
    model: environment.OPENAI_SMALL_MODEL,
  });
  const modelName = process.env["OPENAI_HARWICK_CHAT_MODEL"] ?? "gpt-4o";

  const inlineTools = buildHarwickChatTools({
    supabase: params.supabase,
    workspaceId: params.workspaceId,
    workspaceName: params.operator.workspaceName,
    operatorMemberId: params.operator.memberId,
    operatorName: params.operator.displayName,
    operatorRole: params.operator.role,
    subagentExecutorClient: createSmallModelHarwickSubagentExecutorClient(smallModel),
    subagentIntelligenceClient: createSmallModelHarwickWorkItemIntelligenceClient(smallModel),
    openai,
  });
  const registryTools = buildHarwickToolsForScope({
    registry: OPERATOR_CHAT_REGISTRY,
    scope: "channel_mention",
    deps: {
      supabase: params.supabase,
      workspaceId: params.workspaceId,
      workspaceName: params.operator.workspaceName,
      operatorMemberId: params.operator.memberId,
      operatorName: params.operator.displayName,
      operatorRole: params.operator.role,
      openai,
    },
  });
  const tools = { ...inlineTools, ...registryTools };

  const systemPrompt = [
    buildHarwickChatSystemPrompt({
      operatorName: params.operator.displayName,
      operatorRole: params.operator.role,
      workspaceName: params.operator.workspaceName,
      currentDate: new Date().toISOString().slice(0, 10),
    }),
    "",
    `CHANNEL CONTEXT: you were @harwick mentioned in channel "${context.channel.name}" (${context.channel.kind}). Channel id: ${params.channelId}.`,
    "Same Harwick the operator knows from the rail — you're just talking in a group chat now instead of a 1:1. Stay you. Same voice, same agency, same card-dropping.",
    "Your reply text is what gets posted in this channel. Do NOT call post_channel_message for the channel you are already in — that's only for posting into OTHER rooms.",
    "Every tool result you produce in this turn renders as a real card directly under your message — same cards as the rail. So when someone asks for unrouted leads, hot leads, the routing desk, a team snapshot, a lead, calendar, etc., CALL the lookup tool AND call the surface_* tool for each item that matters. The cards do the listing work. Your text frames it like a teammate.",
    "Voice: one short paragraph, no bullets, no headers, no 'Here are the leads:'. Real talk like you're texting the team. Use first names. Have an opinion about what matters first.",
    "If multiple people might claim something (e.g. unrouted leads dropped in channel for whoever grabs them first), say so naturally and surface each one as a card. Don't ask permission — they asked you, do it.",
  ].join("\n");

  try {
    const result = await generateText({
      model: openai(modelName),
      system: systemPrompt,
      messages: conversation,
      tools,
      stopWhen: stepCountIs(6),
    });

    // Collect every tool result Harwick produced across the multi-step run.
    // We persist them as `metadata.cards` so the channel renderer can mount the
    // same card components the rail uses — lead cards, routing cards, channel
    // cards, subagent cards, etc. Empty arrays are fine; the renderer no-ops.
    const cards = result.steps.flatMap((step) =>
      step.toolResults.flatMap((toolResult) =>
        toolResult === undefined
          ? []
          : [{ toolName: `tool-${toolResult.toolName}`, output: toolResult.output }],
      ),
    );

    const reply = result.text.trim().length > 0
      ? result.text.trim()
      : cards.length > 0
        ? "Here's what I pulled."
        : "I'm not sure what you want me to do — can you say more?";

    await params.supabase.from("harwick_channel_messages").insert({
      channel_id: params.channelId,
      workspace_id: params.workspaceId,
      author_kind: "harwick",
      author_member_id: null,
      body: reply,
      mentions_harwick: false,
      metadata: JSON.parse(JSON.stringify({
        trigger: "mention",
        in_reply_to_message_id: params.authorMessage.id,
        cards,
      })),
    });
  } catch (error) {
    console.error("[harwick-channel] reply generation failed", error);
    await params.supabase.from("harwick_channel_messages").insert({
      channel_id: params.channelId,
      workspace_id: params.workspaceId,
      author_kind: "harwick",
      author_member_id: null,
      body: "I hit an error trying to respond. Try the rail chat for this one.",
      mentions_harwick: false,
      metadata: { trigger: "mention", error: error instanceof Error ? error.message : String(error) },
    });
  }
}
