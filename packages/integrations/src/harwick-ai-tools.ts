import {
  HarwickAiToolCallSchema,
  evaluateHarwickAiAutomation,
  type HarwickAiAutomationDecision,
  type HarwickAiRuntimeInput,
  type HarwickAiToolCall,
  type HarwickAiToolName,
  type HarwickAiTurn,
} from "@realty-ops/core";
import { z } from "zod";
import type { HarwickAiRuntimeClient } from "./harwick-ai-runtime.js";

export const HarwickAiToolExecutionStatusSchema = z.enum(["executed", "queued_for_approval", "missing_handler", "failed"]);

export const HarwickAiToolExecutionResultSchema = z.object({
  tool: HarwickAiToolCallSchema.shape.tool,
  status: HarwickAiToolExecutionStatusSchema,
  reason: z.string().trim().min(1).max(240),
  output: z.record(z.string(), z.unknown()).default({}),
  errorCode: z.string().trim().min(1).max(120).optional(),
  errorMessage: z.string().trim().min(1).max(500).optional(),
});

export type HarwickAiToolExecutionResult = z.infer<typeof HarwickAiToolExecutionResultSchema>;
export type HarwickAiToolHandler = (toolCall: HarwickAiToolCall) => Promise<Record<string, unknown>>;
export type HarwickAiToolHandlers = Partial<Record<HarwickAiToolName, HarwickAiToolHandler>>;

export async function executeHarwickAiToolCalls(params: {
  toolCalls: HarwickAiToolCall[];
  handlers: HarwickAiToolHandlers;
  approvedTools?: HarwickAiToolName[];
}): Promise<HarwickAiToolExecutionResult[]> {
  const enforceApprovedTools = params.approvedTools !== undefined;
  const approvedTools = new Set(params.approvedTools ?? []);
  const results: HarwickAiToolExecutionResult[] = [];

  for (const toolCall of params.toolCalls.map((candidate) => HarwickAiToolCallSchema.parse(candidate))) {
    if ((toolCall.requiresApproval || enforceApprovedTools) && !approvedTools.has(toolCall.tool)) {
      results.push(HarwickAiToolExecutionResultSchema.parse({
        tool: toolCall.tool,
        status: "queued_for_approval",
        reason: toolCall.reason,
        output: {
          payload: toolCall.payload,
        },
      }));
      continue;
    }

    const handler = params.handlers[toolCall.tool];
    if (handler === undefined) {
      results.push(HarwickAiToolExecutionResultSchema.parse({
        tool: toolCall.tool,
        status: "missing_handler",
        reason: toolCall.reason,
        output: {
          payload: toolCall.payload,
        },
      }));
      continue;
    }

    try {
      results.push(HarwickAiToolExecutionResultSchema.parse({
        tool: toolCall.tool,
        status: "executed",
        reason: toolCall.reason,
        output: await handler(toolCall),
      }));
    } catch (error) {
      results.push(HarwickAiToolExecutionResultSchema.parse({
        tool: toolCall.tool,
        status: "failed",
        reason: toolCall.reason,
        output: {
          payload: toolCall.payload,
        },
        errorCode: "handler_execution_failed",
        errorMessage: error instanceof Error ? error.message : "Tool execution failed.",
      }));
    }
  }

  return results;
}

export async function executeHarwickAiTurnWithPolicy(params: {
  turn: HarwickAiTurn;
  policy: unknown;
  handlers: HarwickAiToolHandlers;
}): Promise<{
  automation: HarwickAiAutomationDecision;
  results: HarwickAiToolExecutionResult[];
}> {
  const automation = evaluateHarwickAiAutomation({
    turn: params.turn,
    policy: params.policy,
  });
  const results = await executeHarwickAiToolCalls({
    toolCalls: params.turn.toolCalls,
    handlers: params.handlers,
    approvedTools: automation.approvedTools,
  });

  return { automation, results };
}

/**
 * AI-native shift 5: agentic loop. Lets the model chain multiple tool calls
 * in a single inbound — `check_calendar` then `request_showing_approval`
 * then `send_meta_message`, all decided by the model after seeing each tool's
 * result, instead of one model call producing one set of tool calls.
 *
 * Bounded by `maxIterations` (default 6) and exits early when:
 *  - the model emits `endTurn: true`
 *  - any executed step's status is `queued_for_approval` (operator must
 *    decide before the loop continues)
 *  - any executed step's status is `failed` (don't compound failures)
 *
 * Operator queues evolve to approve outcomes — the full sequence shows up
 * as one card with the trace of every step.
 */
export type AgenticLoopStep = {
  iteration: number;
  turn: HarwickAiTurn;
  automation: HarwickAiAutomationDecision;
  results: HarwickAiToolExecutionResult[];
};

export type AgenticLoopOutcome = {
  steps: AgenticLoopStep[];
  finalTurn: HarwickAiTurn;
  exitReason:
    | "model_end_turn"
    | "max_iterations"
    | "queued_for_approval"
    | "tool_failed"
    | "no_tool_calls";
};

export async function runHarwickAiAgenticLoop(params: {
  initialInput: HarwickAiRuntimeInput;
  runtime: HarwickAiRuntimeClient;
  policy: unknown;
  handlers: HarwickAiToolHandlers;
  maxIterations?: number;
  buildFollowupInput?: (params: {
    previousInput: HarwickAiRuntimeInput;
    previousTurn: HarwickAiTurn;
    previousResults: HarwickAiToolExecutionResult[];
  }) => HarwickAiRuntimeInput;
}): Promise<AgenticLoopOutcome> {
  // The hand-rolled multi-iteration loop is gone — multi-step now lives inside
  // runtime.runTurn (ai-sdk's stopWhen: stepCountIs(6) drives it natively).
  // This function reduces to a single iteration: invoke the runtime, evaluate
  // automation policy on the proposed tool calls, execute approved ones, and
  // return a one-step AgenticLoopOutcome shaped exactly as before so existing
  // callers (executor + trajectory persistence) keep working.
  const turn = await params.runtime.runTurn(params.initialInput);

  const automation = evaluateHarwickAiAutomation({ turn, policy: params.policy });
  const results = await executeHarwickAiToolCalls({
    toolCalls: turn.toolCalls,
    handlers: params.handlers,
    approvedTools: automation.approvedTools,
  });

  const step: AgenticLoopStep = { iteration: 1, turn, automation, results };
  let exitReason: AgenticLoopOutcome["exitReason"];
  if (results.some((result) => result.status === "failed")) {
    exitReason = "tool_failed";
  } else if (results.some((result) => result.status === "queued_for_approval")) {
    exitReason = "queued_for_approval";
  } else if (turn.toolCalls.length === 0) {
    exitReason = "no_tool_calls";
  } else {
    exitReason = "model_end_turn";
  }

  return {
    steps: [step],
    finalTurn: turn,
    exitReason,
  };
}
