import { describe, expect, it } from "vitest";
import { buildHarwickAiConversationState } from "./harwick-ai-runtime-state";
import type { LeadRow } from "../../lib/supabase/leads";

const baseLead: LeadRow = {
  id: "00000000-0000-0000-0000-000000000002",
  workspace_id: "00000000-0000-0000-0000-000000000001",
  status: "hot",
  source_channel: "instagram_dm",
  source_provider_id: "ig-user-1",
  source_post_id: null,
  source_comment_id: null,
  instagram_user_id: "ig-user-1",
  instagram_username: "buyer_demo",
  full_name: "Omar Banks",
  phone: "+15555550100",
  email: "omar@example.com",
  lead_type: "buyer",
  intent: "high",
  timeline: "30 days",
  budget_min: 450000,
  budget_max: 650000,
  target_area: "Katy",
  financing_status: "preapproved",
  score: 82,
  assigned_agent_id: null,
  follow_up_boss_contact_id: null,
  last_message_at: "2026-05-24T12:00:00.000Z",
  next_followup_at: null,
  created_at: "2026-05-24T12:00:00.000Z",
  updated_at: "2026-05-24T12:00:00.000Z",
};

describe("buildHarwickAiConversationState", () => {
  it("hydrates runtime state from lead qualification and automation mode", () => {
    const state = buildHarwickAiConversationState({
      workspaceId: baseLead.workspace_id,
      leadId: baseLead.id,
      providerThreadId: "ig-user-1",
      channel: "instagram_dm",
      automationMode: "human_takeover",
      lead: baseLead,
    });

    expect(state.automationMode).toBe("human_takeover");
    expect(state.qualification).toMatchObject({
      name: "Omar Banks",
      email: "omar@example.com",
      leadType: "buyer",
      intent: "high",
      timeline: "30 days",
      budget: "450000-650000",
      targetArea: "Katy",
      financingStatus: "preapproved",
      score: 82,
    });
  });

  it("falls back to safe unknown qualification when no lead row is available", () => {
    const state = buildHarwickAiConversationState({
      workspaceId: baseLead.workspace_id,
      leadId: null,
      providerThreadId: "thread-1",
      channel: "facebook_comment",
      automationMode: "ai_on",
    });

    expect(state.qualification.leadType).toBe("unknown");
    expect(state.qualification.score).toBe(0);
    expect(state.providerThreadId).toBe("thread-1");
  });
});
