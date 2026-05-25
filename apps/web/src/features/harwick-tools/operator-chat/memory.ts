import { createOpenAIEmbeddingClient } from "@realty-ops/integrations";
import { z } from "zod";

import { getServerEnvironment } from "../../../lib/server-env";
import { defineHarwickTool, type HarwickToolDefinition, type HarwickToolDeps } from "../registry";

/**
 * Memory tools — Harwick can now remember things across conversations and
 * threads. Backed by workspace_memory_documents (vector-indexed) which is
 * RLS-scoped to the workspace.
 *
 * Three flavors:
 *   - remember_fact         long-lived workspace knowledge ("Sarah only works
 *                           buyer leads. Oak Ave deal closes 6/3.")
 *   - note_operator_pref    how this operator likes Harwick to behave; compounds
 *                           over time and shapes future replies
 *   - recall_fact           semantic search across both kinds + the distillation
 *                           worker's automatic memories
 */

async function embedTextSafely(text: string): Promise<number[] | null> {
  const env = getServerEnvironment();
  if (env.OPENAI_API_KEY === undefined) return null;
  try {
    const client = createOpenAIEmbeddingClient({ apiKey: env.OPENAI_API_KEY });
    return await client.embed(text);
  } catch {
    // Embedding failure shouldn't block memory persistence — we'll still store
    // the row, just without the vector. Recall will fall back to text match.
    return null;
  }
}

export const rememberFactTool = defineHarwickTool({
  name: "remember_fact",
  description: "Store a long-lived fact about this workspace, a lead, a listing, or a pattern you've noticed. Use this any time you learn something that future Harwick turns should know — operator-stated facts ('Sarah handles relocation leads'), inferred patterns ('financing questions on weekends tend to close'), or specific lead context ('Mary makes the buying decision, not John'). Returns a confirmation that's safe to ignore in your reply.",
  scopes: ["operator_chat", "lead_conversation", "channel_mention"],
  approval: "auto_safe",
  inputSchema: z.object({
    title: z.string().min(3).max(120).describe("Short title for the fact. Examples: 'Sarah owns relocation leads', 'Oak Ave closes June 3'."),
    body: z.string().min(8).max(2000).describe("The full fact. Be specific. If it's about a lead, say which lead. If it's about a pattern, say what pattern."),
    kind: z.enum(["operator_note", "lead_fact"]).default("operator_note").describe("'lead_fact' if this fact is about a specific lead; otherwise 'operator_note'."),
    leadId: z.string().uuid().nullable().default(null).describe("If this fact is about a specific lead, its id. Null otherwise."),
    confidence: z.number().min(0).max(1).default(0.8).describe("How certain are you (0..1). Default 0.8 for operator-stated facts; lower for inferences."),
  }),
  async execute(input, deps: HarwickToolDeps) {
    const embedding = await embedTextSafely(`${input.title}\n\n${input.body}`);
    const evidence = {
      stored_by_member_id: deps.operatorMemberId,
      stored_by_name: deps.operatorName,
      ...(input.leadId === null ? {} : { lead_id: input.leadId }),
    } as never;

    const { data, error } = await deps.supabase
      .from("workspace_memory_documents")
      .insert({
        workspace_id: deps.workspaceId,
        memory_type: input.kind,
        title: input.title,
        body: input.body,
        source: "operator_note",
        confidence: input.confidence,
        evidence,
        ...(embedding === null ? {} : { embedding: embedding as never }),
      })
      .select("id, title, created_at")
      .single();

    if (error !== null || data === null) {
      return { stored: false, error: error?.message ?? "insert_failed" };
    }

    return {
      kind: "memory_stored",
      stored: true,
      memoryId: data.id,
      title: data.title,
      kindStored: input.kind,
      embedded: embedding !== null,
    };
  },
});

export const noteOperatorPreferenceTool = defineHarwickTool({
  name: "note_operator_preference",
  description: "Capture a preference about how THIS operator wants you to work. Use when the operator corrects your style ('stop summarizing what you just did'), asks you to always do something ('always draft, never send'), or expresses a workflow preference ('I want morning briefings at 7am'). These compound across sessions — future Harwick turns will see and respect them.",
  scopes: ["operator_chat", "channel_mention"],
  approval: "auto_safe",
  inputSchema: z.object({
    preference: z.string().min(8).max(800).describe("The preference in the operator's own words if possible. Examples: 'No trailing summaries after replies', 'Always draft Meta replies — never send without approval', 'Morning briefings should land by 7:30am ET'."),
    why: z.string().max(400).optional().describe("Optional context for why this preference exists. Helps future Harwick judge edge cases."),
    confidence: z.number().min(0).max(1).default(0.9).describe("Defaults to 0.9 since operator-stated preferences should be high-confidence."),
  }),
  async execute(input, deps: HarwickToolDeps) {
    const body = input.why === undefined || input.why.trim().length === 0
      ? input.preference
      : `${input.preference}\n\nWhy: ${input.why.trim()}`;
    const embedding = await embedTextSafely(body);

    const { data, error } = await deps.supabase
      .from("workspace_memory_documents")
      .insert({
        workspace_id: deps.workspaceId,
        memory_type: "operator_pref",
        title: input.preference.slice(0, 100),
        body,
        source: "operator_note",
        confidence: input.confidence,
        evidence: { operator_member_id: deps.operatorMemberId, operator_name: deps.operatorName } as never,
        ...(embedding === null ? {} : { embedding: embedding as never }),
      })
      .select("id, title")
      .single();

    if (error !== null || data === null) {
      return { stored: false, error: error?.message ?? "insert_failed" };
    }

    return { kind: "operator_preference_stored", stored: true, memoryId: data.id };
  },
});

export const recallFactTool = defineHarwickTool({
  name: "recall_fact",
  description: "Semantic search across everything you've remembered for this workspace — operator notes, lead facts, operator preferences, and the distillation worker's auto-mined patterns. Use this WHENEVER you'd otherwise guess about workspace state, operator preferences, or a lead's history. The relevant memories come back ranked by similarity to your query.",
  scopes: ["operator_chat", "lead_conversation", "channel_mention", "scheduled_loop"],
  approval: "internal_safe",
  inputSchema: z.object({
    query: z.string().min(3).max(500).describe("Natural-language query. Examples: 'how does Sarah like routing handled?', 'what do I know about Oak Avenue', 'preferences for morning briefings'."),
    kinds: z.array(z.enum(["operator_note", "operator_pref", "lead_fact", "pattern", "routing", "objection", "market", "policy_signal"])).max(8).optional().describe("Restrict to specific memory kinds. Omit to search everything."),
    limit: z.number().int().min(1).max(12).default(5).describe("Max memories to return."),
  }),
  async execute(input, deps: HarwickToolDeps) {
    const queryEmbedding = await embedTextSafely(input.query);

    // If embedding fails, fall back to ILIKE text match on title/body so this
    // tool never returns a dead "embedding unavailable" answer.
    if (queryEmbedding === null) {
      let query = deps.supabase
        .from("workspace_memory_documents")
        .select("id, memory_type, title, body, confidence, last_observed_at, evidence")
        .eq("workspace_id", deps.workspaceId)
        .or(`title.ilike.%${input.query}%,body.ilike.%${input.query}%`)
        .order("last_observed_at", { ascending: false })
        .limit(input.limit);
      if (input.kinds !== undefined && input.kinds.length > 0) {
        query = query.in("memory_type", input.kinds);
      }
      const { data, error } = await query;
      if (error !== null) {
        return { kind: "memory_recall", count: 0, memories: [], note: error.message };
      }
      return {
        kind: "memory_recall",
        count: (data ?? []).length,
        searchMode: "text_fallback",
        memories: data ?? [],
      };
    }

    // Vector search via RPC. If the RPC isn't installed yet, fall back to text
    // search so this tool degrades gracefully.
    const { data: rpcData, error: rpcError } = await deps.supabase.rpc(
      "match_workspace_memory_documents" as never,
      {
        target_workspace_id: deps.workspaceId,
        query_embedding: queryEmbedding,
        match_threshold: 0.55,
        match_count: input.limit,
      } as never,
    );

    if (rpcError !== null) {
      let query = deps.supabase
        .from("workspace_memory_documents")
        .select("id, memory_type, title, body, confidence, last_observed_at, evidence")
        .eq("workspace_id", deps.workspaceId)
        .order("last_observed_at", { ascending: false })
        .limit(input.limit);
      if (input.kinds !== undefined && input.kinds.length > 0) {
        query = query.in("memory_type", input.kinds);
      }
      const { data, error } = await query;
      if (error !== null) {
        return { kind: "memory_recall", count: 0, memories: [], note: error.message };
      }
      return {
        kind: "memory_recall",
        count: (data ?? []).length,
        searchMode: "recency_fallback",
        memories: data ?? [],
        rpcNote: rpcError.message,
      };
    }

    const rpcRows = Array.isArray(rpcData) ? (rpcData as unknown[]) : [];
    return {
      kind: "memory_recall",
      count: rpcRows.length,
      searchMode: "vector",
      memories: rpcRows,
    };
  },
});

export const MEMORY_TOOLS: HarwickToolDefinition[] = [
  rememberFactTool,
  noteOperatorPreferenceTool,
  recallFactTool,
];
