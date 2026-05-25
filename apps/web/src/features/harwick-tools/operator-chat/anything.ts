import { z } from "zod";

import type { HarwickToolDefinition, HarwickToolDeps } from "../registry";

/**
 * The "scoped anything" tools — used when no specific tool fits.
 *
 *   - query_workspace          Structured read against a whitelisted table set.
 *                              workspace_id is enforced server-side; the model
 *                              can never query across workspaces. Filters use a
 *                              whitelisted operator set. Read-only.
 *
 *   - delegate_complex_task    When the request can't be done with the existing
 *                              tools (or chains of them) in this turn, surface
 *                              it as a tracked work item so the operator (or a
 *                              future Harwick session) picks it up.
 *
 * Together these handle the "if there's no tool for it" fallback the user
 * wished for, with bounded surface area instead of an unconstrained eval.
 */

// Tables the model can read. Add to this list intentionally — every entry is a
// table whose data we want Harwick to be able to reason over.
const READABLE_TABLES = [
  "leads",
  "lead_events",
  "lead_tasks",
  "listing_facts",
  "conversations",
  "conversation_messages",
  "conversation_automation_states",
  "agent_trajectories",
  "agent_steps",
  "agent_outcomes",
  "workspace_members",
  "harwick_subagent_tasks",
  "harwick_work_items",
  "harwick_loops",
  "harwick_loop_runs",
  "workspace_memory_documents",
  "harwick_chat_threads",
  "harwick_channels",
  "harwick_channel_messages",
  "harwick_routing_decisions",
  "audit_logs",
  "social_reply_reviews",
  "nurture_messages",
  "workspace_subscriptions",
] as const;

type ReadableTable = (typeof READABLE_TABLES)[number];

const FilterOperatorSchema = z.enum(["eq", "neq", "in", "lt", "lte", "gt", "gte", "ilike", "is_null", "not_null"]);

const FilterSchema = z.object({
  column: z.string().min(1).max(60),
  op: FilterOperatorSchema,
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()])), z.null()])
    .describe("Filter value. For 'in' use an array. For 'is_null' / 'not_null' value is ignored."),
});

const QueryWorkspaceInputSchema = z.object({
  table: z.enum(READABLE_TABLES).describe("Which table to query. Pick from the whitelist; anything else returns an error."),
  columns: z.array(z.string().min(1).max(60)).max(20).default([]).describe("Columns to select. Empty array = all columns."),
  filters: z.array(FilterSchema).max(10).default([]).describe("Filters AND-ed together."),
  orderBy: z.object({
    column: z.string().min(1).max(60),
    ascending: z.boolean().default(false),
  }).optional().describe("Optional sort."),
  limit: z.number().int().min(1).max(100).default(25),
});

export const queryWorkspaceTool: HarwickToolDefinition = {
  name: "query_workspace",
  description: "Read-only structured query against a whitelisted table set in this workspace. Use whenever you need data and no specific lookup tool fits — counts, custom slices, cross-table joins-by-followup-call, ad-hoc analytics. workspace_id is enforced server-side; you can never see another workspace. Filters use a whitelisted operator set (eq, neq, in, lt/lte/gt/gte, ilike, is_null, not_null). Returns up to 100 rows.",
  scopes: ["operator_chat", "channel_mention", "scheduled_loop"],
  approval: "internal_safe",
  inputSchema: QueryWorkspaceInputSchema,
  async execute(input: z.output<typeof QueryWorkspaceInputSchema>, deps: HarwickToolDeps) {
    const table: ReadableTable = input.table;
    const selectClause = input.columns.length === 0 ? "*" : input.columns.join(", ");

    let query = deps.supabase
      .from(table)
      .select(selectClause)
      .eq("workspace_id", deps.workspaceId)
      .limit(input.limit);

    for (const filter of input.filters) {
      switch (filter.op) {
        case "eq":
          query = query.eq(filter.column, filter.value as never);
          break;
        case "neq":
          query = query.neq(filter.column, filter.value);
          break;
        case "in":
          if (Array.isArray(filter.value)) {
            query = query.in(filter.column, filter.value);
          }
          break;
        case "lt":
          query = query.lt(filter.column as never, filter.value as never);
          break;
        case "lte":
          query = query.lte(filter.column as never, filter.value as never);
          break;
        case "gt":
          query = query.gt(filter.column as never, filter.value as never);
          break;
        case "gte":
          query = query.gte(filter.column as never, filter.value as never);
          break;
        case "ilike":
          if (typeof filter.value === "string") {
          query = query.ilike(filter.column, filter.value);
          }
          break;
        case "is_null":
          query = query.is(filter.column as never, null as never);
          break;
        case "not_null":
          query = query.not(filter.column, "is", null);
          break;
      }
    }

    if (input.orderBy !== undefined) {
      query = query.order(input.orderBy.column, { ascending: input.orderBy.ascending });
    }

    const { data, error } = await query;
    if (error !== null) {
      return { kind: "workspace_query", count: 0, rows: [], error: error.message };
    }

    return {
      kind: "workspace_query",
      table,
      count: Array.isArray(data) ? data.length : 0,
      rows: data ?? [],
    };
  },
};

const DelegateComplexTaskInputSchema = z.object({
  title: z.string().min(8).max(160).describe("Short title for the operator's queue."),
  body: z.string().min(20).max(4000).describe("Full description: what's needed, why it's outside Harwick's tool surface, what 'done' looks like."),
  leadId: z.string().uuid().nullable().default(null),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  suggestedNextStep: z.string().max(800).optional(),
});

export const delegateComplexTaskTool: HarwickToolDefinition = {
  name: "delegate_complex_task",
  description: "When a request genuinely doesn't fit any of your other tools — even chained — create a tracked work item describing what's needed. This surfaces in the operator's queue with full context. Use SPARINGLY; first try to compose existing tools. Good fit: novel research that needs a human pass, ambiguous routing that needs owner judgment, anything that needs a third-party API we haven't wired yet.",
  scopes: ["operator_chat", "channel_mention"],
  approval: "approval_required",
  inputSchema: DelegateComplexTaskInputSchema,
  async execute(input: z.output<typeof DelegateComplexTaskInputSchema>, deps: HarwickToolDeps) {
    const { data, error } = await deps.supabase
      .from("harwick_work_items")
      .insert({
        workspace_id: deps.workspaceId,
        ...(input.leadId === null ? {} : { lead_id: input.leadId }),
        item_type: "work_item",
        status: "pending",
        priority: input.priority,
        target_member_id: deps.operatorMemberId,
        title: input.title,
        summary: input.body.slice(0, 800),
        recommended_action: input.suggestedNextStep ?? "Resolve when convenient.",
        reason: "Harwick delegated this because no existing tool fit.",
        payload: {
          source: "harwick.delegate_complex_task",
          requested_by_member_id: deps.operatorMemberId,
          full_body: input.body,
          suggested_next_step: input.suggestedNextStep ?? null,
        } as never,
      })
      .select("id, title, priority")
      .single();

    if (error !== null || data === null) {
      return { kind: "delegated_task", created: false, error: error?.message ?? "insert_failed" };
    }

    return {
      kind: "delegated_task",
      created: true,
      workItemId: data.id,
      title: data.title,
      priority: data.priority,
      openHref: `/queue?workItemId=${data.id}`,
    };
  },
};

export const ANYTHING_TOOLS: HarwickToolDefinition[] = [
  queryWorkspaceTool,
  delegateComplexTaskTool,
];
