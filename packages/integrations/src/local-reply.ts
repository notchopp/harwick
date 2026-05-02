import { type AiReplyDraft } from "@realty-ops/core";
import { createLocalHarwickAiRuntime, toLegacyAiReplyDraft } from "./harwick-ai-runtime.js";
import {
  AiReplyDraftInputSchema,
  type AiReplyDraftInput,
} from "./openai-reply.js";

export function createLocalReplyClient() {
  const runtime = createLocalHarwickAiRuntime();

  return {
    async draftReply(input: AiReplyDraftInput): Promise<AiReplyDraft> {
      const parsed = AiReplyDraftInputSchema.parse(input);
      const contextParts = (parsed.leadContext ?? "")
        .split("•")
        .map((part) => part.trim())
        .filter((part) => part.length > 0 && part !== "Unknown");
      const turn = await runtime.runTurn({
        workspaceName: parsed.workspaceName,
        channel: parsed.channel,
        inboundText: parsed.leadText,
        conversation: [],
        state: {
          workspaceId: null,
          leadId: null,
          providerThreadId: null,
          channel: parsed.channel,
          automationMode: "ai_on",
          currentIntent: "qualification_in_progress",
          qualification: {
            name: null,
            phone: null,
            email: null,
            leadType: contextParts[0]?.toLowerCase().includes("sell") ? "seller" : "buyer",
            intent: "unknown",
            timeline: contextParts[2] ?? null,
            budget: contextParts[3] ?? null,
            targetArea: parsed.postContext?.areasMentioned[0] ?? contextParts[1] ?? null,
            propertyType: null,
            financingStatus: "unknown",
            score: 0,
          },
          knownFacts: contextParts,
          lastAiAction: null,
          assignedAgentName: null,
          sourceOwnerName: null,
        },
        toneProfile: {
          name: `${parsed.workspaceName} default`,
          voice: "warm, concise, professional, and human",
          bannedPhrases: [],
          preferredPhrases: [],
          emojiPolicy: "none",
          signature: null,
        },
        postContext: parsed.postContext,
        listingContext: parsed.listingContext === null ? null : {
          listingId: null,
          label: parsed.listingContext,
          address: null,
          price: null,
          status: null,
          beds: null,
          baths: null,
          area: parsed.postContext?.areasMentioned[0] ?? null,
          facts: [parsed.listingContext],
          lastVerifiedAt: null,
        },
        calendarContext: [],
        buyerBlueprintUrl: parsed.buyerBlueprintUrl,
      });

      return toLegacyAiReplyDraft(turn);
    },
  };
}
