import {
  HarwickAiRuntimeInputSchema,
  HarwickAiAutomationDecisionSchema,
  buildPersistedHarwickAiToolCalls,
  deriveHarwickAiTurnPersistenceStatus,
  evaluateHarwickAiAutomation,
  type HarwickAiPersistedTurn,
  type HarwickAiConversationMessage,
  type LeadSourceChannel,
} from "@realty-ops/core";
import type { HarwickAiRuntimeClient } from "@realty-ops/integrations";
import type {
  HarwickAiTurnPersistenceRepository,
  HarwickAiAutomationPolicyRepository,
} from "../../lib/supabase/harwick-ai-turns";

export type GenerateHarwickAiTurnParams = {
  workspaceId: string;
  leadId: string | null;
  socialReplyReviewId: string | null;
  providerThreadId: string | null;
  channel: LeadSourceChannel;
  inboundText: string;
  context: {
    conversationHistory: HarwickAiConversationMessage[];
    workspaceName: string;
    toneProfile: Record<string, unknown>;
    listingContext: Record<string, unknown> | null;
    calendarContext: Record<string, unknown>[];
    postContext: Record<string, unknown> | null;
  };
};

export type HarwickAiTurnGeneratorService = {
  generateAndPersistTurn(params: GenerateHarwickAiTurnParams): Promise<{
    turnId: string;
    persistenceStatus: string;
    shouldExecute: boolean;
  }>;
};

export function createHarwickAiTurnGeneratorService(params: {
  runtimeClient: HarwickAiRuntimeClient;
  turnRepository: HarwickAiTurnPersistenceRepository;
  policyRepository: HarwickAiAutomationPolicyRepository;
}): HarwickAiTurnGeneratorService {
  return {
    async generateAndPersistTurn(generateParams) {
      // Resolve effective automation policy for workspace/member/conversation
      const automationPolicy = await params.policyRepository.resolveEffectivePolicy({
        workspaceId: generateParams.workspaceId,
        memberId: null, // TODO: resolve member from lead assignment
        leadId: generateParams.leadId,
      });

      // Build runtime input
      const conversation = generateParams.context.conversationHistory.length > 0 
        ? generateParams.context.conversationHistory 
        : [];
        
      const runtimeInput = HarwickAiRuntimeInputSchema.parse({
        workspaceName: generateParams.context.workspaceName,
        channel: generateParams.channel,
        inboundText: generateParams.inboundText,
        conversation,
        state: null, // TODO: hydrate from conversation_automation_states
        toneProfile: generateParams.context.toneProfile ?? {},
        postContext: generateParams.context.postContext,
        listingContext: generateParams.context.listingContext,
        calendarContext: generateParams.context.calendarContext,
        buyerBlueprintUrl: null,
      });

      // Run Harwick AI runtime
      const turn = await params.runtimeClient.runTurn(runtimeInput);

      // Evaluate automation decision
      const automationDecision = HarwickAiAutomationDecisionSchema.parse(
        evaluateHarwickAiAutomation({
          turn,
          policy: automationPolicy,
        })
      );

      // Build persisted tool calls
      const persistedToolCalls = buildPersistedHarwickAiToolCalls({
        toolCalls: turn.toolCalls,
        approvedTools: automationDecision.approvedTools,
        blockedTools: automationDecision.blockedTools,
      });

      // Derive persistence status
      const persistenceStatus = deriveHarwickAiTurnPersistenceStatus({
        automationDecision,
        isExecuted: false,
        hasExecutionFailure: false,
      });

      // Persist turn and tool calls
      const persistedTurn: HarwickAiPersistedTurn = {
        workspaceId: generateParams.workspaceId,
        leadId: generateParams.leadId,
        socialReplyReviewId: generateParams.socialReplyReviewId,
        providerThreadId: generateParams.providerThreadId,
        channel: generateParams.channel,
        runtimeInput,
        turn,
        automationPolicy,
        automationDecision,
        status: persistenceStatus,
        toolCalls: persistedToolCalls,
      };

      const { turnId } = await params.turnRepository.insertTurn(persistedTurn);

      return {
        turnId,
        persistenceStatus,
        shouldExecute: persistenceStatus === "drafted" || persistenceStatus === "auto_executed",
      };
    },
  };
}
