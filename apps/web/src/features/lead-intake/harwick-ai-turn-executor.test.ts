import { describe, expect, it, vi } from "vitest";
import type { AuditLogEntry, NormalizedLeadEvent } from "@realty-ops/core";
import type { HarwickAiRuntimeClient } from "@realty-ops/integrations";
import { generateAndExecuteHarwickAiTurnSync } from "./harwick-ai-turn-executor";
import type {
  HarwickAiAutomationPolicyRepository,
  HarwickAiTurnPersistenceRepository,
} from "../../lib/supabase/harwick-ai-turns";
import type { LeadEventPersistenceRepository } from "../../lib/supabase/lead-events";
import type { RealtyOpsSupabaseClient } from "../../lib/supabase/server-client";
import type { SocialReplyQueueRepository } from "../operator-queues/operator-queues";

const mocks = vi.hoisted(() => {
  const conversationRepo = {
    getMessagesByLeadId: vi.fn(),
    insertMessage: vi.fn(),
    updateMessageStatus: vi.fn(),
  };
  const automationRepo = {
    findLeadByConversationId: vi.fn(),
    findAutomationState: vi.fn(),
    insertAutomationState: vi.fn(),
    updateAutomationState: vi.fn(),
  };
  const leadDocumentRepo = {
    read: vi.fn(),
    appendUpdate: vi.fn(),
  };
  const policyNarrativeRepo = {
    read: vi.fn(),
    write: vi.fn(),
  };
  const memberRoutingRepo = {
    findProfileByMemberId: vi.fn(),
    listProfilesForWorkspace: vi.fn(),
  };
  const trajectoryStore = {
    startTrajectory: vi.fn(),
    appendStep: vi.fn(),
    completeTrajectory: vi.fn(),
    recordOutcome: vi.fn(),
    saveTrajectoryEmbedding: vi.fn(),
    saveStepEmbedding: vi.fn(),
  };
  const auditRepo = {
    insertAuditLog: vi.fn(),
  };

  return {
    conversationRepo,
    automationRepo,
    leadDocumentRepo,
    policyNarrativeRepo,
    memberRoutingRepo,
    trajectoryStore,
    auditRepo,
    findSimilarTrajectories: vi.fn(),
    sendMetaReply: vi.fn(),
  };
});

vi.mock("../../lib/server-env", () => ({
  getServerEnvironment: () => ({
    OPENAI_API_KEY: "test-openai-key",
    OPENAI_SMALL_MODEL: "gpt-4o-mini",
  }),
}));

vi.mock("../../lib/supabase/conversation-messages", () => ({
  createSupabaseConversationMessageRepository: () => mocks.conversationRepo,
}));

vi.mock("../../lib/supabase/conversation-automation", () => ({
  createSupabaseConversationAutomationRepository: () => mocks.automationRepo,
}));

vi.mock("../../lib/supabase/lead-document", () => ({
  createSupabaseLeadDocumentRepository: () => mocks.leadDocumentRepo,
}));

vi.mock("../../lib/supabase/workspace-policy-narrative", () => ({
  createSupabaseWorkspacePolicyNarrativeRepository: () => mocks.policyNarrativeRepo,
}));

vi.mock("../../lib/supabase/member-routing-profiles", async () => {
  const actual = await vi.importActual<typeof import("../../lib/supabase/member-routing-profiles")>(
    "../../lib/supabase/member-routing-profiles",
  );
  return {
    ...actual,
    createSupabaseMemberRoutingProfileRepository: () => mocks.memberRoutingRepo,
  };
});

vi.mock("../../lib/supabase/agent-trajectory-store", () => ({
  createSupabaseAgentTrajectoryStore: () => mocks.trajectoryStore,
  findSimilarTrajectories: mocks.findSimilarTrajectories,
}));

vi.mock("../../lib/supabase/audit-logs", () => ({
  createSupabaseAuditLogRepository: () => mocks.auditRepo,
}));

vi.mock("../integrations/meta-reply-send", () => ({
  sendMetaReply: mocks.sendMetaReply,
}));

vi.mock("../../lib/supabase/integration-accounts", () => ({
  createSupabaseMetaCredentialRepository: () => ({}),
}));

vi.mock("@realty-ops/integrations", async () => {
  const actual = await vi.importActual<typeof import("@realty-ops/integrations")>("@realty-ops/integrations");
  return {
    ...actual,
    createOpenAISmallModelClient: () => ({
      classify: vi.fn().mockResolvedValue({
        classification: "lead",
        reasonCode: "listing_question",
        reasonText: "Asking if a property is still available.",
        confidence: 0.92,
        leadHint: "buyer",
      }),
    }),
    createOpenAIEmbeddingClient: () => ({
      embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    }),
    createMetaMessagingClient: () => ({}),
  };
});

const workspaceId = "00000000-0000-0000-0000-000000000001";
const leadId = "00000000-0000-0000-0000-000000000002";
const leadEventId = "00000000-0000-0000-0000-000000000003";

function createSupabaseMock() {
  const updateConversationMessages = vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          is: vi.fn(() => ({
            gte: vi.fn(() => Promise.resolve({ error: null })),
          })),
        })),
      })),
    })),
  }));
  const updateLeadEvents = vi.fn(() => ({
    eq: vi.fn(() => Promise.resolve({ error: null })),
  }));

  const from = vi.fn((table: string) => {
    if (table === "leads") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({
                data: {
                  id: leadId,
                  workspace_id: workspaceId,
                  assigned_agent_id: null,
                  lead_type: "buyer",
                  target_area: "Katy",
                  budget_min: null,
                  budget_max: null,
                  timeline: null,
                  financing_status: "unknown",
                  score: 72,
                },
                error: null,
              })),
            })),
          })),
        })),
      };
    }

    if (table === "conversation_messages") {
      return {
        update: updateConversationMessages,
      };
    }

    if (table === "lead_events") {
      return {
        update: updateLeadEvents,
      };
    }

    throw new Error(`Unexpected table in executor test: ${table}`);
  });

  return {
    client: { from } as unknown as RealtyOpsSupabaseClient,
    from,
    updateConversationMessages,
    updateLeadEvents,
  };
}

describe("generateAndExecuteHarwickAiTurnSync", () => {
  it("runs a local normalized event through the AI-native executor without real Meta webhooks", async () => {
    vi.clearAllMocks();

    mocks.conversationRepo.getMessagesByLeadId.mockResolvedValue([]);
    mocks.conversationRepo.insertMessage.mockImplementation((row: Record<string, unknown>) => ({
      id: "message-1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...row,
    }));
    mocks.policyNarrativeRepo.read.mockResolvedValue("Auto-send normal buyer replies. Queue risky tools.");
    mocks.leadDocumentRepo.read.mockResolvedValue("Lead asked about a Katy home.");
    mocks.leadDocumentRepo.appendUpdate.mockResolvedValue("updated lead document");
    mocks.findSimilarTrajectories.mockResolvedValue([]);
    mocks.trajectoryStore.startTrajectory.mockResolvedValue({ trajectoryId: "00000000-0000-0000-0000-000000000010" });
    mocks.trajectoryStore.appendStep.mockResolvedValue({ stepId: "00000000-0000-0000-0000-000000000011" });
    mocks.trajectoryStore.completeTrajectory.mockResolvedValue(undefined);
    mocks.auditRepo.insertAuditLog.mockResolvedValue(undefined);
    mocks.sendMetaReply.mockImplementation(async (params: {
      conversationMessageRepository?: typeof mocks.conversationRepo;
      agentTrajectoryId?: string | null;
      agentStepId?: string | null;
    }) => {
      await params.conversationMessageRepository?.insertMessage({
        lead_id: leadId,
        workspace_id: workspaceId,
        sender_type: "ai",
        sender_id: null,
        body: "Happy to help. What timeline are you working with?",
        source_channel: "instagram_dm",
        provider_message_id: "meta-message-1",
        status: "sent",
        error_code: null,
        error_message: null,
        agent_trajectory_id: params.agentTrajectoryId ?? null,
        agent_step_id: params.agentStepId ?? null,
      });
      return {
        status: 200,
        body: {
          providerEventId: "meta-message-1",
          occurredAt: "2026-05-05T17:00:00.000Z",
          channel: "instagram_dm",
        },
      };
    });

    const runTurn = vi.fn().mockResolvedValue({
        intent: "buyer_qualification",
        nextAction: "send_reply",
        missingFields: ["timeline"],
        confidence: 0.91,
        safetyFlags: ["safe_to_send"],
        reply: "Happy to help. What timeline are you working with?",
        statePatch: {
          currentIntent: "buyer_qualification",
          leadType: "buyer",
          intent: "high",
          timeline: null,
          budget: null,
          targetArea: "Katy",
          propertyType: null,
          financingStatus: "unknown",
          knownFacts: [],
        },
        handoffBrief: null,
        toolCalls: [{
          tool: "send_meta_dm",
          reason: "safe buyer qualification reply",
          requiresApproval: false,
          payload: { reply: "Happy to help. What timeline are you working with?" },
        }],
        selfGateAutoExecute: true,
        selfGateReason: "policy narrative permits a normal qualification reply.",
        documentUpdate: "Lead is interested in Katy and needs timeline qualification.",
        endTurn: true,
    });
    const runtimeClient: HarwickAiRuntimeClient = {
      runTurn,
    };

    const turnRepository: HarwickAiTurnPersistenceRepository = {
      insertTurn: vi.fn().mockResolvedValue({ turnId: "00000000-0000-0000-0000-000000000020" }),
      getTurnById: vi.fn(),
      updateTurnStatus: vi.fn().mockResolvedValue(undefined),
    };
    const policyRepository: HarwickAiAutomationPolicyRepository = {
      resolveEffectivePolicy: vi.fn().mockResolvedValue({
        id: "00000000-0000-0000-0000-000000000030",
        workspaceId,
        memberId: null,
        leadId,
        scope: "conversation",
        automationMode: "ai_on",
        autoSendEnabled: true,
        confidenceThreshold: 0.7,
        allowedAutoActions: ["send_reply", "ask_qualification"],
        allowedAutoTools: ["send_meta_dm", "send_meta_reply"],
        requiresApprovalActions: ["request_showing_approval", "route_lead"],
        requiresApprovalTools: ["request_showing_approval", "route_lead"],
        blockedSafetyFlags: ["needs_human_review", "human_takeover"],
      }),
    };

    const event: NormalizedLeadEvent = {
      workspaceId,
      provider: "meta",
      providerAccountId: "ig-business-1",
      providerEventId: "dm-event-1",
      providerUserId: "ig-user-1",
      eventType: "message_received",
      sourceChannel: "instagram_dm",
      sourcePostId: null,
      sourceCommentId: null,
      instagramUsername: "buyer_demo",
      phone: null,
      occurredAt: "2026-05-05T17:00:00.000Z",
      text: "I like the Katy house. Is it still available?",
      rawPayload: {},
    };
    const supabase = createSupabaseMock();

    await generateAndExecuteHarwickAiTurnSync(
      { workspaceId, leadId, leadEventId, event },
      {
        supabase: supabase.client,
        turnRepository,
        policyRepository,
        leadEventRepository: {} as LeadEventPersistenceRepository,
        queueRepository: {} as SocialReplyQueueRepository,
        runtimeClient,
        credentialSecret: "test-secret",
      },
    );

    expect(runTurn).toHaveBeenCalledTimes(1);
    expect(mocks.sendMetaReply).toHaveBeenCalledTimes(1);
    expect(mocks.conversationRepo.insertMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sender_type: "ai",
        agent_trajectory_id: "00000000-0000-0000-0000-000000000010",
        agent_step_id: null,
      }),
    );
    expect(mocks.trajectoryStore.appendStep).toHaveBeenCalledWith(
      expect.objectContaining({
        trajectoryId: "00000000-0000-0000-0000-000000000010",
        harwickAiTurnId: "00000000-0000-0000-0000-000000000020",
        gatesAgreed: true,
      }),
    );
    expect(supabase.updateConversationMessages).toHaveBeenCalledWith({
      agent_step_id: "00000000-0000-0000-0000-000000000011",
    });
    expect(mocks.leadDocumentRepo.appendUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        leadId,
        update: "Lead is interested in Katy and needs timeline qualification.",
      }),
    );
    const auditCalls = mocks.auditRepo.insertAuditLog.mock.calls as Array<[AuditLogEntry]>;
    const auditEntry = auditCalls[0]?.[0];
    expect(auditEntry).toEqual(expect.objectContaining({
      action: "harwick_ai.policy_shadow",
      resourceType: "harwick_ai_turn",
      resourceId: "00000000-0000-0000-0000-000000000020",
    }));
    expect(auditEntry?.metadata).toEqual(expect.objectContaining({
      agree: true,
      deterministicAutoExecute: true,
      modelSelfGateAutoExecute: true,
    }));
    expect(mocks.trajectoryStore.completeTrajectory).toHaveBeenCalledWith(
      expect.objectContaining({
        trajectoryId: "00000000-0000-0000-0000-000000000010",
        completionReason: "model_end_turn",
        outcomeLabel: "pending",
      }),
    );
  });
});
