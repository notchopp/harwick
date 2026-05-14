import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMetaMessagingClient, createTwilioMessagingClient, executeHarwickAiToolCalls } from "@realty-ops/integrations";
import { createSupabaseWorkflowJobServices } from "./repository.js";
import { decryptCredential } from "./credentials.js";

vi.mock("@realty-ops/integrations", async () => {
  const actual = await vi.importActual<typeof import("@realty-ops/integrations")>("@realty-ops/integrations");
  return {
    ...actual,
    createMetaMessagingClient: vi.fn(),
    createTwilioMessagingClient: vi.fn(),
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
  conversation_messages: TableRow[];
  leads: TableRow[];
  nurture_enrollments: TableRow[];
  nurture_messages: TableRow[];
  workspace_subscriptions: TableRow[];
  workspace_usage_events: TableRow[];
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

  in(field: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[field]));
    return this;
  }

  is(field: string, value: unknown) {
    this.filters.push((row) => row[field] === value);
    return this;
  }

  not(field: string, operator: string, value: unknown) {
    if (operator === "is" && value === null) {
      this.filters.push((row) => row[field] !== null && row[field] !== undefined);
    }
    return this;
  }

  contains(field: string, values: unknown[]) {
    this.filters.push((row) => Array.isArray(row[field]) && values.every((value) => (row[field] as unknown[]).includes(value)));
    return this;
  }

  limit(count: number) {
    void count;
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
    conversation_messages: [],
    leads: [],
    nurture_enrollments: [],
    nurture_messages: [],
    workspace_subscriptions: [],
    workspace_usage_events: [],
    ...overrides,
  };
}

describe("createSupabaseWorkflowJobServices.processHarwickAiReply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createMetaMessagingClient).mockReturnValue({} as never);
    vi.mocked(createTwilioMessagingClient).mockReturnValue({} as never);
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
    const sendDirectMessage = vi.fn().mockResolvedValue({ providerEventId: "meta-event-1" });
    vi.mocked(createMetaMessagingClient).mockReturnValue({
      sendDirectMessage,
      replyToComment: vi.fn(),
    });
    vi.mocked(executeHarwickAiToolCalls).mockImplementation(async (params) => {
      const handler = params.handlers.send_meta_dm;
      if (handler === undefined) {
        throw new Error("expected send_meta_dm handler");
      }

      return [{
        tool: "send_meta_dm",
        status: "executed",
        reason: "continue qualification",
        output: await handler({
          tool: "send_meta_dm",
          reason: "continue qualification",
          requiresApproval: false,
          payload: {
            reply: "Yes, I can send details.",
          },
        }),
      }];
    });
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
    expect(sendDirectMessage).toHaveBeenCalledWith({
      pageId: "page-1",
      recipientUserId: "ig-user-1",
      accessToken: "meta-token",
      reply: "Yes, I can send details.",
    });
    expect(tables["lead_events"][0]).toMatchObject({
      workspace_id: workspaceId,
      lead_id: leadId,
      event_type: "reply_sent",
      provider_event_id: "meta-event-1",
      text: "Yes, I can send details.",
    });
    expect(tables["conversation_messages"][0]).toMatchObject({
      workspace_id: workspaceId,
      lead_id: leadId,
      sender_type: "ai",
      sender_id: "harwick_ai",
      body: "Yes, I can send details.",
      provider_message_id: "meta-event-1",
      status: "sent",
      agent_trajectory_id: null,
      agent_step_id: null,
    });
  });

  it("supports comment to DM handoffs through the unified Meta messaging tool", async () => {
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
    const sendDirectMessage = vi.fn().mockResolvedValue({ providerEventId: "meta-dm-handoff-1" });
    vi.mocked(createMetaMessagingClient).mockReturnValue({
      sendDirectMessage,
      replyToComment: vi.fn(),
    });
    vi.mocked(executeHarwickAiToolCalls).mockImplementation(async (params) => {
      const handler = params.handlers.send_meta_message;
      if (handler === undefined) {
        throw new Error("expected send_meta_message handler");
      }

      return [{
        tool: "send_meta_message",
        status: "executed",
        reason: "move the lead into DM after the public acknowledgement",
        output: await handler({
          tool: "send_meta_message",
          reason: "move the lead into DM after the public acknowledgement",
          requiresApproval: false,
          payload: {
            reply: "I just sent you the details in DM.",
            target: "dm",
          },
        }),
      }];
    });

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
      channel: "instagram_comment",
      recipientUserId: "ig-user-1",
      sourceCommentId: "comment-1",
      sourcePostId: "post-1",
    })).resolves.toEqual({
      status: "completed",
      message: "executed 1 Harwick AI tool call(s)",
    });

    expect(sendDirectMessage).toHaveBeenCalledWith({
      pageId: "page-1",
      recipientUserId: "ig-user-1",
      accessToken: "meta-token",
      reply: "I just sent you the details in DM.",
    });
    expect(tables["lead_events"][0]).toMatchObject({
      workspace_id: workspaceId,
      lead_id: leadId,
      source_channel: "instagram_dm",
      source_comment_id: "comment-1",
      source_post_id: "post-1",
      provider_event_id: "meta-dm-handoff-1",
      text: "I just sent you the details in DM.",
    });
    expect(tables["conversation_messages"][0]).toMatchObject({
      workspace_id: workspaceId,
      lead_id: leadId,
      source_channel: "instagram_dm",
      provider_message_id: "meta-dm-handoff-1",
      body: "I just sent you the details in DM.",
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

describe("createSupabaseWorkflowJobServices.processNurtureDelivery", () => {
  const enrollmentId = "123e4567-e89b-12d3-a456-426614174005";
  const messageId = "123e4567-e89b-12d3-a456-426614174006";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createMetaMessagingClient).mockReturnValue({} as never);
    vi.mocked(createTwilioMessagingClient).mockReturnValue({} as never);
  });

  function createNurtureTables(overrides: Partial<MockTables> = {}): MockTables {
    return createTables({
      leads: [{
        id: leadId,
        workspace_id: workspaceId,
        full_name: "Sarah Buyer",
        phone: "+15550002222",
        instagram_user_id: "ig-user-1",
        source_channel: "sms",
      }],
      nurture_enrollments: [{
        id: enrollmentId,
        workspace_id: workspaceId,
        lead_id: leadId,
        status: "active",
        sequence_key: "default_realtor_nurture_v1",
        next_action_at: "2026-05-06T15:00:00.000Z",
        quiet_hours_timezone: "America/Chicago",
        last_step_index: 1,
        opted_out_at: null,
        opt_out_reason: null,
      }],
      nurture_messages: [{
        id: messageId,
        workspace_id: workspaceId,
        lead_id: leadId,
        enrollment_id: enrollmentId,
        channel: "sms",
        status: "queued",
        step_index: 0,
        body: "Quick reminder about the open house.",
        block_reason: null,
        provider_message_id: null,
        scheduled_for: null,
        sent_at: null,
        last_error_code: null,
        last_error_message: null,
        created_at: "2026-05-06T14:00:00.000Z",
        updated_at: "2026-05-06T14:00:00.000Z",
      }],
      workspace_subscriptions: [{
        workspace_id: workspaceId,
        status: "active",
        current_period_start: "2026-05-01T00:00:00.000Z",
        current_period_end: "2026-06-01T00:00:00.000Z",
      }],
      ...overrides,
    });
  }

  it("sends approved SMS nurture messages through Twilio and mirrors the transcript", async () => {
    const sendSms = vi.fn().mockResolvedValue({ providerEventId: "SM123" });
    vi.mocked(createTwilioMessagingClient).mockReturnValue({ sendSms });
    const tables = createNurtureTables();
    const services = createSupabaseWorkflowJobServices(
      createMockSupabase(tables) as never,
      {
        twilio: {
          accountSid: "AC123",
          authToken: "twilio-token",
          fromPhoneNumber: "+15550001111",
        },
      },
    );

    await expect(services.processNurtureDelivery?.({
      workspaceId,
      leadId,
      enrollmentId,
      messageId,
    })).resolves.toBe("approved nurture sms message sent");

    expect(sendSms).toHaveBeenCalledWith({
      accountSid: "AC123",
      authToken: "twilio-token",
      from: "+15550001111",
      to: "+15550002222",
      body: "Quick reminder about the open house.",
    });
    expect(tables["nurture_messages"][0]).toMatchObject({
      status: "sent",
      provider_message_id: "SM123",
      last_error_code: null,
      last_error_message: null,
    });
    expect(tables["lead_events"][0]).toMatchObject({
      provider: "twilio",
      event_type: "sms_sent",
      source_channel: "sms",
      provider_event_id: "SM123",
      text: "Quick reminder about the open house.",
    });
    expect(tables["conversation_messages"][0]).toMatchObject({
      sender_type: "ai",
      sender_id: "harwick_ai",
      body: "Quick reminder about the open house.",
      source_channel: "sms",
      provider_message_id: "SM123",
    });
    expect(tables["workspace_usage_events"][0]).toMatchObject({
      event_type: "ai_message_sent",
      resource_id: messageId,
      event_metadata: {
        kind: "nurture_message",
        leadId,
        channel: "sms",
      },
    });
  });

  it("marks approved SMS nurture messages failed when Twilio is not configured", async () => {
    const tables = createNurtureTables();
    const services = createSupabaseWorkflowJobServices(createMockSupabase(tables) as never);

    await expect(services.processNurtureDelivery?.({
      workspaceId,
      leadId,
      enrollmentId,
      messageId,
    })).rejects.toThrow("Twilio SMS credentials are not configured");

    expect(tables["nurture_messages"][0]).toMatchObject({
      status: "failed",
      last_error_code: "provider_not_configured",
      last_error_message: "Twilio SMS credentials are not configured in the worker.",
    });
    expect(tables["lead_events"]).toHaveLength(0);
    expect(tables["conversation_messages"]).toHaveLength(0);
  });
});
