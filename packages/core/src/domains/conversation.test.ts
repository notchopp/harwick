import { describe, expect, it } from "vitest";
import { ConversationsInboxResponseSchema } from "./conversation.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const leadId = "22222222-2222-4222-8222-222222222222";
const reviewId = "33333333-3333-4333-8333-333333333333";

describe("conversation contracts", () => {
  it("validates live conversation inbox responses", () => {
    const parsed = ConversationsInboxResponseSchema.parse({
      workspaceId,
      threads: [
        {
          id: leadId,
          workspaceId,
          leadId,
          reviewId,
          name: "Marcus Thompson",
          initials: "MT",
          lastTouchLabel: "2m",
          unread: false,
          preview: "Is this still available?",
          source: "instagram",
          sourceLabel: "Instagram",
          channelLabel: "Comment",
          sourceContext: "Instagram comment thread",
          bucket: "comments",
          assignedTo: "Sarah Kim",
          stageLabel: "New",
          stageTone: "new",
          score: 87,
          scoreLabel: "87 / 100",
          followUpBossContactId: null,
          intentType: "Purchase",
          area: "Coral Gables",
          timeline: "Unknown",
          budget: "Unknown",
          listingTitle: "Buyer search · Coral Gables",
          listingDetails: "Instagram Comment · last touch 2m",
          listingStatus: "AI action ready",
          automationMode: "ai_on",
          automationReason: "safe listing reply",
          aiSynthesis: {
            turnId: "44444444-4444-4444-8444-444444444444",
            status: "auto_executed",
            intent: "listing_question",
            nextAction: "ask_qualification",
            confidence: 0.91,
            missingFields: ["timeline"],
            safetyFlags: ["safe_to_send"],
            handoffBrief: null,
            documentUpdate: "Lead asked whether the listing is still available.",
            updatedAt: "2026-04-30T12:15:00.000Z",
          },
          messages: [
            {
              id: "event-1",
              kind: "lead",
              body: "Is this still available?",
              meta: "10:14 AM · Instagram Comment",
              occurredAt: "2026-04-30T12:14:00.000Z",
            },
            {
              id: "review-1",
              kind: "ai_action",
              body: "Yes, still available.",
              meta: "AI Action — Ready for approval",
              occurredAt: "2026-04-30T12:15:00.000Z",
            },
          ],
        },
      ],
    });

    expect(parsed.threads[0]?.messages[1]?.kind).toBe("ai_action");
    expect(parsed.threads[0]?.aiSynthesis?.missingFields).toEqual(["timeline"]);
  });

  it("rejects invalid conversation buckets", () => {
    expect(() => ConversationsInboxResponseSchema.parse({
      workspaceId,
      threads: [{
        id: leadId,
        workspaceId,
        leadId,
        reviewId: null,
        name: "Marcus Thompson",
        initials: "MT",
        lastTouchLabel: "2m",
        unread: false,
        preview: "Is this still available?",
        source: "instagram",
        sourceLabel: "Instagram",
        channelLabel: "Comment",
        sourceContext: "Instagram comment thread",
        bucket: "calls",
        assignedTo: "Sarah Kim",
        stageLabel: "New",
        stageTone: "new",
        score: 87,
        scoreLabel: "87 / 100",
        followUpBossContactId: null,
        intentType: "Purchase",
        area: "Coral Gables",
        timeline: "Unknown",
        budget: "Unknown",
        listingTitle: "Buyer search · Coral Gables",
        listingDetails: "Instagram Comment · last touch 2m",
        listingStatus: "AI action ready",
        automationMode: null,
        automationReason: null,
        messages: [],
      }],
    })).toThrow();
  });
});
