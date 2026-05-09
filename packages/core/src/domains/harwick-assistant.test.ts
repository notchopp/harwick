import { describe, expect, it } from "vitest";
import {
  HarwickAssistantRequestSchema,
  HarwickAssistantResponseSchema,
} from "./harwick-assistant.js";

describe("Harwick assistant schemas", () => {
  it("defaults mentions and stream on requests", () => {
    expect(HarwickAssistantRequestSchema.parse({
      message: "What needs my attention?",
    })).toMatchObject({
      message: "What needs my attention?",
      mentions: [],
      stream: false,
    });
  });

  it("accepts real Harwick tool calls in responses", () => {
    expect(HarwickAssistantResponseSchema.parse({
      answer: "I would review Sarah's showing approval first.",
      followUpQuestion: null,
      reasoningSteps: [{
        label: "Read queue pressure",
        detail: "Two urgent work items are currently unresolved.",
      }],
      scope: "Workspace",
      toolCalls: [{
        tool: "dispatch_subagent",
        reason: "Gather a tighter routing recommendation before changing ownership.",
        requiresApproval: true,
        payload: {
          subagentType: "routing",
          title: "Review routing fit",
        },
      }],
    }).toolCalls).toHaveLength(1);
  });
});
