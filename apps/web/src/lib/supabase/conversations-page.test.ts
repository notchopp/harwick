import { describe, expect, it } from "vitest";
import { mapAgentStepToSynthesis, type AgentStepSynthesisRow } from "./conversations-page";

const leadId = "22222222-2222-4222-8222-222222222222";

describe("mapAgentStepToSynthesis", () => {
  it("surfaces executed tool results as in-flight synthesis activity", () => {
    const row: AgentStepSynthesisRow = {
      id: "11111111-1111-4111-8111-111111111111",
      lead_id: leadId,
      turn_output: {
        intent: "showing_request",
        nextAction: "request_showing_approval",
        confidence: 0.84,
        missingFields: ["financing_status"],
        safetyFlags: ["showing_approval_required"],
        documentUpdate: "Lead asked to tour the listing this weekend.",
      },
      tool_executions: [{
        tool: "request_showing_approval",
        status: "executed",
        reason: "Lead wants to tour a listing.",
        output: {
          taskId: "task-1",
          status: "queued",
          listing: "123 Main St",
          requestedTime: "Saturday afternoon",
        },
      }],
      exit_reason: "queued_for_approval",
      harwick_ai_turn_id: "33333333-3333-4333-8333-333333333333",
      created_at: "2026-05-05T12:00:00.000Z",
    };

    expect(mapAgentStepToSynthesis(row)).toMatchObject({
      leadId,
      status: "in_flight:queued_for_approval",
      nextAction: "request_showing_approval",
      handoffBrief: "Showing approval task created",
      toolActivity: [{
        tool: "request_showing_approval",
        status: "executed",
        summary: "Showing approval task created",
        detail: "Listing: 123 Main St",
      }],
    });
  });

  it("falls back to requested tool activity before executions arrive", () => {
    const row: AgentStepSynthesisRow = {
      id: "11111111-1111-4111-8111-111111111111",
      lead_id: leadId,
      turn_output: {
        intent: "lead_routing",
        nextAction: "route_lead",
        confidence: 0.72,
        toolCalls: [{
          tool: "route_lead",
          reason: "Katy buyer should be assigned to the best-fit agent.",
          payload: { area: "Katy" },
        }],
      },
      tool_executions: [],
      exit_reason: null,
      harwick_ai_turn_id: null,
      created_at: "2026-05-05T12:00:00.000Z",
    };

    expect(mapAgentStepToSynthesis(row)?.toolActivity).toEqual([{
      id: "11111111-1111-4111-8111-111111111111:requested:0",
      tool: "route_lead",
      status: "requested",
      summary: "route lead requested",
      detail: "Katy buyer should be assigned to the best-fit agent.",
    }]);
  });
});

