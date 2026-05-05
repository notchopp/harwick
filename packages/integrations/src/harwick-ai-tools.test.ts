import { describe, expect, it, vi } from "vitest";
import { buildHarwickToolCatalogPrompt, HARWICK_AI_TOOL_NAMES } from "./harwick-ai-tool-registry.js";
import { executeHarwickAiToolCalls, executeHarwickAiTurnWithPolicy } from "./harwick-ai-tools.js";

describe("executeHarwickAiToolCalls", () => {
  it("executes safe tools through injected handlers", async () => {
    const handler = vi.fn().mockResolvedValue({ messageId: "meta-1" });

    await expect(executeHarwickAiToolCalls({
      toolCalls: [{
        tool: "send_meta_reply",
        reason: "answer the comment",
        requiresApproval: false,
        payload: { reply: "Yes, I can send details." },
      }],
      handlers: {
        send_meta_reply: handler,
      },
    })).resolves.toEqual([{
      tool: "send_meta_reply",
      status: "executed",
      reason: "answer the comment",
      output: { messageId: "meta-1" },
    }]);

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      tool: "send_meta_reply",
    }));
  });

  it("queues approval-gated tools until an operator approves them", async () => {
    const handler = vi.fn().mockResolvedValue({ approved: true });

    const results = await executeHarwickAiToolCalls({
      toolCalls: [{
        tool: "request_showing_approval",
        reason: "agent must approve the showing",
        requiresApproval: true,
        payload: { listing: "1234 Ocean View Dr" },
      }],
      handlers: {
        request_showing_approval: handler,
      },
    });

    expect(results).toEqual([{
      tool: "request_showing_approval",
      status: "queued_for_approval",
      reason: "agent must approve the showing",
      output: {
        payload: { listing: "1234 Ocean View Dr" },
      },
    }]);
    expect(handler).not.toHaveBeenCalled();
  });

  it("executes approval-gated tools after explicit approval", async () => {
    const handler = vi.fn().mockResolvedValue({ approvalTaskId: "task-1" });

    await expect(executeHarwickAiToolCalls({
      toolCalls: [{
        tool: "request_showing_approval",
        reason: "agent must approve the showing",
        requiresApproval: true,
        payload: { listing: "1234 Ocean View Dr" },
      }],
      handlers: {
        request_showing_approval: handler,
      },
      approvedTools: ["request_showing_approval"],
    })).resolves.toEqual([{
      tool: "request_showing_approval",
      status: "executed",
      reason: "agent must approve the showing",
      output: { approvalTaskId: "task-1" },
    }]);
  });

  it("does not execute tools blocked by policy even if the model omits requiresApproval", async () => {
    const handler = vi.fn().mockResolvedValue({ assignedMemberId: "agent-1" });

    const result = await executeHarwickAiTurnWithPolicy({
      turn: {
        intent: "buyer_qualification",
        nextAction: "route_lead",
        missingFields: [],
        confidence: 0.93,
        safetyFlags: ["safe_to_send"],
        reply: "I have enough to get you to the right person.",
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
          reason: "qualified Katy buyer should be routed",
          requiresApproval: false,
          payload: { assignedMemberId: "agent-1" },
        }],
        selfGateAutoExecute: true,
        selfGateReason: "model thought routing was allowed.",
        documentUpdate: "",
        endTurn: true,
      },
      policy: {
        autoSendEnabled: true,
      },
      handlers: {
        route_lead: handler,
      },
    });

    expect(result.automation.canAutoExecute).toBe(false);
    expect(result.automation.blockedTools).toEqual(["route_lead"]);
    expect(result.results).toEqual([{
      tool: "route_lead",
      status: "queued_for_approval",
      reason: "qualified Katy buyer should be routed",
      output: {
        payload: { assignedMemberId: "agent-1" },
      },
    }]);
    expect(handler).not.toHaveBeenCalled();
  });

  it("captures handler failures instead of aborting the turn", async () => {
    const handler = vi.fn().mockRejectedValue(new Error("Meta is unavailable"));

    await expect(executeHarwickAiToolCalls({
      toolCalls: [{
        tool: "send_meta_dm",
        reason: "continue qualification",
        requiresApproval: false,
        payload: { reply: "Are you looking this month?" },
      }],
      handlers: {
        send_meta_dm: handler,
      },
    })).resolves.toEqual([{
      tool: "send_meta_dm",
      status: "failed",
      reason: "continue qualification",
      output: {
        payload: { reply: "Are you looking this month?" },
      },
      errorCode: "handler_execution_failed",
      errorMessage: "Meta is unavailable",
    }]);
  });

  it("executes a full AI turn only when policy approves auto-send", async () => {
    const handler = vi.fn().mockResolvedValue({ messageId: "meta-2" });

    const result = await executeHarwickAiTurnWithPolicy({
      turn: {
        intent: "listing_question",
        nextAction: "ask_qualification",
        missingFields: ["timeline"],
        confidence: 0.9,
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
          reason: "continue qualification",
          requiresApproval: false,
          payload: { reply: "I can send details. Are you looking to move soon?" },
        }],
        selfGateAutoExecute: true,
        selfGateReason: "policy narrative permits autonomous send.",
        documentUpdate: "",
        endTurn: true,
      },
      policy: {
        autoSendEnabled: true,
        confidenceThreshold: 0.8,
      },
      handlers: {
        send_meta_dm: handler,
      },
    });

    expect(result.automation.canAutoExecute).toBe(true);
    expect(result.results).toEqual([{
      tool: "send_meta_dm",
      status: "executed",
      reason: "continue qualification",
      output: { messageId: "meta-2" },
    }]);
  });
});

describe("Harwick AI tool registry", () => {
  it("builds the prompt catalog from registered tool metadata", () => {
    const prompt = buildHarwickToolCatalogPrompt();

    expect(HARWICK_AI_TOOL_NAMES).toContain("dispatch_subagent");
    expect(prompt).toContain("send_meta_dm");
    expect(prompt).toContain("dispatch_subagent");
    expect(prompt).toContain("safe internal tool");
    expect(prompt).toContain("requires operator approval");
  });
});
