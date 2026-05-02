import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMetaMessagingClient, executeHarwickAiToolCalls } from "@realty-ops/integrations";
import { createSupabaseWorkflowJobServices } from "./repository.js";
import { decryptCredential } from "./credentials.js";

vi.mock("@realty-ops/integrations", async () => {
  const actual = await vi.importActual<typeof import("@realty-ops/integrations")>("@realty-ops/integrations");
  return {
    ...actual,
    createMetaMessagingClient: vi.fn(),
    executeHarwickAiToolCalls: vi.fn(),
  };
});

vi.mock("./credentials.js", () => ({
  decryptCredential: vi.fn(),
}));

type TableRow = Record<string, unknown>;

type MockTables = {
  harwick_ai_turns: TableRow[];
  harwick_ai_tool_calls: TableRow[];
  conversation_automation_states: TableRow[];
  integration_accounts: TableRow[];
  social_reply_reviews: TableRow[];
  lead_events: TableRow[];
};

class MockQueryBuilder implements PromiseLike<{ data: unknown; error: null }> {
  private mode: "select" | "update" = "select";
  private updateValue: Record<string, unknown> | null = null;
  private filters: Array<(row: TableRow) => boolean> = [];
  private orderField: string | null = null;
  private ascending = true;

  constructor(
    private readonly tables: MockTables,
    private readonly tableName: string,
  ) {}

  select(columns: string) {
    void columns;
    this.mode = "select";
    return this;
  }

  update(value: Record<string, unknown>) {
    this.mode = "update";
    this.updateValue = value;
    return this;
  }

  insert(value: TableRow | TableRow[]) {
    const rows = Array.isArray(value) ? value : [value];
    const table = this.tables[this.tableName as keyof MockTables];
    if (table === undefined) {
      throw new Error(`Unknown mock table: ${this.tableName}`);
    }
    table.push(...rows.map((row) => structuredClone(row)));
    return Promise.resolve({ data: null, error: null });
  }

  eq(field: string, value: unknown) {
    this.filters.push((row) => row[field] === value);
    return this;
  }

  is(field: string, value: unknown) {
    this.filters.push((row) => row[field] === value);
    return this;
  }

  contains(field: string, values: unknown[]) {
    this.filters.push((row) => Array.isArray(row[field]) && values.every((value) => (row[field] as unknown[]).includes(value)));
    return this;
  }

  order(field: string, options: { ascending: boolean }) {
    this.orderField = field;
    this.ascending = options.ascending;
    return this;
  }

  maybeSingle() {
    const rows = this.matchRows();
    return Promise.resolve({
      data: rows[0] ?? null,
      error: null,
    });
  }

  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled ?? undefined, onrejected ?? undefined);
  }

  private execute() {
    if (this.mode === "select") {
      let rows = this.matchRows();
      const orderField = this.orderField;
      if (orderField !== null) {
        rows = [...rows].sort((left, right) => {
          const leftValue = left[orderField];
          const rightValue = right[orderField];
          if (leftValue === rightValue) return 0;
          if (leftValue === undefined || leftValue === null) return this.ascending ? -1 : 1;
          if (rightValue === undefined || rightValue === null) return this.ascending ? 1 : -1;
          const leftText = typeof leftValue === "string" ? leftValue : JSON.stringify(leftValue);
          const rightText = typeof rightValue === "string" ? rightValue : JSON.stringify(rightValue);
          return leftText.localeCompare(rightText) * (this.ascending ? 1 : -1);
        });
      }

      return Promise.resolve({
        data: rows,
        error: null,
      });
    }

    const rows = this.matchRows();
    for (const row of rows) {
      Object.assign(row, this.updateValue);
    }

    return Promise.resolve({
      data: null,
      error: null,
    });
  }

  private matchRows() {
    const table = this.tables[this.tableName as keyof MockTables] ?? [];
    return table.filter((row) => this.filters.every((filter) => filter(row)));
  }
}

function createMockSupabase(tables: MockTables) {
  return {
    from(tableName: string) {
      return new MockQueryBuilder(tables, tableName);
    },
  };
}

const workspaceId = "123e4567-e89b-12d3-a456-426614174000";
const leadId = "123e4567-e89b-12d3-a456-426614174001";
const turnId = "123e4567-e89b-12d3-a456-426614174002";
const reviewId = "123e4567-e89b-12d3-a456-426614174003";

function createTables(overrides: Partial<MockTables> = {}): MockTables {
  return {
    harwick_ai_turns: [{
      id: turnId,
      workspace_id: workspaceId,
      lead_id: leadId,
      turn: {
        intent: "listing_question",
        nextAction: "ask_qualification",
        missingFields: [],
        confidence: 0.93,
        safetyFlags: [],
        reply: "Yes, I can send details.",
        statePatch: {},
        handoffBrief: null,
        toolCalls: [],
      },
      automation_decision: {
        canAutoExecute: true,
        approvedTools: ["send_meta_dm"],
        blockedTools: [],
        reason: "policy allows this turn to auto-send.",
      },
      automation_policy: {},
      status: "drafted",
      reply: "Yes, I can send details.",
    }],
    harwick_ai_tool_calls: [{
      id: "123e4567-e89b-12d3-a456-426614174004",
      workspace_id: workspaceId,
      turn_id: turnId,
      lead_id: leadId,
      tool: "send_meta_dm",
      requires_approval: false,
      reason: "continue qualification",
      payload: {
        reply: "Yes, I can send details.",
      },
      policy_status: "approved",
      execution_status: "pending",
      execution_output: {},
      error_code: null,
      error_message: null,
      executed_at: null,
      created_at: "2026-05-01T12:00:00.000Z",
    }],
    conversation_automation_states: [],
    integration_accounts: [],
    social_reply_reviews: [{
      id: reviewId,
      workspace_id: workspaceId,
      status: "pending",
      suggested_reply: null,
      provider_event_id: null,
      last_error_code: null,
      last_error_message: null,
      updated_at: "2026-05-01T12:00:00.000Z",
    }],
    lead_events: [],
    ...overrides,
  };
}

describe("createSupabaseWorkflowJobServices.processHarwickAiReply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createMetaMessagingClient).mockReturnValue({} as never);
    vi.mocked(executeHarwickAiToolCalls).mockResolvedValue([]);
    vi.mocked(decryptCredential).mockReturnValue({
      userAccessToken: "user-token-1",
      pageId: "page-1",
      pageAccessToken: "meta-token",
      instagramBusinessAccountId: "ig-business-1",
    });
  });

  it("blocks pending tool calls when the conversation is in human takeover", async () => {
    const tables = createTables({
      conversation_automation_states: [{
        workspace_id: workspaceId,
        lead_id: leadId,
        provider_account_id: "ig-business-1",
        recipient_user_id: "ig-user-1",
        channel: "instagram_dm",
        automation_mode: "human_takeover",
      }],
    });
    const services = createSupabaseWorkflowJobServices(
      createMockSupabase(tables) as never,
    );

    await expect(services.processHarwickAiReply?.({
      workspaceId,
      leadId,
      turnId,
      socialReplyReviewId: reviewId,
      providerAccountId: "ig-business-1",
      channel: "instagram_dm",
      recipientUserId: "ig-user-1",
      sourceCommentId: null,
      sourcePostId: "post-1",
    })).resolves.toEqual({
      status: "skipped",
      message: "Harwick AI reply skipped because the conversation is paused or in human takeover",
    });

    expect(tables["harwick_ai_turns"][0]?.["status"]).toBe("blocked");
    expect(tables["harwick_ai_tool_calls"][0]).toMatchObject({
      execution_status: "blocked",
      error_code: "automation_paused",
    });
    expect(executeHarwickAiToolCalls).not.toHaveBeenCalled();
  });

  it("marks the turn and review failed when Meta credentials are not connected", async () => {
    const tables = createTables();
    const services = createSupabaseWorkflowJobServices(
      createMockSupabase(tables) as never,
      { credentialSecret: "worker-secret" },
    );

    await expect(services.processHarwickAiReply?.({
      workspaceId,
      leadId,
      turnId,
      socialReplyReviewId: reviewId,
      providerAccountId: "ig-business-1",
      channel: "instagram_dm",
      recipientUserId: "ig-user-1",
      sourceCommentId: null,
      sourcePostId: "post-1",
    })).resolves.toEqual({
      status: "skipped",
      message: "Meta credentials are not connected for this provider account.",
    });

    expect(tables["harwick_ai_turns"][0]?.["status"]).toBe("failed");
    expect(tables["harwick_ai_tool_calls"][0]).toMatchObject({
      execution_status: "failed",
      error_code: "integration_not_found",
    });
    expect(tables["social_reply_reviews"][0]).toMatchObject({
      status: "failed",
      last_error_code: "integration_not_found",
    });
  });

  it("marks turns auto executed and reviews sent when approved tool calls succeed", async () => {
    const tables = createTables({
      integration_accounts: [{
        workspace_id: workspaceId,
        provider: "meta",
        status: "connected",
        provider_account_id: "ig-business-1",
        provider_account_ids: [],
        encrypted_credential_ref: "encrypted-meta-credential",
      }],
    });
    vi.mocked(executeHarwickAiToolCalls).mockResolvedValue([{
      tool: "send_meta_dm",
      status: "executed",
      reason: "continue qualification",
      output: { providerEventId: "meta-event-1" },
    }]);
    const services = createSupabaseWorkflowJobServices(
      createMockSupabase(tables) as never,
      { credentialSecret: "worker-secret" },
    );

    await expect(services.processHarwickAiReply?.({
      workspaceId,
      leadId,
      turnId,
      socialReplyReviewId: reviewId,
      providerAccountId: "ig-business-1",
      channel: "instagram_dm",
      recipientUserId: "ig-user-1",
      sourceCommentId: null,
      sourcePostId: "post-1",
    })).resolves.toEqual({
      status: "completed",
      message: "executed 1 Harwick AI tool call(s)",
    });

    expect(tables["harwick_ai_turns"][0]?.["status"]).toBe("auto_executed");
    expect(tables["harwick_ai_tool_calls"][0]).toMatchObject({
      execution_status: "executed",
      execution_output: { providerEventId: "meta-event-1" },
    });
    expect(tables["social_reply_reviews"][0]).toMatchObject({
      status: "sent",
      provider_event_id: "meta-event-1",
    });
  });

  it("persists review and turn failures when tool execution fails", async () => {
    const tables = createTables({
      integration_accounts: [{
        workspace_id: workspaceId,
        provider: "meta",
        status: "connected",
        provider_account_id: "ig-business-1",
        provider_account_ids: [],
        encrypted_credential_ref: "encrypted-meta-credential",
      }],
    });
    vi.mocked(executeHarwickAiToolCalls).mockResolvedValue([{
      tool: "send_meta_dm",
      status: "failed",
      reason: "continue qualification",
      output: {
        payload: { reply: "Yes, I can send details." },
      },
      errorCode: "meta_send_failed",
      errorMessage: "Meta rejected reply",
    }]);
    const services = createSupabaseWorkflowJobServices(
      createMockSupabase(tables) as never,
      { credentialSecret: "worker-secret" },
    );

    await expect(services.processHarwickAiReply?.({
      workspaceId,
      leadId,
      turnId,
      socialReplyReviewId: reviewId,
      providerAccountId: "ig-business-1",
      channel: "instagram_dm",
      recipientUserId: "ig-user-1",
      sourceCommentId: null,
      sourcePostId: "post-1",
    })).rejects.toThrow("Meta rejected reply");

    expect(tables["harwick_ai_turns"][0]?.["status"]).toBe("failed");
    expect(tables["harwick_ai_tool_calls"][0]).toMatchObject({
      execution_status: "failed",
      error_code: "meta_send_failed",
      error_message: "Meta rejected reply",
    });
    expect(tables["social_reply_reviews"][0]).toMatchObject({
      status: "failed",
      last_error_code: "meta_send_failed",
      last_error_message: "Meta rejected reply",
    });
  });
});
