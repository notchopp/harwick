import { describe, expect, it } from "vitest";
import {
  buildPersistedHarwickAiToolCalls,
  deriveHarwickAiTurnPersistenceStatus,
  deriveHarwickAiToolPolicyStatus,
} from "./harwick-ai-persistence.js";

describe("harwick ai persistence helpers", () => {
  it("keeps approved but unexecuted turns as drafted", () => {
    expect(deriveHarwickAiTurnPersistenceStatus({
      automationDecision: {
        canAutoExecute: true,
        approvedTools: ["send_meta_reply"],
        blockedTools: [],
        reason: "policy allows this turn to auto-send.",
      },
    })).toBe("drafted");
  });

  it("marks executed approved turns as auto executed", () => {
    expect(deriveHarwickAiTurnPersistenceStatus({
      automationDecision: {
        canAutoExecute: true,
        approvedTools: ["send_meta_reply"],
        blockedTools: [],
        reason: "policy allows this turn to auto-send.",
      },
      isExecuted: true,
    })).toBe("auto_executed");
  });

  it("queues blocked tool turns for approval", () => {
    expect(deriveHarwickAiTurnPersistenceStatus({
      automationDecision: {
        canAutoExecute: false,
        approvedTools: [],
        blockedTools: ["request_showing_approval"],
        reason: "tool request_showing_approval requires approval or is not allowed.",
      },
    })).toBe("queued_for_approval");
  });

  it("classifies tool policy status", () => {
    expect(deriveHarwickAiToolPolicyStatus({
      toolCall: {
        tool: "send_meta_reply",
        reason: "safe reply",
        requiresApproval: false,
        payload: {},
      },
      approvedTools: ["send_meta_reply"],
      blockedTools: [],
    })).toBe("approved");

    expect(deriveHarwickAiToolPolicyStatus({
      toolCall: {
        tool: "register_open_house",
        reason: "open house registration needs controlled flow",
        requiresApproval: true,
        payload: {},
      },
      approvedTools: [],
      blockedTools: ["register_open_house"],
    })).toBe("approval_required");
  });

  it("builds persisted tool call records from a decision", () => {
    const [toolCall] = buildPersistedHarwickAiToolCalls({
      toolCalls: [{
        tool: "send_meta_reply",
        reason: "safe qualification question",
        requiresApproval: false,
        payload: { reply: "What timeline are you working with?" },
      }],
      approvedTools: ["send_meta_reply"],
      blockedTools: [],
    });

    expect(toolCall).toMatchObject({
      tool: "send_meta_reply",
      policyStatus: "approved",
      executionStatus: "pending",
      executionOutput: {},
    });
  });
});
