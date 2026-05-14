import { describe, it, expect, vi } from "vitest";
import { createHarwickAiTurnGeneratorService } from "./harwick-ai-turn-generator";
import type { HarwickAiRuntimeClient } from "@realty-ops/integrations";
import type {
  HarwickAiTurnPersistenceRepository,
  HarwickAiAutomationPolicyRepository,
} from "../../lib/supabase/harwick-ai-turns";

// UUID generator for testing
const uuidv4 = () =>
  "00000000-0000-0000-0000-000000000000".replace(/0/g, () =>
    Math.floor(Math.random() * 16).toString(16)
  );

describe("HarwickAiTurnGeneratorService", () => {
  it("generates and persists a turn with auto_executed status when policy allows auto-send", async () => {
    const mockTurn = {
      intent: "buyer_qualification" as const,
      nextAction: "send_reply" as const,
      confidence: 0.85,
      reply: "Thanks for your interest!",
      safetyFlags: ["safe_to_send"],
      missingFields: [],
      toolCalls: [
        {
          tool: "send_meta_message" as const,
          reason: "User showed interest",
          requiresApproval: false,
          payload: { reply: "Thanks for your interest!", target: "dm" },
        },
      ],
      statePatch: {
        leadType: "buyer",
        intent: "high",
      },
      handoffBrief: null,
    };

    const mockRuntimeClient: Partial<HarwickAiRuntimeClient> = {
      runTurn: vi.fn().mockResolvedValue(mockTurn),
    };

    const wsId = uuidv4();
    const mockPolicy = {
      id: uuidv4(),
      workspaceId: wsId,
      scope: "workspace" as const,
      automationMode: "ai_on" as const,
      autoSendEnabled: true,
      confidenceThreshold: 0.7,
      allowedAutoActions: ["send_reply", "ask_qualification"],
      allowedAutoTools: ["send_meta_message"],
      requiresApprovalActions: ["route_lead"],
      requiresApprovalTools: ["route_lead"],
      blockedSafetyFlags: ["needs_human_review"],
    };

    const mockTurnRepository: Partial<HarwickAiTurnPersistenceRepository> = {
      insertTurn: vi.fn().mockResolvedValue({ turnId: "turn-1" }),
    };

    const mockPolicyRepository: Partial<HarwickAiAutomationPolicyRepository> = {
      resolveEffectivePolicy: vi.fn().mockResolvedValue(mockPolicy),
    };

    const service = createHarwickAiTurnGeneratorService({
      runtimeClient: mockRuntimeClient as HarwickAiRuntimeClient,
      turnRepository: mockTurnRepository as HarwickAiTurnPersistenceRepository,
      policyRepository: mockPolicyRepository as HarwickAiAutomationPolicyRepository,
    });

    const result = await service.generateAndPersistTurn({
      workspaceId: wsId,
      leadId: uuidv4(),
      socialReplyReviewId: null,
      providerThreadId: "thread-123",
      channel: "instagram_dm",
      inboundText: "Hey, I'm interested in the property!",
      context: {
        conversationHistory: [
          {
            id: "msg-1",
            actor: "lead" as const,
            body: "Hey, I'm interested in the property!",
            occurredAt: new Date().toISOString(),
          },
        ],
        workspaceName: "Acme Realty",
        toneProfile: {
          voice: "warm and professional",
        },
        listingContext: null,
        calendarContext: [],
        postContext: null,
      },
    });

    expect(result.turnId).toBe("turn-1");
    expect(result.persistenceStatus).toBe("drafted");
    expect(result.shouldExecute).toBe(true);
    expect(mockRuntimeClient.runTurn).toHaveBeenCalled();
    expect(mockTurnRepository.insertTurn).toHaveBeenCalled();
  });

  it("generates and persists a turn with queued_for_approval status when tools require approval", async () => {
    const mockTurn = {
      intent: "showing_request" as const,
      nextAction: "request_showing_approval" as const,
      confidence: 0.9,
      reply: "I can help you schedule a showing!",
      safetyFlags: ["safe_to_send"],
      missingFields: [],
      toolCalls: [
        {
          tool: "request_showing_approval" as const,
          reason: "User wants to schedule a showing",
          requiresApproval: true,
          payload: { listingId: "list-1" },
        },
      ],
      statePatch: {},
      handoffBrief: null,
    };

    const mockRuntimeClient: Partial<HarwickAiRuntimeClient> = {
      runTurn: vi.fn().mockResolvedValue(mockTurn),
    };

    const wsId = uuidv4();
    const mockPolicy = {
      id: uuidv4(),
      workspaceId: wsId,
      scope: "workspace" as const,
      automationMode: "ai_on" as const,
      autoSendEnabled: true,
      confidenceThreshold: 0.7,
      allowedAutoActions: ["send_reply"],
        allowedAutoTools: ["send_meta_message"],
      requiresApprovalActions: ["request_showing_approval"],
      requiresApprovalTools: ["request_showing_approval"],
      blockedSafetyFlags: ["needs_human_review"],
    };

    const mockTurnRepository: Partial<HarwickAiTurnPersistenceRepository> = {
      insertTurn: vi.fn().mockResolvedValue({ turnId: "turn-2" }),
    };

    const mockPolicyRepository: Partial<HarwickAiAutomationPolicyRepository> = {
      resolveEffectivePolicy: vi.fn().mockResolvedValue(mockPolicy),
    };

    const service = createHarwickAiTurnGeneratorService({
      runtimeClient: mockRuntimeClient as HarwickAiRuntimeClient,
      turnRepository: mockTurnRepository as HarwickAiTurnPersistenceRepository,
      policyRepository: mockPolicyRepository as HarwickAiAutomationPolicyRepository,
    });

    const result = await service.generateAndPersistTurn({
      workspaceId: wsId,
      leadId: uuidv4(),
      socialReplyReviewId: uuidv4(),
      providerThreadId: "thread-456",
      channel: "instagram_comment",
      inboundText: "I'd like to see it this weekend!",
      context: {
        conversationHistory: [],
        workspaceName: "Acme Realty",
        toneProfile: {},
        listingContext: {
          listingId: "list-1",
          label: "123 Main St",
        },
        calendarContext: [],
        postContext: null,
      },
    });

    expect(result.turnId).toBe("turn-2");
    expect(result.persistenceStatus).toBe("queued_for_approval");
    expect(result.shouldExecute).toBe(false);
  });

  it("generates and persists a turn with blocked status when safety flags prevent sending", async () => {
    const mockTurn = {
      intent: "handoff_needed" as const,
      nextAction: "pause_for_owner" as const,
      confidence: 0.6,
      reply: "I need to involve our team.",
      safetyFlags: ["needs_human_review"],
      missingFields: [],
      toolCalls: [],
      statePatch: {},
      handoffBrief: "Potential complex question",
    };

    const mockRuntimeClient: Partial<HarwickAiRuntimeClient> = {
      runTurn: vi.fn().mockResolvedValue(mockTurn),
    };

    const wsId = uuidv4();
    const mockPolicy = {
      id: uuidv4(),
      workspaceId: wsId,
      scope: "workspace" as const,
      automationMode: "ai_on" as const,
      autoSendEnabled: true,
      confidenceThreshold: 0.7,
      allowedAutoActions: ["send_reply"],
      allowedAutoTools: [],
      requiresApprovalActions: [],
      requiresApprovalTools: [],
      blockedSafetyFlags: ["needs_human_review"],
    };

    const mockTurnRepository: Partial<HarwickAiTurnPersistenceRepository> = {
      insertTurn: vi.fn().mockResolvedValue({ turnId: "turn-3" }),
    };

    const mockPolicyRepository: Partial<HarwickAiAutomationPolicyRepository> = {
      resolveEffectivePolicy: vi.fn().mockResolvedValue(mockPolicy),
    };

    const service = createHarwickAiTurnGeneratorService({
      runtimeClient: mockRuntimeClient as HarwickAiRuntimeClient,
      turnRepository: mockTurnRepository as HarwickAiTurnPersistenceRepository,
      policyRepository: mockPolicyRepository as HarwickAiAutomationPolicyRepository,
    });

    const result = await service.generateAndPersistTurn({
      workspaceId: wsId,
      leadId: uuidv4(),
      socialReplyReviewId: null,
      providerThreadId: "thread-789",
      channel: "facebook_dm",
      inboundText: "Can you help me with my mortgage?",
      context: {
        conversationHistory: [],
        workspaceName: "Acme Realty",
        toneProfile: {},
        listingContext: null,
        calendarContext: [],
        postContext: null,
      },
    });

    expect(result.turnId).toBe("turn-3");
    expect(result.persistenceStatus).toBe("blocked");
    expect(result.shouldExecute).toBe(false);
  });
});
