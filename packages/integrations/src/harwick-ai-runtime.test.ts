import { describe, expect, it, vi } from "vitest";
import {
  createLocalHarwickAiRuntime,
  createOpenAIHarwickAiRuntime,
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

  it("sends the full runtime contract to OpenAI", async () => {
    const response = {
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        output_text: JSON.stringify({
          intent: "listing_question",
          nextAction: "ask_qualification",
          missingFields: ["timeline"],
          confidence: 0.9,
          safetyFlags: ["safe_to_send"],
          reply: "That home is listed at $998k. Are you looking to move soon?",
          statePatch: {
            currentIntent: "listing_question",
            leadType: "buyer",
            intent: "medium",
            timeline: null,
            budget: "$998k",
            targetArea: "Coral Gables",
            propertyType: null,
            financingStatus: null,
            knownFacts: ["$998k"],
          },
          handoffBrief: null,
          toolCalls: [{
            tool: "send_meta_message",
            reason: "answer the public comment",
            requiresApproval: false,
            payload: { reply: "That home is listed at $998k. Are you looking to move soon?", target: "comment" },
          }],
        }),
      }),
      text: vi.fn().mockResolvedValue(""),
    };
    const fetchImpl = vi.fn().mockResolvedValue(response);
    const runtime = createOpenAIHarwickAiRuntime({
      apiKey: "openai-key",
      model: "gpt-5.2",
      fetchImpl,
    });

    await expect(runtime.runTurn({
      workspaceName: "Prestige Realty",
      channel: "instagram_comment",
      inboundText: "price?",
      workspaceMemory: "Routing pattern: Noah often closes high-budget Katy buyers.",
      postContext: {
        caption: "Coral Gables family home.",
        ctaLabel: null,
        areasMentioned: ["Coral Gables"],
        listingHints: ["$998k"],
        permalink: null,
      },
    })).resolves.toMatchObject({
      nextAction: "ask_qualification",
      toolCalls: [{ tool: "send_meta_message" }],
    });

    const [, requestInit] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const requestBody = JSON.parse(requestInit.body as string) as Record<string, unknown>;
    expect(JSON.stringify(requestBody)).toContain("Harwick AI");
    expect(JSON.stringify(requestBody)).toContain("toolCalls");
    expect(JSON.stringify(requestBody)).toContain("WORKSPACE MEMORY");
    expect(JSON.stringify(requestBody)).toContain("Noah often closes high-budget Katy buyers");
    expect(JSON.stringify(requestBody)).toContain("original comment thread");
    expect(JSON.stringify(requestBody)).toContain("emit two send_meta_message tool calls");
  });

  it("adds operator-mode instructions when the shared runtime serves internal UI requests", async () => {
    const response = {
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        output_text: JSON.stringify({
          intent: "general_follow_up",
          nextAction: "dispatch_subagent",
          missingFields: [],
          confidence: 0.84,
          safetyFlags: ["safe_to_send"],
          reply: "I queued a routing subagent and pulled the current desk pressure into one brief.",
          statePatch: {},
          handoffBrief: null,
          toolCalls: [{
            tool: "dispatch_subagent",
            reason: "gather a tighter routing recommendation before changing ownership",
            requiresApproval: false,
            payload: {
              subagentType: "routing",
              title: "Review routing fit",
            },
          }],
        }),
      }),
      text: vi.fn().mockResolvedValue(""),
    };
    const fetchImpl = vi.fn().mockResolvedValue(response);
    const runtime = createOpenAIHarwickAiRuntime({
      apiKey: "openai-key",
      model: "gpt-5.2",
      fetchImpl,
    });

    await runtime.runTurn({
      workspaceName: "Prestige Realty",
      channel: "instagram_dm",
      inboundText: "Give me the routing brief.",
      operatorContext: {
        operatorName: "Sarah",
        requestMode: "workspace_command",
        requestScope: "workspace",
        recentLeads: ["Ava: hot buyer, Bethesda, assigned Noah"],
        routing: ["Ava: routing recommendation pending Noah vs Sarah"],
        team: ["Noah: agent, online, 3 open work"],
        activeLeadSummary: null,
      },
    });

    const [, requestInit] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const requestBody = JSON.parse(requestInit.body as string) as Record<string, unknown>;
    expect(JSON.stringify(requestBody)).toContain("OPERATOR MODE");
    expect(JSON.stringify(requestBody)).toContain("routing recommendation pending Noah vs Sarah");
    expect(JSON.stringify(requestBody)).toContain("Answer the operator, not the lead");
    expect(JSON.stringify(requestBody)).toContain("THIS MODE OVERRIDES RULES 1-4");
    expect(JSON.stringify(requestBody)).toContain("NEVER reply with 'Not related to real estate' in OPERATOR MODE");
    expect(JSON.stringify(requestBody)).toContain("INFO-DUMP IS BANNED");
    expect(JSON.stringify(requestBody)).toContain("Treat operator greetings and short check-ins like 'yo', 'hey', 'morning', or 'what needs me?' as valid workspace commands");
    expect(JSON.stringify(requestBody)).toContain("never produce phrases like 'assigned unassigned'");
    expect(JSON.stringify(requestBody)).toContain("If a requested routing or reassignment still needs approval, describe it as proposed or queued review");
    expect(JSON.stringify(requestBody)).toContain("Every toolCalls item must be shaped exactly as { tool, reason, requiresApproval, payload }");
    expect(JSON.stringify(requestBody)).toContain("Resolve operator pronouns from context");
  });

  it("normalizes malformed tool calls from operator-mode routing responses", async () => {
    const response = {
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        output_text: JSON.stringify({
          intent: "general_follow_up",
          nextAction: "route_lead",
          missingFields: [],
          confidence: 1,
          safetyFlags: [],
          reply: "I queued the routing change for review.",
          statePatch: {},
          handoffBrief: null,
          toolCalls: [{
            assignedMemberId: "owner",
            reason: "Routing all leads to the owner as requested.",
          }],
          selfGateAutoExecute: true,
          selfGateReason: "Routing request does not require operator approval.",
          documentUpdate: "",
          endTurn: true,
        }),
      }),
      text: vi.fn().mockResolvedValue(""),
    };
    const fetchImpl = vi.fn().mockResolvedValue(response);
    const runtime = createOpenAIHarwickAiRuntime({
      apiKey: "openai-key",
      model: "gpt-5.2",
      fetchImpl,
    });

    await expect(runtime.runTurn({
      workspaceName: "Prestige Realty",
      channel: "instagram_dm",
      inboundText: "route them all to me",
      operatorContext: {
        operatorName: "Sarah",
        requestMode: "workspace_command",
        requestScope: "workspace",
        recentLeads: ["Ava — Owner review · Instagram DM · last touch 2m ago · needs routing"],
        routing: [],
        team: [],
        activeLeadSummary: null,
      },
    })).resolves.toMatchObject({
      nextAction: "route_lead",
      toolCalls: [{
        tool: "route_lead",
        reason: "Routing all leads to the owner as requested.",
        requiresApproval: true,
        payload: {
          assignedMemberId: "owner",
        },
      }],
    });
  });
});
