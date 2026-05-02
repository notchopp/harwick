import {
  HarwickAiToolCallSchema,
  evaluateHarwickAiAutomation,
  type HarwickAiAutomationDecision,
  type HarwickAiToolCall,
  type HarwickAiToolName,
  type HarwickAiTurn,
} from "@realty-ops/core";
import { z } from "zod";

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
  const approvedTools = new Set(params.approvedTools ?? []);
  const results: HarwickAiToolExecutionResult[] = [];

  for (const toolCall of params.toolCalls.map((candidate) => HarwickAiToolCallSchema.parse(candidate))) {
    if (toolCall.requiresApproval && !approvedTools.has(toolCall.tool)) {
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
