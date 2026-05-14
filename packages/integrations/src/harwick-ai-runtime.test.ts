import { describe, expect, it } from "vitest";
import {
  createLocalHarwickAiRuntime,
  toLegacyAiReplyDraft,
} from "./harwick-ai-runtime.js";

describe("Harwick AI runtime", () => {
  it("plans a showing approval tool call with calendar context", async () => {
    const runtime = createLocalHarwickAiRuntime();

    const turn = await runtime.runTurn({
      workspaceName: "Prestige Realty",
      channel: "instagram_dm",
      inboundText: "Can I see this one this weekend?",
      state: {
        workspaceId: null,
        leadId: null,
        providerThreadId: "ig-thread-1",
        channel: "instagram_dm",
        automationMode: "ai_on",
        currentIntent: "qualification_in_progress",
        qualification: {
          name: null,
          phone: null,
          email: null,
          leadType: "buyer",
          intent: "high",
          timeline: "this weekend",
          budget: "$450k-$520k",
          targetArea: "Coral Gables",
          propertyType: "single family",
          financingStatus: "unknown",
          score: 76,
        },
        knownFacts: [],
        lastAiAction: null,
        assignedAgentName: "Sarah K.",
        sourceOwnerName: "Ademola",
      },
      listingContext: {
        listingId: "listing-1",
        label: "1234 Ocean View Dr",
        address: "1234 Ocean View Dr",
        price: "$2,450,000",
        status: "active",
        beds: "4",
        baths: "3.5",
        area: "Coral Gables",
        facts: ["price dropped last week"],
        lastVerifiedAt: null,
      },
      calendarContext: [{
        agentId: null,
        agentName: "Sarah K.",
        showingMode: "request_approve",
        availableWindows: ["Saturday 2 PM", "Sunday 11 AM"],
      }],
    });

    expect(turn.nextAction).toBe("request_showing_approval");
    expect(turn.toolCalls.map((toolCall) => toolCall.tool)).toContain("check_calendar");
    expect(turn.toolCalls.map((toolCall) => toolCall.tool)).toContain("request_showing_approval");
    expect(turn.handoffBrief).toContain("showing request");
  });

  it("keeps a comment public-safe while planning Meta reply delivery", async () => {
    const runtime = createLocalHarwickAiRuntime();

    const turn = await runtime.runTurn({
      workspaceName: "Prestige Realty",
      channel: "instagram_comment",
      inboundText: "price?",
      postContext: {
        caption: "Coral Gables family home with pool.",
        ctaLabel: null,
        areasMentioned: ["Coral Gables"],
        listingHints: ["$998k", "4bd / 3ba"],
        permalink: null,
      },
    });

    expect(turn.nextAction).toBe("move_comment_to_dm");
    expect(turn.reply).toContain("$998k");
    expect(turn.toolCalls).toMatchObject([
      { tool: "send_meta_message", payload: { target: "comment" } },
      { tool: "send_meta_message", payload: { target: "dm" } },
    ]);
  });

  it("maps runtime turns into the legacy draft shape while callers migrate", async () => {
    const runtime = createLocalHarwickAiRuntime();
    const turn = await runtime.runTurn({
      workspaceName: "Prestige Realty",
      channel: "facebook_dm",
      inboundText: "How much down payment do I need?",
    });

    expect(toLegacyAiReplyDraft(turn)).toMatchObject({
      intent: "financing_question",
      nextAction: "ask_qualification",
      policyFlags: ["safe_to_send"],
    });
  });
});
