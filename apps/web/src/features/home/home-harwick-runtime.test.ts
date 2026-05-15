import { describe, expect, it, vi } from "vitest";
import type { HarwickAiAutomationPolicy, HarwickAiRuntimeInput, HarwickAiTurn } from "@realty-ops/core";
import type { AgentTrajectoryStore } from "../../lib/supabase/agent-trajectory-store";
import type { ConversationMessageRepository } from "../../lib/supabase/conversation-messages";
import type { LeadDocumentRepository } from "../../lib/supabase/lead-document";
import type { WorkspaceMemoryRepository } from "../../lib/supabase/workspace-memory";
import { createHomeHarwickRuntimeService } from "./home-harwick-runtime";

vi.mock("../../lib/server-env", () => ({
  getServerEnvironment: () => ({
    OPENAI_API_KEY: undefined,
  }),
}));

const basePolicy: HarwickAiAutomationPolicy = {
  id: null,
  workspaceId: null,
  memberId: null,
  leadId: null,
  scope: "workspace",
  automationMode: "ai_on",
  autoSendEnabled: true,
  confidenceThreshold: 0.5,
  allowedAutoActions: ["send_reply", "ask_qualification", "move_comment_to_dm", "send_buyer_blueprint", "dispatch_subagent"],
  allowedAutoTools: ["send_meta_message", "dispatch_subagent"],
  requiresApprovalActions: ["offer_showing", "request_showing_approval", "register_open_house", "route_lead", "handoff_to_agent", "pause_for_owner", "do_not_reply"],
  requiresApprovalTools: ["check_calendar", "request_showing_approval", "register_open_house", "route_lead", "sync_follow_up_boss", "pause_automation"],
  blockedSafetyFlags: ["needs_human_review", "human_takeover", "legal_advice", "lending_advice", "contract_advice", "valuation_claim", "claims_listing_availability", "claims_financing_certainty", "low_confidence"],
};

describe("home Harwick runtime", () => {
  it("routes the home assistant through the shared Harwick runtime and queues subagents", async () => {
    // The runtime now does multi-step natively via ai-sdk's stopWhen, so the
    // outer agentic loop is a single iteration. The test mocks runTurn to
    // return one consolidated turn — what the model would have produced after
    // its internal multi-step chain (dispatch_subagent then the final reply).
    const runTurn = vi.fn<(input: HarwickAiRuntimeInput) => Promise<HarwickAiTurn>>()
      .mockResolvedValueOnce({
          intent: "general_follow_up",
          nextAction: "dispatch_subagent",
          missingFields: [],
          confidence: 0.88,
          safetyFlags: ["safe_to_send"],
          reply: "I queued a routing subagent and consolidated the current desk pressure into one brief.",
          statePatch: {
            currentIntent: null,
            leadType: null,
            intent: null,
            timeline: null,
            budget: null,
            targetArea: null,
            propertyType: null,
            financingStatus: null,
            knownFacts: [],
          },
          handoffBrief: null,
          toolCalls: [{
            tool: "dispatch_subagent",
            reason: "gather a tighter routing recommendation",
            requiresApproval: false,
            payload: {
              subagentType: "routing",
              title: "Review routing fit",
              instructions: "Review today's routing pressure and recommend the best owner action.",
            },
          }],
          selfGateAutoExecute: true,
          selfGateReason: "internal workspace analysis is allowed.",
          documentUpdate: "",
          endTurn: true,
        } satisfies HarwickAiTurn);
    const runtime = {
      runTurn,
    };

    const trajectoryStore: AgentTrajectoryStore = {
      startTrajectory: vi.fn().mockResolvedValue({ trajectoryId: "traj-1" }),
      appendStep: vi.fn().mockResolvedValue({ stepId: "step-1" }),
      completeTrajectory: vi.fn().mockResolvedValue(undefined),
      recordOutcome: vi.fn(),
      saveTrajectoryEmbedding: vi.fn(),
      saveStepEmbedding: vi.fn(),
      loadThreadHistory: vi.fn().mockResolvedValue([]),
    };
    const conversationRepository: ConversationMessageRepository = {
      getMessagesByLeadId: vi.fn().mockResolvedValue([]),
      insertMessage: vi.fn(),
      updateMessageStatus: vi.fn(),
    };
    const leadDocumentRepository: LeadDocumentRepository = {
      read: vi.fn().mockResolvedValue(null),
      appendUpdate: vi.fn(),
    };
    const workspaceMemoryRepository: WorkspaceMemoryRepository = {
      insertMemoryDocument: vi.fn(),
      findRecentMemoryByTitle: vi.fn(),
      listRuntimeMemoryDocuments: vi.fn().mockResolvedValue([]),
      listReviewableMemoryDocuments: vi.fn(),
      updateMemoryReview: vi.fn(),
      semanticMemorySearch: vi.fn().mockResolvedValue([]),
      saveMemoryEmbedding: vi.fn(),
      listRoutingOverrideSignals: vi.fn(),
      listOperatorFeedbackSignals: vi.fn(),
      listLeadOutcomeSignals: vi.fn(),
      listMarketSignals: vi.fn(),
      listSourceChannelSignals: vi.fn(),
      listObjectionSignals: vi.fn(),
    };

    const service = createHomeHarwickRuntimeService({
      supabase: {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      } as never,
      runtime,
      policyRepository: {
        resolveEffectivePolicy: vi.fn().mockResolvedValue(basePolicy),
      },
      policyNarrativeRepository: {
        read: vi.fn().mockResolvedValue("Safe internal analysis can auto-run; external sends still need policy checks."),
        readRecord: vi.fn(),
        write: vi.fn(),
      },
      conversationRepository,
      leadDocumentRepository,
      workspaceMemoryRepository,
      trajectoryStore,
      enqueueSubagentTask: vi.fn().mockResolvedValue({ taskId: "task-1" }),
      now: () => new Date("2026-05-10T12:00:00.000Z"),
    });

    const response = await service.run({
      workspaceId: "11111111-1111-1111-1111-111111111111",
      workspaceName: "Prestige Realty",
      operatorName: "Sarah",
      message: "Give me the routing brief.",
      mentions: [],
      activeLeadId: null,
      threadId: null,
      recentLeadSummaries: ["Ava: hot buyer, Bethesda, assigned Noah"],
      routingSummaries: ["Ava: routing recommendation pending Noah vs Sarah"],
      teamSummaries: ["Noah: agent, online, 3 open work"],
    });

    expect(response.answer).toContain("queued a routing subagent");
    expect(response.toolCalls[0]?.tool).toBe("dispatch_subagent");
    expect(runTurn).toHaveBeenCalledTimes(1);
    const initialInput = runTurn.mock.calls[0]?.[0];
    expect(initialInput).toBeDefined();
    if (initialInput === undefined) {
      throw new Error("Expected the runtime to receive an initial input.");
    }
    expect(initialInput.operatorContext).toBeDefined();
    if (initialInput.operatorContext === null || initialInput.operatorContext === undefined) {
      throw new Error("Expected the runtime input to include operator context.");
    }
    expect(initialInput.operatorContext.operatorName).toBe("Sarah");
    const routingLines = initialInput.operatorContext.routing ?? [];
    const firstRoutingLine = routingLines[0];
    expect(firstRoutingLine).toBeDefined();
    if (firstRoutingLine === undefined) {
      throw new Error("Expected the runtime input to include routing context.");
    }
    expect(firstRoutingLine).toContain("Noah vs Sarah");
  });

  it("rewrites workspace approval answers so queued routing is not presented as completed", async () => {
    const runtime = {
      runTurn: vi.fn<(input: HarwickAiRuntimeInput) => Promise<HarwickAiTurn>>().mockResolvedValue({
        intent: "general_follow_up",
        nextAction: "route_lead",
        missingFields: [],
        confidence: 1,
        safetyFlags: [],
        reply: "Routing all recent leads to you now.",
        statePatch: {
          currentIntent: null,
          leadType: null,
          intent: null,
          timeline: null,
          budget: null,
          targetArea: null,
          propertyType: null,
          financingStatus: null,
          knownFacts: [],
        },
        handoffBrief: null,
        toolCalls: [{
          tool: "route_lead",
          reason: "Owner requested routing of all leads.",
          requiresApproval: false,
          payload: {},
        }],
        selfGateAutoExecute: true,
        selfGateReason: "Routing is a standard process based on operator request.",
        documentUpdate: "",
        endTurn: true,
      }),
    };

    const service = createHomeHarwickRuntimeService({
      supabase: {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      } as never,
      runtime,
      policyRepository: {
        resolveEffectivePolicy: vi.fn().mockResolvedValue(basePolicy),
      },
      policyNarrativeRepository: {
        read: vi.fn().mockResolvedValue("Safe internal analysis can auto-run; external sends still need policy checks."),
        readRecord: vi.fn(),
        write: vi.fn(),
      },
      conversationRepository: {
        getMessagesByLeadId: vi.fn().mockResolvedValue([]),
        insertMessage: vi.fn(),
        updateMessageStatus: vi.fn(),
      },
      leadDocumentRepository: {
        read: vi.fn().mockResolvedValue(null),
        appendUpdate: vi.fn(),
      },
      workspaceMemoryRepository: {
        insertMemoryDocument: vi.fn(),
        findRecentMemoryByTitle: vi.fn(),
        listRuntimeMemoryDocuments: vi.fn().mockResolvedValue([]),
        listReviewableMemoryDocuments: vi.fn(),
        updateMemoryReview: vi.fn(),
        semanticMemorySearch: vi.fn().mockResolvedValue([]),
        saveMemoryEmbedding: vi.fn(),
        listRoutingOverrideSignals: vi.fn(),
        listOperatorFeedbackSignals: vi.fn(),
        listLeadOutcomeSignals: vi.fn(),
        listMarketSignals: vi.fn(),
        listSourceChannelSignals: vi.fn(),
        listObjectionSignals: vi.fn(),
      },
      trajectoryStore: {
        startTrajectory: vi.fn().mockResolvedValue({ trajectoryId: "traj-1" }),
        appendStep: vi.fn().mockResolvedValue({ stepId: "step-1" }),
        completeTrajectory: vi.fn().mockResolvedValue(undefined),
        recordOutcome: vi.fn(),
        saveTrajectoryEmbedding: vi.fn(),
        saveStepEmbedding: vi.fn(),
        loadThreadHistory: vi.fn().mockResolvedValue([]),
      },
      enqueueSubagentTask: vi.fn().mockResolvedValue({ taskId: "task-1" }),
      now: () => new Date("2026-05-10T12:00:00.000Z"),
    });

    const response = await service.run({
      workspaceId: "11111111-1111-1111-1111-111111111111",
      workspaceName: "Prestige Realty",
      operatorName: "Sarah",
      message: "Route them all to me.",
      mentions: [],
      activeLeadId: null,
      threadId: null,
      recentLeadSummaries: ["Ava — Owner review · Instagram DM · last touch 2m ago · needs routing"],
      routingSummaries: ["Ava — recommend owner review · why qualification is still pending"],
      teamSummaries: ["Sarah — owner · online · 2 open work"],
    });

    expect(response.answer).toBe("Queued the proposed routing change for review. Check the route card before anything is reassigned.");
    expect(response.toolCalls[0]?.tool).toBe("route_lead");
  });
});
