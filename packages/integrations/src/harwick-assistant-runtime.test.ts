import { describe, expect, it, vi } from "vitest";
import { createOpenAIHarwickAssistantRuntime } from "./harwick-assistant-runtime.js";

describe("Harwick assistant runtime", () => {
  it("sends the live assistant contract to OpenAI and parses real tool calls", async () => {
    const response = {
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        output_text: JSON.stringify({
          answer: "Route Sarah's showing approval first, then tighten the routing context.",
          followUpQuestion: null,
          reasoningSteps: [{
            label: "Read workspace context",
            detail: "The current queue and team load point to a showing approval bottleneck.",
          }],
          scope: "Workspace",
          toolCalls: [{
            tool: "dispatch_subagent",
            reason: "Gather a routing recommendation before reassigning the lead.",
            requiresApproval: true,
            payload: JSON.stringify({
              subagentType: "routing",
              title: "Review routing fit",
            }),
          }],
        }),
      }),
      text: vi.fn().mockResolvedValue(""),
    };
    const fetchImpl = vi.fn().mockResolvedValue(response);
    const runtime = createOpenAIHarwickAssistantRuntime({
      apiKey: "openai-key",
      model: "gpt-5.2",
      fetchImpl,
    });

    await expect(runtime.run({
      workspaceName: "Prestige Realty",
      operatorName: "Jordan",
      message: "What should I review first?",
      mentions: [],
      recentLeads: ["Sarah: hot Instagram DM, waiting on showing approval."],
      routing: ["Michael: routing suggests Noah due to Katy fit."],
      team: ["Noah: agent, available, 2 open work items."],
    })).resolves.toMatchObject({
      scope: "Workspace",
      toolCalls: [{
        tool: "dispatch_subagent",
        payload: {
          subagentType: "routing",
          title: "Review routing fit",
        },
      }],
    });

    const [, requestInit] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const requestBody = JSON.parse(requestInit.body as string) as Record<string, unknown>;
    expect(JSON.stringify(requestBody)).toContain("REAL HARWICK TOOLS");
    expect(JSON.stringify(requestBody)).toContain("dispatch_subagent");
    expect(JSON.stringify(requestBody)).toContain("Workspace");
  });
});
