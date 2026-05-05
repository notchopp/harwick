import { describe, expect, it, vi } from "vitest";
import type { NormalizedLeadEvent } from "@realty-ops/core";
import type { HarwickAiToolHandlers } from "@realty-ops/integrations";
import type { ConversationAutomationRepository } from "../../lib/supabase/conversation-automation";
import type { ConversationMessageRepository } from "../../lib/supabase/conversation-messages";
import type { LeadEventPersistenceRepository } from "../../lib/supabase/lead-events";
import type { MemberRoutingProfileRepository } from "../../lib/supabase/member-routing-profiles";
import type { RealtyOpsSupabaseClient } from "../../lib/supabase/server-client";
import { createHarwickAiToolHandlers } from "./harwick-ai-tool-handlers";

const workspaceId = "00000000-0000-0000-0000-000000000001";
const leadId = "00000000-0000-0000-0000-000000000002";

function createInsertSupabase() {
  const single = vi.fn(() => ({ data: { id: "00000000-0000-0000-0000-000000000003" }, error: null }));
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ insert }));
  return {
    client: { from } as unknown as RealtyOpsSupabaseClient,
    from,
    insert,
    select,
    single,
  };
}

function createHandlers(supabase: RealtyOpsSupabaseClient): HarwickAiToolHandlers {
  return createHarwickAiToolHandlers({
    supabase,
    context: {
      workspaceId,
      leadId,
      leadEventId: null,
      event: {
        workspaceId,
        provider: "meta",
        providerEventId: "event-1",
        providerAccountId: "ig-account-1",
        providerUserId: "ig-user-1",
        sourceChannel: "instagram_dm",
        eventType: "message_received",
        text: "Looking in Katy",
        occurredAt: "2026-05-05T12:00:00.000Z",
        sourcePostId: null,
        sourceCommentId: null,
        instagramUsername: null,
        phone: null,
      } as unknown as NormalizedLeadEvent,
      lead: null,
      channel: "instagram_dm",
      providerAccountId: "ig-account-1",
      recipientUserId: "ig-user-1",
      sourcePostId: null,
      sourceCommentId: null,
      automationMode: "ai_on",
      agentTrajectoryId: "00000000-0000-0000-0000-000000000004",
      agentStepId: "00000000-0000-0000-0000-000000000005",
    },
    conversationMessageRepository: {} as ConversationMessageRepository,
    conversationAutomationRepository: {} as ConversationAutomationRepository,
    leadEventRepository: {} as LeadEventPersistenceRepository,
    memberRoutingRepository: {} as MemberRoutingProfileRepository,
    credentialSecret: "test-secret",
  });
}

describe("createHarwickAiToolHandlers", () => {
  it("queues durable subagent tasks from dispatch_subagent tool calls", async () => {
    const supabase = createInsertSupabase();
    const handlers = createHandlers(supabase.client);

    await expect(handlers.dispatch_subagent?.({
      tool: "dispatch_subagent",
      reason: "research similar routing wins",
      requiresApproval: false,
      payload: {
        subagentType: "research",
        title: "Research Katy luxury routing",
        instructions: "Find recent positive routing examples for high-budget Katy buyers.",
        priority: "high",
      },
    })).resolves.toEqual({
      queued: true,
      taskId: "00000000-0000-0000-0000-000000000003",
      subagentType: "research",
      title: "Research Katy luxury routing",
    });

    expect(supabase.from).toHaveBeenCalledWith("harwick_subagent_tasks");
    expect(supabase.insert).toHaveBeenCalledWith(expect.objectContaining({
      workspace_id: workspaceId,
      lead_id: leadId,
      subagent_type: "research",
      priority: "high",
      title: "Research Katy luxury routing",
      instructions: "Find recent positive routing examples for high-budget Katy buyers.",
    }));
  });
});
