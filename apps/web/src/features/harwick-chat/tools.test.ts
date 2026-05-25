import type { WorkspaceRole } from "@realty-ops/core";
import { describe, expect, it } from "vitest";

import { buildHarwickChatTools } from "./tools";
import type { RealtyOpsSupabaseClient } from "../../lib/supabase/server-client";

// Minimal Supabase stub that returns chainable thenable-ish objects. The new
// channel tools only do .from().insert().select().single() and
// .from().select().eq().*.maybeSingle() patterns, so we model just those.
type StubResult = { data: unknown; error: { message: string } | null };
type ChainBuilder = {
  select: () => ChainBuilder;
  insert: () => ChainBuilder;
  update: () => ChainBuilder;
  delete: () => ChainBuilder;
  eq: () => ChainBuilder;
  in: () => ChainBuilder;
  is: () => ChainBuilder;
  contains: () => ChainBuilder;
  maybeSingle: () => Promise<StubResult>;
  single: () => Promise<StubResult>;
  order: () => ChainBuilder;
  limit: () => ChainBuilder;
  then: Promise<StubResult>["then"];
};

function chain(result: StubResult): ChainBuilder {
  const promiseLike = Promise.resolve(result);
  const builder: ChainBuilder = {
    select: () => builder,
    insert: () => builder,
    update: () => builder,
    delete: () => builder,
    eq: () => builder,
    in: () => builder,
    is: () => builder,
    contains: () => builder,
    maybeSingle: () => promiseLike,
    single: () => promiseLike,
    order: () => builder,
    limit: () => builder,
    then: promiseLike.then.bind(promiseLike),
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

type ToolMap = ReturnType<typeof buildHarwickChatTools>;

function buildToolsForRole(role: WorkspaceRole, stubs: Record<string, StubResult> = {}): ToolMap {
  // The tools we test (create_channel, post_channel_message) call inserts into
  // harwick_channels, harwick_channel_members, harwick_channel_messages, and a
  // select on harwick_channel_members for membership confirmation.
  const supabase = makeStubSupabase({
    harwick_channels: { data: { id: "chan-1", name: "oak-ave-deal", kind: "channel", description: null, created_at: "2026-05-14T00:00:00Z" }, error: null },
    harwick_channel_members: { data: { channel_id: "chan-1" }, error: null },
    harwick_channel_messages: { data: { id: "msg-1", created_at: "2026-05-14T00:00:01Z" }, error: null },
    ...stubs,
  });
  return buildHarwickChatTools({
    supabase,
    workspaceId: "00000000-0000-0000-0000-000000000001",
    workspaceName: "Test",
    operatorMemberId: "00000000-0000-0000-0000-000000000002",
    operatorName: "Test Operator",
    operatorRole: role,
  });
}

type ExecutableTool = {
  execute?: (input: unknown, opts: unknown) => unknown;
};

async function callTool(tool: ExecutableTool, input: unknown): Promise<unknown> {
  if (tool.execute === undefined) throw new Error("tool has no execute");
  return await tool.execute(input, {});
}

describe("create_channel tool — role gating", () => {
  it("blocks the viewer role", async () => {
    const tools = buildToolsForRole("viewer");
    const result = (await callTool(tools.create_channel as ExecutableTool, {
      name: "oak-ave-deal",
      kind: "channel",
      memberIds: [],
    })) as { created: boolean; error?: string };
    expect(result.created).toBe(false);
    expect(result.error).toMatch(/read-only/i);
  });

  it("allows agent role to create a channel", async () => {
    const tools = buildToolsForRole("agent");
    const result = (await callTool(tools.create_channel as ExecutableTool, {
      name: "oak-ave-deal",
      kind: "channel",
      memberIds: [],
    })) as { created: boolean; channelId?: string };
    expect(result.created).toBe(true);
    expect(result.channelId).toBe("chan-1");
  });

  it("allows owner role to create with a kickoff message", async () => {
    const tools = buildToolsForRole("owner");
    const result = (await callTool(tools.create_channel as ExecutableTool, {
      name: "team-pulse",
      kind: "channel",
      memberIds: [],
      kickoffMessage: "Welcome team",
    })) as { created: boolean; kickoffMessageId?: string | null };
    expect(result.created).toBe(true);
    expect(result.kickoffMessageId).toBe("msg-1");
  });

  it("rejects empty channel names", async () => {
    const tools = buildToolsForRole("owner");
    const result = (await callTool(tools.create_channel as ExecutableTool, {
      name: " ",
      kind: "channel",
      memberIds: [],
    })) as { created: boolean; error?: string };
    expect(result.created).toBe(false);
    expect(result.error).toMatch(/Could not create channel/i);
  });
});

describe("post_channel_message tool — role + membership", () => {
  it("blocks the viewer role", async () => {
    const tools = buildToolsForRole("viewer");
    const result = (await callTool(tools.post_channel_message as ExecutableTool, {
      channelId: "00000000-0000-0000-0000-000000000010",
      body: "test",
    })) as { posted: boolean; error?: string };
    expect(result.posted).toBe(false);
    expect(result.error).toMatch(/read-only/i);
  });

  it("blocks an operator who is not a member of the target channel", async () => {
    const tools = buildToolsForRole("agent", {
      // Stub a non-member: maybeSingle returns null data.
      harwick_channel_members: { data: null, error: null },
    });
    const result = (await callTool(tools.post_channel_message as ExecutableTool, {
      channelId: "00000000-0000-0000-0000-000000000010",
      body: "test",
    })) as { posted: boolean; error?: string };
    expect(result.posted).toBe(false);
    expect(result.error).toMatch(/not a member/i);
  });

  it("posts when the operator is a member", async () => {
    const tools = buildToolsForRole("agent");
    const result = (await callTool(tools.post_channel_message as ExecutableTool, {
      channelId: "00000000-0000-0000-0000-000000000010",
      body: "shipping update",
    })) as { posted: boolean; messageId?: string };
    expect(result.posted).toBe(true);
    expect(result.messageId).toBe("msg-1");
  });
});
