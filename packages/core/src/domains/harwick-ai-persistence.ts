import { z } from "zod";
import {
  HarwickAiAutomationDecisionSchema,
  HarwickAiAutomationPolicySchema,
} from "./harwick-ai-automation-policy.js";
import {
  HarwickAiRuntimeInputSchema,
  HarwickAiToolCallSchema,
  HarwickAiToolNameSchema,
  HarwickAiTurnSchema,
  type HarwickAiToolCall,
  type HarwickAiToolName,
} from "./harwick-ai-runtime.js";
import { LeadSourceChannelSchema } from "./lead.js";
import { UuidSchema } from "./common.js";

export const HarwickAiTurnPersistenceStatusSchema = z.enum([
  "drafted",
  "auto_executed",
  "queued_for_approval",
  "blocked",
  "failed",
]);

export const HarwickAiToolPolicyStatusSchema = z.enum([
  "approved",
  "approval_required",
  "blocked",
]);

export const HarwickAiToolPersistenceStatusSchema = z.enum([
  "pending",
  "executed",
  "queued_for_approval",
  "missing_handler",
  "failed",
  "blocked",
]);

export const HarwickAiPersistedToolCallSchema = z.object({
  tool: HarwickAiToolNameSchema,
  requiresApproval: z.boolean(),
  reason: z.string().trim().min(1).max(240),
  payload: z.record(z.string(), z.unknown()).default({}),
  policyStatus: HarwickAiToolPolicyStatusSchema,
  executionStatus: HarwickAiToolPersistenceStatusSchema.default("pending"),
  executionOutput: z.record(z.string(), z.unknown()).default({}),
  errorCode: z.string().trim().min(1).max(120).nullable().default(null),
  errorMessage: z.string().trim().min(1).max(500).nullable().default(null),
});

export const HarwickAiPersistedTurnSchema = z.object({
  workspaceId: UuidSchema,
  leadId: UuidSchema.nullable().default(null),
  socialReplyReviewId: UuidSchema.nullable().default(null),
  providerThreadId: z.string().trim().min(1).max(180).nullable().default(null),
  channel: LeadSourceChannelSchema,
  runtimeInput: HarwickAiRuntimeInputSchema,
  turn: HarwickAiTurnSchema,
  automationPolicy: HarwickAiAutomationPolicySchema,
  automationDecision: HarwickAiAutomationDecisionSchema,
  status: HarwickAiTurnPersistenceStatusSchema,
  toolCalls: z.array(HarwickAiPersistedToolCallSchema).max(8).default([]),
});

export type HarwickAiTurnPersistenceStatus = z.infer<typeof HarwickAiTurnPersistenceStatusSchema>;
export type HarwickAiToolPolicyStatus = z.infer<typeof HarwickAiToolPolicyStatusSchema>;
export type HarwickAiToolPersistenceStatus = z.infer<typeof HarwickAiToolPersistenceStatusSchema>;
export type HarwickAiPersistedToolCall = z.infer<typeof HarwickAiPersistedToolCallSchema>;
export type HarwickAiPersistedTurn = z.infer<typeof HarwickAiPersistedTurnSchema>;

export function deriveHarwickAiTurnPersistenceStatus(params: {
  automationDecision: z.input<typeof HarwickAiAutomationDecisionSchema>;
  isExecuted?: boolean;
  hasExecutionFailure?: boolean;
}): HarwickAiTurnPersistenceStatus {
  const automationDecision = HarwickAiAutomationDecisionSchema.parse(params.automationDecision);

  if (params.hasExecutionFailure === true) {
    return "failed";
  }

  if (params.isExecuted === true && automationDecision.canAutoExecute) {
    return "auto_executed";
  }

  if (automationDecision.canAutoExecute) {
    return "drafted";
  }

  if (automationDecision.blockedTools.length > 0) {
    return "queued_for_approval";
  }

  return "blocked";
}

export function deriveHarwickAiToolPolicyStatus(params: {
  toolCall: HarwickAiToolCall;
  approvedTools: readonly HarwickAiToolName[];
  blockedTools: readonly HarwickAiToolName[];
}): HarwickAiToolPolicyStatus {
  const toolCall = HarwickAiToolCallSchema.parse(params.toolCall);
  if (params.approvedTools.includes(toolCall.tool)) {
    return "approved";
  }

  if (toolCall.requiresApproval || params.blockedTools.includes(toolCall.tool)) {
    return "approval_required";
  }

  return "blocked";
}

export function buildPersistedHarwickAiToolCalls(params: {
  toolCalls: HarwickAiToolCall[];
  approvedTools: readonly HarwickAiToolName[];
  blockedTools: readonly HarwickAiToolName[];
}): HarwickAiPersistedToolCall[] {
  return params.toolCalls.map((toolCall) => HarwickAiPersistedToolCallSchema.parse({
    ...toolCall,
    policyStatus: deriveHarwickAiToolPolicyStatus({
      toolCall,
      approvedTools: params.approvedTools,
      blockedTools: params.blockedTools,
    }),
    executionStatus: "pending",
  }));
}
