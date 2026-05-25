import type { WorkspaceRole, WorkspaceCapability } from "@realty-ops/core";
import { workspaceRoleHasCapability } from "@realty-ops/core";
import type { OpenAIProvider } from "@ai-sdk/openai";
import { tool, type Tool } from "ai";
import type { z, ZodTypeAny } from "zod";

import type { RealtyOpsSupabaseClient } from "../../lib/supabase/server-client";
import type { HarwickSubagentExecutorClient } from "../agent-runtime/execute-subagent-tasks";
import type { HarwickWorkItemIntelligenceClient } from "../agent-runtime/harwick-work-item-intelligence";

/**
 * One Harwick tool registry shared across every runtime that talks to a model.
 *
 * - Rail chat (operator_chat): filtered by scope, gated by role capability.
 * - Lead conversation (lead_conversation): same registry, different filter.
 * - Channel @harwick replies (channel_mention): same again.
 * - Scheduled loops (scheduled_loop): only tools safe under unattended runs.
 *
 * Adding a new Harwick capability means writing ONE tool definition file and
 * tagging the scopes — nothing else needs to know about it.
 */

export type HarwickToolScope =
  | "operator_chat"
  | "lead_conversation"
  | "channel_mention"
  | "scheduled_loop";

export type HarwickToolDeps = {
  supabase: RealtyOpsSupabaseClient;
  workspaceId: string;
  workspaceName: string;
  operatorMemberId: string;
  operatorName: string;
  operatorRole: WorkspaceRole;
  // Active lead id when the runtime is acting on a specific lead conversation.
  // Undefined for operator_chat. Tools that need a lead context but get
  // undefined should return a typed error rather than throwing.
  leadId?: string | null;
  subagentExecutorClient?: HarwickSubagentExecutorClient;
  subagentIntelligenceClient?: HarwickWorkItemIntelligenceClient;
  // OpenAI provider — present, provider-managed tools (web_search) become
  // available. Absent (tests), they're omitted from the built tool record.
  openai?: OpenAIProvider;
};

type HarwickToolExecute<TInput extends ZodTypeAny, TOutput> = {
  execute(input: z.output<TInput>, deps: HarwickToolDeps): Promise<TOutput> | TOutput;
}["execute"];

export type HarwickToolDefinition<TInput extends ZodTypeAny = ZodTypeAny, TOutput = unknown> = {
  name: string;
  description: string;
  scopes: ReadonlyArray<HarwickToolScope>;
  // Capability the operator must hold to invoke this tool. Tools without a
  // capability are role-agnostic but still scope-filtered.
  requiresCapability?: WorkspaceCapability;
  // Approval semantics. 'auto_safe' tools run side-effects in execute().
  // 'approval_required' tools return a queued/proposed payload that the
  // downstream executor surfaces for operator sign-off.
  approval: "auto_safe" | "approval_required" | "internal_safe";
  inputSchema: TInput;
  execute: HarwickToolExecute<TInput, TOutput>;
};

export type HarwickToolDefinitions = ReadonlyArray<HarwickToolDefinition>;

export function defineHarwickTool<TInput extends ZodTypeAny, TOutput>(
  definition: HarwickToolDefinition<TInput, TOutput>,
): HarwickToolDefinition<TInput, TOutput> {
  return definition;
}

/**
 * Build the ai-sdk tool record for a given scope + operator deps. Filters by:
 *   1. scope membership (tool tagged with the active scope)
 *   2. role capability (operator holds requiresCapability if set)
 *
 * Tools that don't satisfy both are silently omitted — the model never sees
 * them, so it can't try to call something the operator can't authorize.
 */
export function buildHarwickToolsForScope(params: {
  registry: HarwickToolDefinitions;
  scope: HarwickToolScope;
  deps: HarwickToolDeps;
}): Record<string, Tool> {
  const record: Record<string, Tool> = {};
  for (const definition of params.registry) {
    if (!definition.scopes.includes(params.scope)) continue;
    if (definition.requiresCapability !== undefined
      && !workspaceRoleHasCapability(params.deps.operatorRole, definition.requiresCapability)) {
      continue;
    }
    record[definition.name] = tool({
      description: definition.description,
      inputSchema: definition.inputSchema,
      execute: (input) => definition.execute(definition.inputSchema.parse(input), params.deps),
    });
  }

  // Provider-managed tools — only available when the OpenAI provider was passed
  // and the scope wants them.
  if (params.deps.openai !== undefined
    && (params.scope === "operator_chat" || params.scope === "channel_mention")) {
    record["web_search"] = params.deps.openai.tools.webSearchPreview({});
  }

  return record;
}
