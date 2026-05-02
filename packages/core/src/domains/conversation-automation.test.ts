import { describe, expect, it } from "vitest";

import {
  automationModeDescription,
  automationModeLabel,
  canAutomationSend,
  ConversationAutomationControlSchema,
  ConversationAutomationScopeSchema,
} from "./conversation-automation.js";

describe("conversation automation", () => {
  it("allows outbound automation only when AI is on", () => {
    expect(canAutomationSend("ai_on")).toBe(true);
    expect(canAutomationSend("human_takeover")).toBe(false);
    expect(canAutomationSend("paused_by_rule")).toBe(false);
  });

  it("validates conversation-level automation controls", () => {
    const parsed = ConversationAutomationControlSchema.parse({
      conversationId: "123e4567-e89b-12d3-a456-426614174111",
      mode: "human_takeover",
      reason: "agent is stepping in for a showing question",
      changedByMemberId: "123e4567-e89b-12d3-a456-426614174222",
    });

    expect(parsed.mode).toBe("human_takeover");
  });

  it("validates a single lead or provider thread as the automation scope", () => {
    const parsed = ConversationAutomationScopeSchema.parse({
      workspaceId: "123e4567-e89b-12d3-a456-426614174111",
      leadId: "123e4567-e89b-12d3-a456-426614174333",
      providerAccountId: "ig-1",
      recipientUserId: "ig-user-1",
      channel: "instagram_dm",
    });

    expect(parsed.leadId).toBe("123e4567-e89b-12d3-a456-426614174333");
  });

  it("keeps labels and descriptions operator-facing", () => {
    expect(automationModeLabel("ai_on")).toBe("ai on");
    expect(automationModeDescription("human_takeover")).toContain("will not send");
  });
});
