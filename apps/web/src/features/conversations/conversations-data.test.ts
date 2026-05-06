import { describe, expect, it, vi } from "vitest";
import type { ConversationsInboxRepository } from "./conversations-data";
import { loadConversationsInbox } from "./conversations-data";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const leadId = "22222222-2222-4222-8222-222222222222";
const memberId = "33333333-3333-4333-8333-333333333333";
const reviewId = "44444444-4444-4444-8444-444444444444";

function buildRepository(overrides: Partial<ConversationsInboxRepository> = {}): ConversationsInboxRepository {
  return {
    listLeads: vi.fn().mockResolvedValue([{
      id: leadId,
      workspace_id: workspaceId,
      status: "hot",
      source_channel: "instagram_dm",
      source_provider_id: "user-1",
      source_post_id: null,
      source_comment_id: null,
      instagram_user_id: "user-1",
      instagram_username: "marcus_t",
      full_name: "Marcus Thompson",
      phone: null,
      email: null,
      lead_type: "buyer",
      intent: "high",
      timeline: "30-60 days",
      budget_min: 800000,
      budget_max: 900000,
      target_area: "Coral Gables",
      financing_status: "preapproved",
      score: 87,
      assigned_agent_id: memberId,
      follow_up_boss_contact_id: "fub-1",
      last_message_at: "2026-04-30T12:14:00.000Z",
      next_followup_at: null,
      created_at: "2026-04-30T12:10:00.000Z",
      updated_at: "2026-04-30T12:14:00.000Z",
    }]),
    listWorkspaceMembers: vi.fn().mockResolvedValue([{
      id: memberId,
      display_name: "Sarah Kim",
    }]),
    listLeadEvents: vi.fn().mockResolvedValue([
      {
        id: "event-1",
        workspace_id: workspaceId,
        lead_id: leadId,
        provider: "meta",
        event_type: "message_received",
        source_channel: "instagram_dm",
        provider_event_id: "mid-1",
        provider_account_id: "ig-1",
        provider_user_id: "user-1",
        source_post_id: null,
        source_comment_id: null,
        text: "Is this still available?",
        occurred_at: "2026-04-30T12:14:00.000Z",
        created_at: "2026-04-30T12:14:00.000Z",
      },
      {
        id: "event-2",
        workspace_id: workspaceId,
        lead_id: leadId,
        provider: "meta",
        event_type: "reply_sent",
        source_channel: "instagram_dm",
        provider_event_id: "mid-2",
        provider_account_id: "ig-1",
        provider_user_id: "user-1",
        source_post_id: null,
        source_comment_id: null,
        text: "Yes, still available.",
        occurred_at: "2026-04-30T12:16:00.000Z",
        created_at: "2026-04-30T12:16:00.000Z",
      },
    ]),
    listConversationMessages: vi.fn().mockResolvedValue([]),
    listSocialReplyReviews: vi.fn().mockResolvedValue([{
      id: reviewId,
      workspace_id: workspaceId,
      lead_id: leadId,
      lead_event_id: "event-1",
      provider_account_id: "ig-1",
      recipient_user_id: "user-1",
      channel: "instagram_dm",
      source_post_id: null,
      source_comment_id: null,
      inbound_text: "Is this still available?",
      suggested_reply: "Happy to send details and a showing window.",
      status: "pending",
      automation_mode: "ai_on",
      automation_reason: "safe qualification follow-up",
      automation_changed_by_member_id: null,
      automation_changed_at: null,
      ai_decision: null,
      reviewed_by_member_id: null,
      reviewed_at: null,
      provider_event_id: null,
      dismissal_reason: null,
      last_error_code: null,
      last_error_message: null,
      created_at: "2026-04-30T12:15:00.000Z",
      updated_at: "2026-04-30T12:15:00.000Z",
    }]),
    listConversationAutomationStates: vi.fn().mockResolvedValue([{
      leadId: leadId,
      automationMode: "ai_on",
    }]),
    listLatestAiSynthesis: vi.fn().mockResolvedValue([{
      leadId,
      turnId: "55555555-5555-4555-8555-555555555555",
      status: "auto_executed",
      intent: "listing_question",
      nextAction: "ask_qualification",
      confidence: 0.91,
      missingFields: ["timeline"],
      safetyFlags: ["safe_to_send"],
      handoffBrief: null,
      documentUpdate: "Lead asked whether the listing is still available.",
      updatedAt: "2026-04-30T12:15:00.000Z",
    }]),
    listInFlightAiSynthesis: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe("conversation inbox data", () => {
  it("builds typed threads from live leads, events, and reply reviews", async () => {
    const inbox = await loadConversationsInbox({
      workspaceId,
      repository: buildRepository(),
    });

    expect(inbox.threads).toHaveLength(1);
    expect(inbox.threads[0]).toMatchObject({
      name: "Marcus Thompson",
      assignedTo: "Sarah Kim",
      listingStatus: "AI action ready",
      automationMode: "ai_on",
    });
    expect(inbox.threads[0]?.aiSynthesis).toMatchObject({
      intent: "listing_question",
      missingFields: ["timeline"],
    });
    expect(inbox.threads[0]?.messages.map((message) => message.kind)).toEqual([
      "lead",
      "ai_action",
      "sent",
    ]);
  });

  it("loads canonical transcript rows from conversation_messages and skips mirrored lead event duplicates", async () => {
    const inbox = await loadConversationsInbox({
      workspaceId,
      repository: buildRepository({
        listConversationMessages: vi.fn().mockResolvedValue([
          {
            id: "message-1",
            lead_id: leadId,
            workspace_id: workspaceId,
            sender_type: "customer",
            sender_id: null,
            body: "Is this still available?",
            created_at: "2026-04-30T12:14:00.000Z",
            updated_at: "2026-04-30T12:14:00.000Z",
            status: "sent",
            source_channel: "instagram_dm",
            provider_message_id: "mid-1",
            error_code: null,
            error_message: null,
            agent_trajectory_id: null,
            agent_step_id: null,
          },
          {
            id: "message-2",
            lead_id: leadId,
            workspace_id: workspaceId,
            sender_type: "ai",
            sender_id: null,
            body: "Yes, still available.",
            created_at: "2026-04-30T12:16:00.000Z",
            updated_at: "2026-04-30T12:16:00.000Z",
            status: "sent",
            source_channel: "instagram_dm",
            provider_message_id: "mid-2",
            error_code: null,
            error_message: null,
            agent_trajectory_id: "55555555-5555-4555-8555-555555555555",
            agent_step_id: "66666666-6666-4666-8666-666666666666",
          },
          {
            id: "message-3",
            lead_id: leadId,
            workspace_id: workspaceId,
            sender_type: "operator",
            sender_id: memberId,
            body: "Noah can follow up with you today.",
            created_at: "2026-04-30T12:17:00.000Z",
            updated_at: "2026-04-30T12:17:00.000Z",
            status: "sent",
            source_channel: "instagram_dm",
            provider_message_id: null,
            error_code: null,
            error_message: null,
            agent_trajectory_id: null,
            agent_step_id: null,
          },
        ]),
        listLeadEvents: vi.fn().mockResolvedValue([
          {
            id: "event-1",
            workspace_id: workspaceId,
            lead_id: leadId,
            provider: "meta",
            event_type: "message_received",
            source_channel: "instagram_dm",
            provider_event_id: "mid-1",
            provider_account_id: "ig-1",
            provider_user_id: "user-1",
            source_post_id: null,
            source_comment_id: null,
            text: "Is this still available?",
            occurred_at: "2026-04-30T12:14:00.000Z",
            created_at: "2026-04-30T12:14:00.000Z",
          },
          {
            id: "event-2",
            workspace_id: workspaceId,
            lead_id: leadId,
            provider: "meta",
            event_type: "reply_sent",
            source_channel: "instagram_dm",
            provider_event_id: "mid-2",
            provider_account_id: "ig-1",
            provider_user_id: "user-1",
            source_post_id: null,
            source_comment_id: null,
            text: "Yes, still available.",
            occurred_at: "2026-04-30T12:16:00.000Z",
            created_at: "2026-04-30T12:16:00.000Z",
          },
          {
            id: "event-3",
            workspace_id: workspaceId,
            lead_id: leadId,
            provider: "system",
            event_type: "qualification_updated",
            source_channel: "instagram_dm",
            provider_event_id: "qualification-1",
            provider_account_id: null,
            provider_user_id: null,
            source_post_id: null,
            source_comment_id: null,
            text: null,
            occurred_at: "2026-04-30T12:18:00.000Z",
            created_at: "2026-04-30T12:18:00.000Z",
          },
        ]),
        listSocialReplyReviews: vi.fn().mockResolvedValue([]),
      }),
    });

    const messages = inbox.threads[0]?.messages ?? [];
    expect(messages.map((message) => message.kind)).toEqual(["lead", "sent", "sent", "system"]);
    expect(messages.map((message) => message.body)).toEqual([
      "Is this still available?",
      "Yes, still available.",
      "Noah can follow up with you today.",
      "Qualification Updated",
    ]);
    expect(messages[0]?.meta).toContain("Instagram DM");
    expect(messages[1]?.meta).toContain("Harwick AI");
    expect(messages[1]?.agentTrajectoryId).toBe("55555555-5555-4555-8555-555555555555");
    expect(messages[1]?.agentStepId).toBe("66666666-6666-4666-8666-666666666666");
    expect(messages[2]?.meta).toContain("Operator");
    expect(messages[3]?.meta).toContain("Instagram DM");
    expect(inbox.threads[0]?.preview).toBe("Noah can follow up with you today.");
  });

  it("uses newer in-flight Harwick synthesis while tool work is active", async () => {
    const inbox = await loadConversationsInbox({
      workspaceId,
      repository: buildRepository({
        listInFlightAiSynthesis: vi.fn().mockResolvedValue([{
          leadId,
          turnId: "66666666-6666-4666-8666-666666666666",
          status: "subagent_running",
          intent: "routing_subagent",
          nextAction: "Review agent fit",
          confidence: 0.65,
          missingFields: [],
          safetyFlags: ["in_flight", "subagent_task"],
          handoffBrief: "Harwick is checking routing context.",
          documentUpdate: null,
          updatedAt: "2026-04-30T12:17:00.000Z",
        }]),
      }),
    });

    expect(inbox.threads[0]?.aiSynthesis).toMatchObject({
      turnId: "66666666-6666-4666-8666-666666666666",
      status: "subagent_running",
      nextAction: "Review agent fit",
      safetyFlags: ["in_flight", "subagent_task"],
    });
  });

  it("creates a system placeholder when no event text exists yet", async () => {
    const inbox = await loadConversationsInbox({
      workspaceId,
      repository: buildRepository({
        listLeadEvents: vi.fn().mockResolvedValue([]),
        listSocialReplyReviews: vi.fn().mockResolvedValue([]),
      }),
    });

    expect(inbox.threads[0]?.messages[0]).toMatchObject({
      kind: "system",
      body: "No conversation text has been captured for this lead yet.",
    });
  });

  it("keeps low-signal comments out of the live inbox", async () => {
    const inbox = await loadConversationsInbox({
      workspaceId,
      repository: buildRepository({
        listLeads: vi.fn().mockResolvedValue([
          {
            id: leadId,
            workspace_id: workspaceId,
            status: "new",
            source_channel: "instagram_comment",
            source_provider_id: "user-1",
            source_post_id: "post-1",
            source_comment_id: "comment-1",
            instagram_user_id: "user-1",
            instagram_username: "marcus_t",
            full_name: "Marcus Thompson",
            phone: null,
            email: null,
            lead_type: "unknown",
            intent: "unknown",
            timeline: null,
            budget_min: null,
            budget_max: null,
            target_area: null,
            financing_status: "unknown",
            score: 0,
            assigned_agent_id: null,
            follow_up_boss_contact_id: null,
            last_message_at: "2026-04-30T12:14:00.000Z",
            next_followup_at: null,
            created_at: "2026-04-30T12:10:00.000Z",
            updated_at: "2026-04-30T12:14:00.000Z",
          },
        ]),
        listLeadEvents: vi.fn().mockResolvedValue([
          {
            id: "event-1",
            workspace_id: workspaceId,
            lead_id: leadId,
            provider: "meta",
            event_type: "comment_received",
            source_channel: "instagram_comment",
            provider_event_id: "mid-1",
            provider_account_id: "ig-1",
            provider_user_id: "user-1",
            source_post_id: "post-1",
            source_comment_id: "comment-1",
            text: "price?",
            occurred_at: "2026-04-30T12:14:00.000Z",
            created_at: "2026-04-30T12:14:00.000Z",
          },
        ]),
        listSocialReplyReviews: vi.fn().mockResolvedValue([]),
      }),
    });

    expect(inbox.threads).toHaveLength(0);
  });
});
