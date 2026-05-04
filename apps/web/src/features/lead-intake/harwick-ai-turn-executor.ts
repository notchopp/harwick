import {
  type NormalizedLeadEvent,
  HarwickAiRuntimeInputSchema,
  HarwickAiAutomationDecisionSchema,
  buildPersistedHarwickAiToolCalls,
  deriveHarwickAiTurnPersistenceStatus,
  evaluateHarwickAiAutomation,
  type HarwickAiPersistedTurn,
} from "@realty-ops/core";
import { createOpenAIHarwickAiRuntime, createMetaMessagingClient } from "@realty-ops/integrations";
import type {
  HarwickAiTurnPersistenceRepository,
  HarwickAiAutomationPolicyRepository,
} from "../../lib/supabase/harwick-ai-turns";
import type { LeadEventPersistenceRepository } from "../../lib/supabase/lead-events";
import type { RealtyOpsSupabaseClient } from "../../lib/supabase/server-client";
import { sendMetaReply } from "../integrations/meta-reply-send";
import { createSupabaseMetaCredentialRepository } from "../../lib/supabase/integration-accounts";
import type { SocialReplyQueueRepository } from "../operator-queues/operator-queues";
import { createSupabaseConversationMessageRepository } from "../../lib/supabase/conversation-messages";
import { loadAiConversationHistory } from "./harwick-ai-conversation-history";

export type GenerateAndExecuteHarwickAiTurnParams = {
  workspaceId: string;
  leadId: string;
  leadEventId: string;
  event: NormalizedLeadEvent;
};

export type HarwickAiExecutorDependencies = {
  supabase: RealtyOpsSupabaseClient;
  turnRepository: HarwickAiTurnPersistenceRepository;
  policyRepository: HarwickAiAutomationPolicyRepository;
  leadEventRepository: LeadEventPersistenceRepository;
  queueRepository: SocialReplyQueueRepository;
  runtimeClient: ReturnType<typeof createOpenAIHarwickAiRuntime>;
  credentialSecret: string | undefined;
};

/**
 * Synchronously generates and executes AI turn for a conversation.
 * If automation policy allows, sends reply immediately.
 * This replaces the async job queue for immediate, live AI responses.
 */
export async function generateAndExecuteHarwickAiTurnSync(
  params: GenerateAndExecuteHarwickAiTurnParams,
  deps: HarwickAiExecutorDependencies,
): Promise<void> {
  // Only process DM and comment channels
  const validChannels = [
    "instagram_dm",
    "instagram_comment",
    "facebook_dm",
    "facebook_comment",
  ] as const;

  if (!validChannels.includes(params.event.sourceChannel as typeof validChannels[number])) {
    return;
  }

  const channel = params.event.sourceChannel as typeof validChannels[number];

  if (!params.event.text || !params.event.providerAccountId || !params.event.providerUserId) {
    return;
  }

  try {
    // Resolve automation policy
    const automationPolicy = await deps.policyRepository.resolveEffectivePolicy({
      workspaceId: params.workspaceId,
      memberId: null,
      leadId: params.leadId,
    });

    // Hydrate prior conversation messages so the AI has memory of the thread.
    // Without this, every turn is generated as if it's the first — breaking
    // the north-star promise of "picks up exactly where it left off".
    const conversationRepo = createSupabaseConversationMessageRepository(deps.supabase);
    const conversationHistory = await loadAiConversationHistory({
      leadId: params.leadId,
      repository: conversationRepo,
    });

    const runtimeInput = HarwickAiRuntimeInputSchema.parse({
      workspaceName: "Workspace",
      channel,
      inboundText: params.event.text,
      conversation: conversationHistory,
      state: null,
      toneProfile: {},
      postContext: null,
      listingContext: null,
      calendarContext: [],
      buyerBlueprintUrl: null,
    });

    // Run AI synchronously
    const turn = await deps.runtimeClient.runTurn(runtimeInput);

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
      isExecuted: automationDecision.canAutoExecute,
      hasExecutionFailure: false,
    });

    // Persist turn
    const persistedTurn: HarwickAiPersistedTurn = {
      workspaceId: params.workspaceId,
      leadId: params.leadId,
      socialReplyReviewId: null,
      providerThreadId: params.event.providerUserId,
      channel,
      runtimeInput,
      turn,
      automationPolicy,
      automationDecision,
      status: persistenceStatus,
      toolCalls: persistedToolCalls,
    };

    const { turnId } = await deps.turnRepository.insertTurn(persistedTurn);

    // If automation allows and has approved send tool, execute immediately
    if (
      automationDecision.canAutoExecute
      && automationDecision.approvedTools.includes("send_meta_dm")
      && turn.reply
    ) {
      if (!deps.credentialSecret) {
        console.warn("Skipping auto-send: CREDENTIAL_ENCRYPTION_KEY not set");
        return;
      }

      try {
        const sendResult = await sendMetaReply({
          request: {
            workspaceId: params.workspaceId,
            leadId: params.leadId,
            providerAccountId: params.event.providerAccountId,
            channel,
            recipientUserId: params.event.providerUserId,
            sourceCommentId: params.event.sourceCommentId,
            sourcePostId: params.event.sourcePostId,
            reply: turn.reply,
            automationMode: "ai_on",
          },
          credentialSecret: deps.credentialSecret,
          credentialRepository: createSupabaseMetaCredentialRepository(deps.supabase),
          leadEventRepository: deps.leadEventRepository,
          metaClient: createMetaMessagingClient(),
          conversationMessageRepository: conversationRepo,
          senderType: "ai",
        });

        if (sendResult.status === 200) {
          // Mark turn as auto-executed
          await deps.turnRepository.updateTurnStatus(turnId, "auto_executed");
        } else {
          console.error("Failed to auto-send reply:", sendResult.body.error);
        }
      } catch (sendError) {
        console.error("Auto-send error:", sendError);
      }
    }
  } catch (error) {
    console.error("Harwick AI turn generation error:", error);
    // Don't throw - let webhook continue even if AI fails
  }
}
