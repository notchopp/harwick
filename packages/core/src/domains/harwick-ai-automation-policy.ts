import { z } from "zod";
import {
  HarwickAiRuntimeActionSchema,
  HarwickAiRuntimeSafetyFlagSchema,
  HarwickAiToolNameSchema,
  HarwickAiTurnSchema,
  type HarwickAiToolCall,
  type HarwickAiToolName,
  type HarwickAiTurn,
} from "./harwick-ai-runtime.js";
import { ConversationAutomationModeSchema } from "./conversation-automation.js";
import { UuidSchema } from "./common.js";

export const HarwickAiAutomationPolicyScopeSchema = z.enum(["workspace", "member", "conversation"]);

export const HarwickAiAutomationPolicySchema = z.object({
  id: UuidSchema.nullable().default(null),
  workspaceId: UuidSchema.nullable().default(null),
  memberId: UuidSchema.nullable().default(null),
  leadId: UuidSchema.nullable().default(null),
  scope: HarwickAiAutomationPolicyScopeSchema.default("workspace"),
  automationMode: ConversationAutomationModeSchema.default("ai_on"),
  autoSendEnabled: z.boolean().default(true),
  confidenceThreshold: z.number().min(0).max(1).default(0.78),
  allowedAutoActions: z.array(HarwickAiRuntimeActionSchema).default([
    "send_reply",
    "ask_qualification",
    "move_comment_to_dm",
    "send_buyer_blueprint",
  ]),
  allowedAutoTools: z.array(HarwickAiToolNameSchema).default([
    "send_meta_reply",
    "send_meta_dm",
  ]),
  requiresApprovalActions: z.array(HarwickAiRuntimeActionSchema).default([
    "offer_showing",
    "request_showing_approval",
    "register_open_house",
    "route_lead",
    "handoff_to_agent",
    "pause_for_owner",
    "do_not_reply",
  ]),
  requiresApprovalTools: z.array(HarwickAiToolNameSchema).default([
    "check_calendar",
    "request_showing_approval",
    "register_open_house",
    "route_lead",
    "sync_follow_up_boss",
    "pause_automation",
  ]),
  blockedSafetyFlags: z.array(HarwickAiRuntimeSafetyFlagSchema).default([
    "needs_human_review",
    "human_takeover",
    "legal_advice",
    "lending_advice",
    "contract_advice",
    "valuation_claim",
    "claims_listing_availability",
    "claims_financing_certainty",
    "low_confidence",
  ]),
});

export const HarwickAiAutomationDecisionSchema = z.object({
  canAutoExecute: z.boolean(),
  approvedTools: z.array(HarwickAiToolNameSchema),
  blockedTools: z.array(HarwickAiToolNameSchema),
  reason: z.string().trim().min(1).max(500),
});

export type HarwickAiAutomationPolicy = z.infer<typeof HarwickAiAutomationPolicySchema>;
export type HarwickAiAutomationDecision = z.infer<typeof HarwickAiAutomationDecisionSchema>;

function uniqueTools(toolCalls: HarwickAiToolCall[]): HarwickAiToolName[] {
  return [...new Set(toolCalls.map((toolCall) => toolCall.tool))];
}

export function evaluateHarwickAiAutomation(params: {
  turn: HarwickAiTurn;
  policy: unknown;
}): HarwickAiAutomationDecision {
  const turn = HarwickAiTurnSchema.parse(params.turn);
  const policy = HarwickAiAutomationPolicySchema.parse(params.policy);
  const tools = uniqueTools(turn.toolCalls);

  if (policy.automationMode !== "ai_on") {
    return HarwickAiAutomationDecisionSchema.parse({
      canAutoExecute: false,
      approvedTools: [],
      blockedTools: tools,
      reason: "automation is not on for this scope.",
    });
  }

  if (!policy.autoSendEnabled) {
    return HarwickAiAutomationDecisionSchema.parse({
      canAutoExecute: false,
      approvedTools: [],
      blockedTools: tools,
      reason: "auto-send is disabled by policy.",
    });
  }

  if (turn.confidence < policy.confidenceThreshold) {
    return HarwickAiAutomationDecisionSchema.parse({
      canAutoExecute: false,
      approvedTools: [],
      blockedTools: tools,
      reason: `confidence ${turn.confidence.toFixed(2)} is below threshold ${policy.confidenceThreshold.toFixed(2)}.`,
    });
  }

  const blockedFlag = turn.safetyFlags.find((flag) => flag !== "safe_to_send" && policy.blockedSafetyFlags.includes(flag));
  if (blockedFlag !== undefined) {
    return HarwickAiAutomationDecisionSchema.parse({
      canAutoExecute: false,
      approvedTools: [],
      blockedTools: tools,
      reason: `safety flag ${blockedFlag} requires human review.`,
    });
  }

  if (policy.requiresApprovalActions.includes(turn.nextAction) || !policy.allowedAutoActions.includes(turn.nextAction)) {
    return HarwickAiAutomationDecisionSchema.parse({
      canAutoExecute: false,
      approvedTools: [],
      blockedTools: tools,
      reason: `action ${turn.nextAction} is not allowed to auto-send.`,
    });
  }

  const blockedTools = tools.filter((tool) => policy.requiresApprovalTools.includes(tool) || !policy.allowedAutoTools.includes(tool));
  const approvedTools = tools.filter((tool) => !blockedTools.includes(tool));

  return HarwickAiAutomationDecisionSchema.parse({
    canAutoExecute: blockedTools.length === 0,
    approvedTools,
    blockedTools,
    reason: blockedTools.length === 0
      ? "policy allows this turn to auto-send."
      : `tool ${blockedTools[0]} requires approval or is not allowed.`,
  });
}
