import { describe, expect, it } from "vitest";
import type { ConversationMessageRepository, ConversationMessageSender } from "./conversation-message-send";
import { sendConversationMessage } from "./conversation-message-send";
import type { LeadRow } from "../../lib/supabase/leads";
import type { ConversationAutomationStateRow } from "../../lib/supabase/database.types";

const workspaceId = "123e4567-e89b-12d3-a456-426614174000";
const conversationId = "223e4567-e89b-12d3-a456-426614174000";
const leadId = "323e4567-e89b-12d3-a456-426614174000";

function buildMockLead(overrides?: Partial<LeadRow>): LeadRow {
  return {
    id: leadId,
    workspace_id: workspaceId,
    source_channel: "instagram_dm",
    source_provider_id: "provider_account_123",
    instagram_user_id: "provider_user_123",
    source_comment_id: null,
    source_post_id: null,
    status: "new",
    intent: "unknown",
    lead_type: "unknown",
    score: 50,
    full_name: null,
    phone: null,
    email: null,
    instagram_username: null,
    target_area: null,
    budget_min: null,
    budget_max: null,
    timeline: null,
    financing_status: "unknown",
    assigned_agent_id: null,
    next_followup_at: null,
    follow_up_boss_contact_id: null,
    last_message_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function buildMockRepository(overrides?: {
  lead?: LeadRow | null;
  automationState?: ConversationAutomationStateRow | null;
}): ConversationMessageRepository {
  return {
    findLeadByConversationId: async () => {
      return Promise.resolve(overrides?.lead ?? buildMockLead());
    },
    findAutomationState: async () => {
      return Promise.resolve(overrides?.automationState ?? null);
    },
    recordManualOutboundMessage: async ({ sourceChannel }) => {
      return Promise.resolve({
        status: 200,
        body: {
          status: "sent",
          providerEventId: "manual_event_123",
          occurredAt: new Date().toISOString(),
          channel: sourceChannel,
        },
      });
    },
  };
}

function buildMockSender(): ConversationMessageSender {
  return async () => {
    return Promise.resolve({
      status: 200,
      body: {
        status: "sent",
        providerEventId: "event_123",
        occurredAt: new Date().toISOString(),
        channel: "instagram_dm",
      },
    });
  };
}

describe("sendConversationMessage", () => {
  it("successfully sends message for valid request", async () => {
    const result = await sendConversationMessage({
      request: {
        conversationId,
        workspaceId,
        reply: "Hello!",
      },
      repository: buildMockRepository(),
      sendMetaReply: buildMockSender(),
    });

    expect(result.status).toBe(200);
    if (result.status === 200) {
      expect(result.body.status).toBe("sent");
    }
  });

  it("rejects invalid request", async () => {
    const result = await sendConversationMessage({
      request: {
        conversationId,
        workspaceId,
        reply: "",
      },
      repository: buildMockRepository(),
      sendMetaReply: buildMockSender(),
    });

    expect(result.status).toBe(400);
    if (result.status === 400) {
      expect(result.body.error).toBe("invalid_request");
    }
  });

  it("rejects when conversation not found", async () => {
    const result = await sendConversationMessage({
      request: {
        conversationId,
        workspaceId,
        reply: "Hello!",
      },
      repository: {
        findLeadByConversationId: async () => {
          return Promise.resolve(null);
        },
        findAutomationState: async () => {
          return Promise.resolve(null);
        },
        recordManualOutboundMessage: async () => {
          return Promise.resolve({
            status: 200,
            body: {
              status: "sent",
              providerEventId: "manual_event_123",
              occurredAt: new Date().toISOString(),
              channel: "manual",
            },
          });
        },
      },
      sendMetaReply: buildMockSender(),
    });

    expect(result.status).toBe(404);
    if (result.status === 404) {
      expect(result.body.error).toBe("conversation_not_found");
    }
  });

  it("rejects workspace mismatch", async () => {
    const differentWorkspaceId = "999e4567-e89b-12d3-a456-426614174999";
    const result = await sendConversationMessage({
      request: {
        conversationId,
        workspaceId: differentWorkspaceId,
        reply: "Hello!",
      },
      repository: {
        findLeadByConversationId: async () => {
          return Promise.resolve(buildMockLead({ workspace_id: workspaceId }));
        },
        findAutomationState: async () => {
          return Promise.resolve(null);
        },
        recordManualOutboundMessage: async () => {
          return Promise.resolve({
            status: 200,
            body: {
              status: "sent",
              providerEventId: "manual_event_123",
              occurredAt: new Date().toISOString(),
              channel: "manual",
            },
          });
        },
      },
      sendMetaReply: buildMockSender(),
    });

    expect(result.status).toBe(403);
    if (result.status === 403) {
      expect(result.body.error).toBe("forbidden");
    }
  });

  it("rejects when automation is paused", async () => {
    const automationState: ConversationAutomationStateRow = {
      id: "state_id",
      workspace_id: workspaceId,
      lead_id: leadId,
      provider_account_id: "provider_account_123",
      recipient_user_id: null,
      channel: "instagram_dm",
      automation_mode: "human_takeover",
      automation_reason: "Manual review required",
      changed_by_member_id: null,
      changed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const result = await sendConversationMessage({
      request: {
        conversationId,
        workspaceId,
        reply: "Hello!",
      },
      repository: buildMockRepository({ automationState }),
      sendMetaReply: buildMockSender(),
    });

    expect(result.status).toBe(403);
    if (result.status === 403) {
      expect(result.body.error).toBe("automation_paused");
    }
  });

  it("rejects unsupported channel", async () => {
    const result = await sendConversationMessage({
      request: {
        conversationId,
        workspaceId,
        reply: "Hello!",
      },
      repository: buildMockRepository({
        lead: buildMockLead({ source_channel: "call" }),
      }),
      sendMetaReply: buildMockSender(),
    });

    expect(result.status).toBe(400);
    if (result.status === 400) {
      expect(result.body.error).toBe("unsupported_channel");
    }
  });

  it("rejects when provider account is missing", async () => {
    const result = await sendConversationMessage({
      request: {
        conversationId,
        workspaceId,
        reply: "Hello!",
      },
      repository: buildMockRepository({
        lead: buildMockLead({ source_provider_id: null }),
      }),
      sendMetaReply: buildMockSender(),
    });

    expect(result.status).toBe(400);
    if (result.status === 400) {
      expect(result.body.error).toBe("missing_provider_account");
    }
  });

  it("handles comment reply correctly", async () => {
    const result = await sendConversationMessage({
      request: {
        conversationId,
        workspaceId,
        reply: "Thanks for your comment!",
      },
      repository: buildMockRepository({
        lead: buildMockLead({
          source_channel: "instagram_comment",
          source_comment_id: "comment_123",
          source_post_id: "post_456",
        }),
      }),
      sendMetaReply: buildMockSender(),
    });

    expect(result.status).toBe(200);
  });

  it("persists manual conversation replies without a provider send", async () => {
    const result = await sendConversationMessage({
      request: {
        conversationId,
        workspaceId,
        reply: "Following up locally.",
      },
      repository: buildMockRepository({
        lead: buildMockLead({
          source_channel: "manual",
          source_provider_id: null,
        }),
      }),
      sendMetaReply: buildMockSender(),
    });

    expect(result.status).toBe(200);
    if (result.status === 200) {
      expect(result.body.channel).toBe("manual");
    }
  });
});
