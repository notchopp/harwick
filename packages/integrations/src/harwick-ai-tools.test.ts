import { describe, expect, it, vi } from "vitest";
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
