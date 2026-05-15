import { describe, expect, it } from "vitest";

import { queryWorkspaceTool, delegateComplexTaskTool } from "./anything";

type StubResult = { data: unknown; error: { message: string } | null };

function chain(result: StubResult) {
  const promise = Promise.resolve(result);
  const builder: Record<string, unknown> = {
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
    then: (...args: unknown[]) => (promise as unknown as { then: Function }).then(...args),
  };
  return builder;
}

function makeStubSupabase(perTable: Record<string, StubResult>): unknown {
  return {
    from(table: string) {
      return chain(perTable[table] ?? { data: null, error: { message: `unstubbed table: ${table}` } });
    },
  };
}

const baseDeps = {
  workspaceId: "00000000-0000-0000-0000-000000000001",
  workspaceName: "Test Workspace",
  operatorMemberId: "00000000-0000-0000-0000-000000000002",
  operatorName: "Test Operator",
  operatorRole: "owner" as const,
};

async function call(tool: { execute: (input: unknown, deps: unknown) => unknown }, input: unknown, deps: unknown): Promise<unknown> {
  return tool.execute(input, deps);
}

describe("query_workspace tool", () => {
  it("returns rows on a valid table read", async () => {
    const supabase = makeStubSupabase({
      leads: { data: [{ id: "lead-1", status: "hot" }, { id: "lead-2", status: "engaged" }], error: null },
    });
    const result = (await call(queryWorkspaceTool as never, {
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
    const result = (await call(queryWorkspaceTool as never, {
      table: "leads",
      columns: [],
      filters: [],
      limit: 5,
    }, { ...baseDeps, supabase })) as { count: number; error?: string };
    expect(result.count).toBe(0);
    expect(result.error).toMatch(/permission/);
  });

  it("only allows whitelisted tables (model can't read arbitrary tables)", async () => {
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
    const result = (await call(delegateComplexTaskTool as never, {
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
    const result = (await call(delegateComplexTaskTool as never, {
      title: "Should fail",
      body: "Some body text that's long enough.",
      leadId: null,
      priority: "normal",
    }, { ...baseDeps, supabase })) as { created: boolean; error?: string };
    expect(result.created).toBe(false);
    expect(result.error).toMatch(/insert failed/);
  });
});
