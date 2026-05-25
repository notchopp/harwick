import { describe, expect, it } from "vitest";

import { queryWorkspaceTool, delegateComplexTaskTool } from "./anything";
import type { HarwickToolDefinition, HarwickToolDeps } from "../registry";
import type { RealtyOpsSupabaseClient } from "../../../lib/supabase/server-client";

type StubResult = { data: unknown; error: { message: string } | null };
type ChainBuilder = {
  select: () => ChainBuilder;
  insert: () => ChainBuilder;
  update: () => ChainBuilder;
  eq: () => ChainBuilder;
  neq: () => ChainBuilder;
  in: () => ChainBuilder;
  is: () => ChainBuilder;
  not: () => ChainBuilder;
  gte: () => ChainBuilder;
  gt: () => ChainBuilder;
  lt: () => ChainBuilder;
  lte: () => ChainBuilder;
  ilike: () => ChainBuilder;
  order: () => ChainBuilder;
  limit: () => ChainBuilder;
  maybeSingle: () => Promise<StubResult>;
  single: () => Promise<StubResult>;
  then: Promise<StubResult>["then"];
};

function chain(result: StubResult): ChainBuilder {
  const promise = Promise.resolve(result);
  const builder: ChainBuilder = {
    select: () => builder,
    insert: () => builder,
    update: () => builder,
    eq: () => builder,
    neq: () => builder,
    in: () => builder,
    is: () => builder,
    not: () => builder,
    gte: () => builder,
    gt: () => builder,
    lt: () => builder,
    lte: () => builder,
    ilike: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: () => promise,
    single: () => promise,
    then: promise.then.bind(promise),
  };
  return builder;
}

function makeStubSupabase(perTable: Record<string, StubResult>): RealtyOpsSupabaseClient {
  return {
    from(table: string) {
      return chain(perTable[table] ?? { data: null, error: { message: `unstubbed table: ${table}` } });
    },
  } as unknown as RealtyOpsSupabaseClient;
}

const baseDeps: Omit<HarwickToolDeps, "supabase"> = {
  workspaceId: "00000000-0000-0000-0000-000000000001",
  workspaceName: "Test Workspace",
  operatorMemberId: "00000000-0000-0000-0000-000000000002",
  operatorName: "Test Operator",
  operatorRole: "owner" as const,
};

function call(tool: HarwickToolDefinition, input: unknown, deps: HarwickToolDeps): Promise<unknown> {
  return Promise.resolve(tool.execute(input, deps));
}

describe("query_workspace tool", () => {
  it("returns rows on a valid table read", async () => {
    const supabase = makeStubSupabase({
      leads: { data: [{ id: "lead-1", status: "hot" }, { id: "lead-2", status: "engaged" }], error: null },
    });
    const result = (await call(queryWorkspaceTool, {
      table: "leads",
      columns: ["id", "status"],
      filters: [],
      limit: 10,
    }, { ...baseDeps, supabase })) as { kind: string; count: number };
    expect(result.kind).toBe("workspace_query");
    expect(result.count).toBe(2);
  });

  it("surfaces an error if the underlying query fails", async () => {
    const supabase = makeStubSupabase({
      leads: { data: null, error: { message: "permission denied" } },
    });
    const result = (await call(queryWorkspaceTool, {
      table: "leads",
      columns: [],
      filters: [],
      limit: 5,
    }, { ...baseDeps, supabase })) as { count: number; error?: string };
    expect(result.count).toBe(0);
    expect(result.error).toMatch(/permission/);
  });

  it("only allows whitelisted tables (model can't read arbitrary tables)", () => {
    // We invoke the zod parse directly to verify the schema rejects non-whitelisted tables.
    const result = queryWorkspaceTool.inputSchema.safeParse({
      table: "auth.users",
      columns: [],
      filters: [],
      limit: 5,
    });
    expect(result.success).toBe(false);
  });
});

describe("delegate_complex_task tool", () => {
  it("creates a tracked work item", async () => {
    const supabase = makeStubSupabase({
      harwick_work_items: { data: { id: "wi-1", title: "Custom market analysis", priority: "high" }, error: null },
    });
    const result = (await call(delegateComplexTaskTool, {
      title: "Custom market analysis",
      body: "Pull median DOM for our top 3 zip codes vs last quarter and surface the delta.",
      leadId: null,
      priority: "high",
    }, { ...baseDeps, supabase })) as { kind: string; created: boolean; workItemId?: string };
    expect(result.kind).toBe("delegated_task");
    expect(result.created).toBe(true);
    expect(result.workItemId).toBe("wi-1");
  });

  it("surfaces insertion errors honestly", async () => {
    const supabase = makeStubSupabase({
      harwick_work_items: { data: null, error: { message: "insert failed" } },
    });
    const result = (await call(delegateComplexTaskTool, {
      title: "Should fail",
      body: "Some body text that's long enough.",
      leadId: null,
      priority: "normal",
    }, { ...baseDeps, supabase })) as { created: boolean; error?: string };
    expect(result.created).toBe(false);
    expect(result.error).toMatch(/insert failed/);
  });
});
