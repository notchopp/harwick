import { describe, expect, it, vi } from "vitest";
import type { ConversationAutomationRepository } from "../../lib/supabase/conversation-automation";
import type { ConversationAutomationStateRow } from "../../lib/supabase/database.types";
import type { LeadRow } from "../../lib/supabase/leads";
import { updateConversationAutomation } from "./conversation-automation-control";

const workspaceId = "123e4567-e89b-12d3-a456-426614174000";
const conversationId = "223e4567-e89b-12d3-a456-426614174000";
const memberId = "323e4567-e89b-12d3-a456-426614174000";

function buildLead(overrides?: Partial<LeadRow>): LeadRow {
  return {
    id: conversationId,
    workspace_id: workspaceId,
    status: "new",
    source_channel: "manual",
    source_provider_id: null,
    source_post_id: null,
    source_comment_id: null,
    instagram_user_id: null,
    instagram_username: null,
    full_name: null,
    phone: null,
    email: null,
    lead_type: "unknown",
    intent: "unknown",
    timeline: null,
    budget_min: null,
    budget_max: null,
    target_area: null,
    financing_status: "unknown",
    score: 50,
    assigned_agent_id: null,
    follow_up_boss_contact_id: null,
    last_message_at: null,
    next_followup_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function buildState(): ConversationAutomationStateRow {
  return {
    id: "423e4567-e89b-12d3-a456-426614174000",
    workspace_id: workspaceId,
    lead_id: conversationId,
    provider_account_id: "",
    recipient_user_id: null,
    channel: "instagram_dm",
    automation_mode: "human_takeover",
    automation_reason: "Manual follow-up",
    changed_by_member_id: memberId,
    changed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function buildRepository(overrides?: {
  lead?: LeadRow | null;
  state?: ConversationAutomationStateRow | null;
}): ConversationAutomationRepository {
  return {
    findLeadByConversationId: () =>
      Promise.resolve(overrides?.lead ?? buildLead()),
    findAutomationState: () =>
      Promise.resolve(overrides?.state ?? null),
    insertAutomationState: vi.fn(() => Promise.resolve(undefined)),
    updateAutomationState: vi.fn(() => Promise.resolve(undefined)),
  };
}

describe("updateConversationAutomation", () => {
  it("creates a new lead-scoped automation state", async () => {
    const repository = buildRepository();

    const result = await updateConversationAutomation({
      workspaceId,
      conversationId,
      memberId,
      request: {
        mode: "ai_on",
        reason: "Operator resumed Harwick AI",
      },
      repository,
      now: () => new Date("2026-05-02T20:00:00.000Z"),
    });

    expect(result.status).toBe(200);
    if (result.status === 200) {
      expect(result.body.mode).toBe("ai_on");
      expect(result.body.changedAt).toBe("2026-05-02T20:00:00.000Z");
    }
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(repository.insertAutomationState).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId,
      leadId: conversationId,
      automationMode: "ai_on",
    }));
  });

  it("updates an existing lead-scoped automation state", async () => {
    const state = buildState();
    const repository = buildRepository({ state });

    const result = await updateConversationAutomation({
      workspaceId,
      conversationId,
      memberId,
      request: {
        mode: "human_takeover",
        reason: "Agent is taking over",
      },
      repository,
    });

    expect(result.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(repository.updateAutomationState).toHaveBeenCalledWith(expect.objectContaining({
      stateId: state.id,
      automationMode: "human_takeover",
    }));
  });

  it("rejects a workspace mismatch", async () => {
    const repository = buildRepository({
      lead: buildLead({ workspace_id: "523e4567-e89b-12d3-a456-426614174000" }),
    });

    const result = await updateConversationAutomation({
      workspaceId,
      conversationId,
      memberId,
      request: { mode: "ai_on" },
      repository,
    });

    expect(result.status).toBe(403);
  });
});
