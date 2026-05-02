import { describe, expect, it } from "vitest";
import { evaluateHarwickAiAutomation } from "./harwick-ai-automation-policy.js";
import type { HarwickAiTurn } from "./harwick-ai-runtime.js";

const safeTurn: HarwickAiTurn = {
  intent: "listing_question",
  nextAction: "ask_qualification",
  missingFields: ["timeline"],
  confidence: 0.91,
  safetyFlags: ["safe_to_send"],
  reply: "I can send details. Are you looking to move soon?",
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
    tool: "send_meta_dm",
    reason: "continue qualification in DM",
    requiresApproval: false,
    payload: { reply: "I can send details. Are you looking to move soon?" },
  }],
};

describe("evaluateHarwickAiAutomation", () => {
  it("allows auto-send for safe high-confidence qualification turns", () => {
    expect(evaluateHarwickAiAutomation({
      turn: safeTurn,
      policy: {
        autoSendEnabled: true,
        confidenceThreshold: 0.8,
      },
    })).toMatchObject({
      canAutoExecute: true,
      approvedTools: ["send_meta_dm"],
      blockedTools: [],
    });
  });

  it("blocks auto-send when the conversation is in human takeover", () => {
    expect(evaluateHarwickAiAutomation({
      turn: safeTurn,
      policy: {
        automationMode: "human_takeover",
      },
    })).toMatchObject({
      canAutoExecute: false,
      blockedTools: ["send_meta_dm"],
    });
  });

  it("blocks safety risks even when auto-send is enabled", () => {
    expect(evaluateHarwickAiAutomation({
      turn: {
        ...safeTurn,
        safetyFlags: ["needs_human_review", "lending_advice"],
      },
      policy: {
        autoSendEnabled: true,
      },
    })).toMatchObject({
      canAutoExecute: false,
      reason: "safety flag needs_human_review requires human review.",
    });
  });

  it("blocks approval-gated showing tools by default", () => {
    expect(evaluateHarwickAiAutomation({
      turn: {
        ...safeTurn,
        nextAction: "request_showing_approval",
        toolCalls: [{
          tool: "request_showing_approval",
          reason: "agent approval required",
          requiresApproval: true,
          payload: {},
        }],
      },
      policy: {
        autoSendEnabled: true,
      },
    })).toMatchObject({
      canAutoExecute: false,
      blockedTools: ["request_showing_approval"],
    });
  });
});
