import { describe, expect, it, vi } from "vitest";
import type { AuditLogEntry, HarwickAiRuntimeInput, NormalizedLeadEvent } from "@realty-ops/core";
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
  const workspaceMemoryRepo = {
    listRuntimeMemoryDocuments: vi.fn(),
    listReviewableMemoryDocuments: vi.fn(),
    updateMemoryReview: vi.fn(),
    semanticMemorySearch: vi.fn(),
    saveMemoryEmbedding: vi.fn(),
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
  const workItemRepo = {
    createWorkItem: vi.fn(),
    findOpenInsightBySignalKey: vi.fn(),
    listVisibleHomeWorkItems: vi.fn(),
    updateWorkItemStatus: vi.fn(),
  };

  return {
    conversationRepo,
    automationRepo,
    leadDocumentRepo,
    workspaceMemoryRepo,
    policyNarrativeRepo,
    memberRoutingRepo,
    trajectoryStore,
    auditRepo,
    workItemRepo,
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

vi.mock("../../lib/supabase/workspace-memory", async () => {
  const actual = await vi.importActual<typeof import("../../lib/supabase/workspace-memory")>(
    "../../lib/supabase/workspace-memory",
  );
  return {
    ...actual,
    createSupabaseWorkspaceMemoryRepository: () => mocks.workspaceMemoryRepo,
  };
});

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

vi.mock("../../lib/supabase/harwick-work-items", () => ({
  createSupabaseHarwickWorkItemRepository: () => mocks.workItemRepo,
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

function createSupabaseMock(options: {
  turnsUsed?: number;
  walletBalanceCents?: number;
  subscriptionTier?: "solo" | "team" | "brokerage" | null;
  assignedAgentId?: string | null;
} = {}) {
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
                  assigned_agent_id: options.assignedAgentId ?? null,
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

    if (table === "workspace_subscriptions") {
      const subscriptionTier = options.subscriptionTier === undefined ? "team" : options.subscriptionTier;
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({
              data: subscriptionTier === null
                ? null
                : {
                    id: "00000000-0000-0000-0000-000000000050",
                    workspace_id: workspaceId,
                    plan_tier: subscriptionTier,
                    billing_interval: "month",
                    status: "active",
                    provider_subscription_id: "sub_123",
                    provider_customer_id: "cus_123",
                    current_period_start: "2026-05-01T00:00:00Z",
                    current_period_end: "2026-06-01T00:00:00Z",
                    canceled_at: null,
                    cancel_at_period_end: false,
                    trial_start: null,
                    trial_end: null,
                    created_at: "2026-05-01T00:00:00Z",
                    updated_at: "2026-05-01T00:00:00Z",
                  },
              error: null,
            })),
          })),
        })),
      };
    }

    if (table === "monthly_usage_summary") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: vi.fn(() => Promise.resolve({
                  data: {
                    workspace_id: workspaceId,
                    month: "2026-05-01",
                    turns_used: options.turnsUsed ?? 0,
                    minutes_used: 0,
                    memory_loops_used: 0,
                    overage_listings: 0,
                    overage_seats: 0,
                    retail_cents: 0,
                    cogs_cents: 0,
                    balance_after_cents: null,
                  },
                  error: null,
                })),
              })),
            })),
          })),
        })),
      };
    }

    if (table === "workspace_usage_wallet") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({
              data: {
                workspace_id: workspaceId,
                balance_cents: options.walletBalanceCents ?? 0,
                auto_recharge_enabled: false,
                auto_recharge_threshold_cents: 1000,
                auto_recharge_amount_cents: 5000,
                stripe_payment_method_id: null,
                last_recharge_at: null,
                low_balance_notified_at: null,
                updated_at: "2026-05-17T12:00:00Z",
              },
              error: null,
            })),
          })),
        })),
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
    mocks.workspaceMemoryRepo.listRuntimeMemoryDocuments.mockResolvedValue([]);
    mocks.workspaceMemoryRepo.semanticMemorySearch.mockResolvedValue([{
      id: "memory-1",
      memoryType: "routing",
      title: "Noah closes high-budget Katy buyers",
      body: "Operators often reassign high-budget Katy buyers to Noah.",
      confidence: 0.83,
      lastObservedAt: "2026-05-05T12:00:00.000Z",
      similarity: 0.77,
    }]);
    mocks.workspaceMemoryRepo.saveMemoryEmbedding.mockResolvedValue(undefined);
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
          tool: "send_meta_message",
          reason: "safe buyer qualification reply",
          requiresApproval: false,
          payload: { reply: "Happy to help. What timeline are you working with?", target: "dm" },
        }],
        selfGateAutoExecute: true,
        selfGateReason: "policy narrative permits a normal qualification reply.",
        documentUpdate: "Lead is interested in Katy and needs timeline qualification.",
        endTurn: true,
    });
    const runtimeClient: HarwickAiRuntimeClient = {
      runTurn,
    };

    const insertTurn = vi.fn<HarwickAiTurnPersistenceRepository["insertTurn"]>(() =>
      Promise.resolve({ turnId: "00000000-0000-0000-0000-000000000020" })
    );
    const turnRepository: HarwickAiTurnPersistenceRepository = {
      insertTurn,
      getTurnById: vi.fn(),
      updateTurnStatus: vi.fn().mockResolvedValue(undefined),
    };
    const resolveEffectivePolicy = vi.fn<HarwickAiAutomationPolicyRepository["resolveEffectivePolicy"]>().mockResolvedValue({
        id: "00000000-0000-0000-0000-000000000030",
        workspaceId,
        memberId: null,
        leadId,
        scope: "conversation",
        automationMode: "ai_on",
        autoSendEnabled: true,
        confidenceThreshold: 0.7,
        allowedAutoActions: ["send_reply", "ask_qualification"],
        allowedAutoTools: ["send_meta_message"],
        requiresApprovalActions: ["request_showing_approval", "route_lead"],
        requiresApprovalTools: ["request_showing_approval", "route_lead"],
        blockedSafetyFlags: ["needs_human_review", "human_takeover"],
      });
    const policyRepository: HarwickAiAutomationPolicyRepository = {
      resolveEffectivePolicy,
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
    const assignedAgentId = "00000000-0000-0000-0000-000000000044";
    const supabase = createSupabaseMock({ assignedAgentId });

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
    expect(resolveEffectivePolicy).toHaveBeenCalledWith({
      workspaceId,
      memberId: assignedAgentId,
      leadId,
    });
    const runTurnCalls = runTurn.mock.calls as Array<[HarwickAiRuntimeInput]>;
    expect(runTurnCalls[0]?.[0].state).toMatchObject({
      workspaceId,
      leadId,
      providerThreadId: "ig-user-1",
      automationMode: "ai_on",
      qualification: {
        leadType: "buyer",
        targetArea: "Katy",
        financingStatus: "unknown",
        score: 72,
      },
    });
    expect(runTurnCalls[0]?.[0].workspaceMemory).toContain("Noah closes high-budget Katy buyers");
    expect(mocks.sendMetaReply).toHaveBeenCalledTimes(1);
    const sendMetaReplyCalls = mocks.sendMetaReply.mock.calls as Array<[{
      request: { automationMode?: string };
    }]>;
    expect(sendMetaReplyCalls[0]?.[0].request.automationMode).toBe("ai_on");
    expect(insertTurn).toHaveBeenCalledTimes(1);
    const insertedTurn = insertTurn.mock.calls[0]?.[0];
    expect(insertedTurn?.status).toBe("auto_executed");
    expect(insertedTurn?.toolCalls[0]).toMatchObject({
      tool: "send_meta_message",
      executionStatus: "executed",
    });
    expect(insertedTurn?.toolCalls[0]?.executionOutput).toMatchObject({
      sent: true,
      providerEventId: "meta-message-1",
    });
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

  it("pauses before classifier/runtime when plan quota is exhausted and wallet is empty", async () => {
    vi.clearAllMocks();
    mocks.conversationRepo.insertMessage.mockResolvedValue({
      id: "message-plan",
      lead_id: leadId,
      workspace_id: workspaceId,
      sender_type: "ai",
      sender_id: null,
      body: "paused",
      created_at: "2026-05-17T12:00:00Z",
      updated_at: "2026-05-17T12:00:00Z",
      status: "sent",
      source_channel: "instagram_dm",
      provider_message_id: null,
      error_code: null,
      error_message: null,
      agent_trajectory_id: null,
      agent_step_id: null,
    });
    mocks.workItemRepo.findOpenInsightBySignalKey.mockResolvedValue(null);
    mocks.workItemRepo.createWorkItem.mockResolvedValue({ workItemId: "work-item-1" });

    const runTurn = vi.fn();
    const runtimeClient: HarwickAiRuntimeClient = {
      runTurn,
    };
    const turnRepository: HarwickAiTurnPersistenceRepository = {
      insertTurn: vi.fn(),
      getTurnById: vi.fn(),
      updateTurnStatus: vi.fn(),
    };
    const resolveEffectivePolicy = vi.fn();
    const policyRepository: HarwickAiAutomationPolicyRepository = {
      resolveEffectivePolicy,
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
    const supabase = createSupabaseMock({ turnsUsed: 100, walletBalanceCents: 0, subscriptionTier: null });

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

    expect(runTurn).not.toHaveBeenCalled();
    expect(resolveEffectivePolicy).not.toHaveBeenCalled();
    expect(supabase.updateLeadEvents).not.toHaveBeenCalled();
    const insertedMessage = mocks.conversationRepo.insertMessage.mock.calls[0]?.[0] as { sender_type?: string; body?: string } | undefined;
    expect(insertedMessage?.sender_type).toBe("ai");
    expect(insertedMessage?.body).toContain("wallet needs funding");
    const createdWorkItem = mocks.workItemRepo.createWorkItem.mock.calls[0]?.[0] as {
      type?: string;
      targetRole?: string;
      payload?: { code?: string; planTier?: string };
    } | undefined;
    expect(createdWorkItem?.type).toBe("alert");
    expect(createdWorkItem?.targetRole).toBe("owner");
    expect(createdWorkItem?.payload?.code).toBe("wallet_empty");
    expect(createdWorkItem?.payload?.planTier).toBe("free");
  });

  it("persists approval-required executor turns without executing the gated tool", async () => {
    vi.clearAllMocks();

    mocks.conversationRepo.getMessagesByLeadId.mockResolvedValue([]);
    mocks.policyNarrativeRepo.read.mockResolvedValue("Queue private showing requests for operator approval.");
    mocks.leadDocumentRepo.read.mockResolvedValue("Lead asked to tour a Katy listing.");
    mocks.leadDocumentRepo.appendUpdate.mockResolvedValue("updated lead document");
    mocks.workspaceMemoryRepo.listRuntimeMemoryDocuments.mockResolvedValue([]);
    mocks.workspaceMemoryRepo.semanticMemorySearch.mockResolvedValue([]);
    mocks.workspaceMemoryRepo.saveMemoryEmbedding.mockResolvedValue(undefined);
    mocks.findSimilarTrajectories.mockResolvedValue([]);
    mocks.trajectoryStore.startTrajectory.mockResolvedValue({ trajectoryId: "00000000-0000-0000-0000-000000000110" });
    mocks.trajectoryStore.appendStep.mockResolvedValue({ stepId: "00000000-0000-0000-0000-000000000111" });
    mocks.trajectoryStore.completeTrajectory.mockResolvedValue(undefined);
    mocks.auditRepo.insertAuditLog.mockResolvedValue(undefined);

    const runTurn = vi.fn().mockResolvedValue({
      intent: "showing_request",
      nextAction: "request_showing_approval",
      missingFields: ["phone"],
      confidence: 0.93,
      safetyFlags: ["safe_to_send"],
      reply: "I can help request that showing. What is the best phone number for confirmation?",
      statePatch: {
        currentIntent: "showing_request",
        leadType: "buyer",
        intent: "high",
        targetArea: "Katy",
      },
      handoffBrief: "showing request needs agent approval",
      toolCalls: [{
        tool: "request_showing_approval",
        reason: "agent approval is required before confirming the private showing",
        requiresApproval: true,
        payload: { listing: "Katy listing" },
      }],
      selfGateAutoExecute: false,
      selfGateReason: "policy narrative requires approval for private showings.",
      documentUpdate: "Lead wants to tour a Katy listing and needs phone capture.",
      endTurn: true,
    });
    const runtimeClient: HarwickAiRuntimeClient = { runTurn };

    const insertTurn = vi.fn<HarwickAiTurnPersistenceRepository["insertTurn"]>(() =>
      Promise.resolve({ turnId: "00000000-0000-0000-0000-000000000120" })
    );
    const updateTurnStatus = vi.fn<HarwickAiTurnPersistenceRepository["updateTurnStatus"]>().mockResolvedValue(undefined);
    const turnRepository: HarwickAiTurnPersistenceRepository = {
      insertTurn,
      getTurnById: vi.fn(),
      updateTurnStatus,
    };
    const resolveEffectivePolicy = vi.fn<HarwickAiAutomationPolicyRepository["resolveEffectivePolicy"]>().mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000130",
      workspaceId,
      memberId: null,
      leadId,
      scope: "conversation",
      automationMode: "ai_on",
      autoSendEnabled: true,
      confidenceThreshold: 0.7,
      allowedAutoActions: ["send_reply", "ask_qualification"],
      allowedAutoTools: ["send_meta_message"],
      requiresApprovalActions: ["request_showing_approval"],
      requiresApprovalTools: ["request_showing_approval"],
      blockedSafetyFlags: ["needs_human_review", "human_takeover"],
    });
    const policyRepository: HarwickAiAutomationPolicyRepository = {
      resolveEffectivePolicy,
    };

    const event: NormalizedLeadEvent = {
      workspaceId,
      provider: "meta",
      providerAccountId: "ig-business-1",
      providerEventId: "dm-event-showing",
      providerUserId: "ig-user-showing",
      eventType: "message_received",
      sourceChannel: "instagram_dm",
      sourcePostId: null,
      sourceCommentId: null,
      instagramUsername: "buyer_demo",
      phone: null,
      occurredAt: "2026-05-05T17:00:00.000Z",
      text: "Can I see the Katy house this weekend?",
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

    expect(mocks.sendMetaReply).not.toHaveBeenCalled();
    expect(updateTurnStatus).not.toHaveBeenCalled();
    expect(insertTurn).toHaveBeenCalledTimes(1);
    const insertedTurn = insertTurn.mock.calls[0]?.[0];
    expect(insertedTurn?.status).toBe("queued_for_approval");
    expect(insertedTurn?.automationDecision).toMatchObject({
      canAutoExecute: false,
      approvedTools: [],
      blockedTools: ["request_showing_approval"],
    });
    expect(insertedTurn?.toolCalls[0]).toMatchObject({
      tool: "request_showing_approval",
      policyStatus: "approval_required",
      executionStatus: "queued_for_approval",
      executionOutput: {
        payload: { listing: "Katy listing" },
      },
    });
    expect(mocks.trajectoryStore.completeTrajectory).toHaveBeenCalledWith(
      expect.objectContaining({
        trajectoryId: "00000000-0000-0000-0000-000000000110",
        completionReason: "queued_for_approval",
      }),
    );
  });

  it("persists human-takeover executor turns as blocked without executing outbound tools", async () => {
    vi.clearAllMocks();

    mocks.conversationRepo.getMessagesByLeadId.mockResolvedValue([]);
    mocks.policyNarrativeRepo.read.mockResolvedValue("Human takeover is active. Do not send autonomously.");
    mocks.leadDocumentRepo.read.mockResolvedValue("Operator is handling this lead.");
    mocks.leadDocumentRepo.appendUpdate.mockResolvedValue("updated lead document");
    mocks.workspaceMemoryRepo.listRuntimeMemoryDocuments.mockResolvedValue([]);
    mocks.workspaceMemoryRepo.semanticMemorySearch.mockResolvedValue([]);
    mocks.workspaceMemoryRepo.saveMemoryEmbedding.mockResolvedValue(undefined);
    mocks.findSimilarTrajectories.mockResolvedValue([]);
    mocks.trajectoryStore.startTrajectory.mockResolvedValue({ trajectoryId: "00000000-0000-0000-0000-000000000210" });
    mocks.trajectoryStore.appendStep.mockResolvedValue({ stepId: "00000000-0000-0000-0000-000000000211" });
    mocks.trajectoryStore.completeTrajectory.mockResolvedValue(undefined);
    mocks.auditRepo.insertAuditLog.mockResolvedValue(undefined);

    const runTurn = vi.fn().mockResolvedValue({
      intent: "handoff_needed",
      nextAction: "pause_for_owner",
      missingFields: [],
      confidence: 1,
      safetyFlags: ["human_takeover", "needs_human_review"],
      reply: "A human has taken over this conversation.",
      statePatch: {
        currentIntent: "human_takeover",
      },
      handoffBrief: "automation is paused",
      toolCalls: [],
      selfGateAutoExecute: false,
      selfGateReason: "human takeover is active.",
      documentUpdate: "Automation stayed paused because the operator took over.",
      endTurn: true,
    });
    const runtimeClient: HarwickAiRuntimeClient = { runTurn };

    const insertTurn = vi.fn<HarwickAiTurnPersistenceRepository["insertTurn"]>(() =>
      Promise.resolve({ turnId: "00000000-0000-0000-0000-000000000220" })
    );
    const updateTurnStatus = vi.fn<HarwickAiTurnPersistenceRepository["updateTurnStatus"]>().mockResolvedValue(undefined);
    const turnRepository: HarwickAiTurnPersistenceRepository = {
      insertTurn,
      getTurnById: vi.fn(),
      updateTurnStatus,
    };
    const resolveEffectivePolicy = vi.fn<HarwickAiAutomationPolicyRepository["resolveEffectivePolicy"]>().mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000230",
      workspaceId,
      memberId: null,
      leadId,
      scope: "conversation",
      automationMode: "human_takeover",
      autoSendEnabled: true,
      confidenceThreshold: 0.7,
      allowedAutoActions: ["send_reply"],
      allowedAutoTools: ["send_meta_message"],
      requiresApprovalActions: [],
      requiresApprovalTools: [],
      blockedSafetyFlags: ["needs_human_review", "human_takeover"],
    });
    const policyRepository: HarwickAiAutomationPolicyRepository = {
      resolveEffectivePolicy,
    };

    const event: NormalizedLeadEvent = {
      workspaceId,
      provider: "meta",
      providerAccountId: "ig-business-1",
      providerEventId: "dm-event-paused",
      providerUserId: "ig-user-paused",
      eventType: "message_received",
      sourceChannel: "instagram_dm",
      sourcePostId: null,
      sourceCommentId: null,
      instagramUsername: "buyer_demo",
      phone: null,
      occurredAt: "2026-05-05T17:00:00.000Z",
      text: "Are you still there?",
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

    expect(mocks.sendMetaReply).not.toHaveBeenCalled();
    expect(updateTurnStatus).not.toHaveBeenCalled();
    const runTurnCalls = runTurn.mock.calls as Array<[HarwickAiRuntimeInput]>;
    expect(runTurnCalls[0]?.[0].state?.automationMode).toBe("human_takeover");
    expect(insertTurn).toHaveBeenCalledTimes(1);
    const insertedTurn = insertTurn.mock.calls[0]?.[0];
    expect(insertedTurn?.status).toBe("blocked");
    expect(insertedTurn?.automationDecision).toMatchObject({
      canAutoExecute: false,
      approvedTools: [],
      blockedTools: [],
    });
    expect(insertedTurn?.toolCalls).toEqual([]);
    expect(mocks.trajectoryStore.completeTrajectory).toHaveBeenCalledWith(
      expect.objectContaining({
        trajectoryId: "00000000-0000-0000-0000-000000000210",
        completionReason: "no_tool_calls",
      }),
    );
  });
});
