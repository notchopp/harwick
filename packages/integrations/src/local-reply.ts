import { type AiReplyDraft } from "@realty-ops/core";
import { z } from "zod";
import { createLocalHarwickAiRuntime, toLegacyAiReplyDraft } from "./harwick-ai-runtime.js";

// Reply-drafting input shape. Lives here (alongside the local runtime) because
// the legacy OpenAI Responses adapter that used to own this schema has been
// removed — the production lead runtime is now ai-sdk's generateObject path in
// apps/web/src/features/lead-intake/ai-sdk-runtime.ts.
export const AiReplyDraftInputSchema = z.object({
  workspaceName: z.string().trim().min(1).max(120),
  channel: z.enum(["instagram_dm", "instagram_comment", "facebook_dm", "facebook_comment"]),
  leadText: z.string().trim().min(1).max(4000),
  leadContext: z.string().trim().max(2000).nullable().default(null),
  postContext: z.object({
    caption: z.string().trim().max(8000).nullable().default(null),
    ctaLabel: z.string().trim().max(120).nullable().default(null),
    areasMentioned: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
    listingHints: z.array(z.string().trim().min(1).max(240)).max(30).default([]),
    permalink: z.string().trim().url().nullable().default(null),
  }).nullable().default(null),
  buyerBlueprintUrl: z.string().trim().url().nullable().default(null),
  listingContext: z.string().trim().max(2000).nullable().default(null),
});

export type AiReplyDraftInput = z.input<typeof AiReplyDraftInputSchema>;

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
