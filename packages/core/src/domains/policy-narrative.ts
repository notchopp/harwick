import { z } from "zod";
import {
  HarwickAiAutomationPolicySchema,
  type HarwickAiAutomationPolicy,
} from "./harwick-ai-automation-policy.js";

/**
 * Policy narrative is the AI-native replacement for evaluateHarwickAiAutomation.
 *
 * Today the broker's automation preferences live as enum lists on a structured
 * policy row. Tomorrow they live as prose injected into the system prompt and
 * the model self-gates. The generator below renders the structured row as
 * English so we can dual-write during shadow mode and let humans edit the
 * narrative directly once the model is trusted.
 */

export const PolicyNarrativeSchema = z.object({
  generatedFromPolicyId: z.string().uuid().nullable().default(null),
  workspaceId: z.string().uuid().nullable().default(null),
  body: z.string().trim().min(1).max(8000),
  generatedAt: z.string().datetime().default(() => new Date().toISOString()),
});

export type PolicyNarrative = z.infer<typeof PolicyNarrativeSchema>;

const ACTION_LABELS: Record<string, string> = {
  send_reply: "send conversational replies",
  ask_qualification: "ask qualifying questions",
  move_comment_to_dm: "move public comments into DM",
  send_buyer_blueprint: "share the buyer blueprint resource",
  offer_showing: "offer a property showing",
  request_showing_approval: "request approval to schedule a showing",
  register_open_house: "register a lead for an open house",
  route_lead: "route the lead to a specific agent",
  handoff_to_agent: "hand the conversation off to a human agent",
  pause_for_owner: "pause the conversation pending the listing owner",
  do_not_reply: "decline to respond",
};

const TOOL_LABELS: Record<string, string> = {
  send_meta_reply: "send_meta_reply (post a public reply on the original post)",
  send_meta_dm: "send_meta_dm (start or continue a direct message thread)",
  check_calendar: "check_calendar (look up agent availability)",
  request_showing_approval: "request_showing_approval (queue a showing request for an operator)",
  register_open_house: "register_open_house (add the lead to the open-house list)",
  route_lead: "route_lead (assign the lead to an agent)",
  sync_follow_up_boss: "sync_follow_up_boss (push the lead to the CRM)",
  pause_automation: "pause_automation (stop AI replies on this thread until a human resumes)",
};

const SAFETY_LABELS: Record<string, string> = {
  needs_human_review: "anything you flag as needing human review",
  human_takeover: "any thread the operator has taken over",
  legal_advice: "messages that ask for legal advice",
  lending_advice: "messages that ask for lending or financing advice",
  contract_advice: "questions about contract terms or commission",
  valuation_claim: "questions asking you to claim a property's value",
  claims_listing_availability: "claims about whether a listing is still available",
  claims_financing_certainty: "claims that a buyer is certain to qualify for financing",
  low_confidence: "any turn where you are not confident in the right answer",
};

function joinList(items: string[]): string {
  if (items.length === 0) {
    return "";
  }
  if (items.length === 1) {
    return items[0]!;
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function describeActions(actions: readonly string[], lookup: Record<string, string>): string {
  const labels = actions.map((action) => lookup[action] ?? action);
  return joinList(labels);
}

export function generatePolicyNarrative(rawPolicy: unknown): PolicyNarrative {
  const policy: HarwickAiAutomationPolicy = HarwickAiAutomationPolicySchema.parse(rawPolicy);
  const lines: string[] = [];

  if (policy.automationMode === "ai_on") {
    lines.push(
      `Automation is on. Reply autonomously when you are confident (above ${(policy.confidenceThreshold * 100).toFixed(0)}%) and the message falls within the rules below.`,
    );
  } else if (policy.automationMode === "human_takeover") {
    lines.push(
      "Automation is paused. The operator is handling this conversation directly. Do not send messages on your own; produce drafts only when asked.",
    );
  } else {
    lines.push(
      "Automation is in approval mode. Always queue your reply for operator review before it leaves the system.",
    );
  }

  if (policy.autoSendEnabled === false && policy.automationMode === "ai_on") {
    lines.push("Auto-send is disabled by the broker. Treat every reply as draft-only — produce it, but do not actually send.");
  }

  if (policy.allowedAutoActions.length > 0) {
    lines.push(`You may take these actions on your own: ${describeActions(policy.allowedAutoActions, ACTION_LABELS)}.`);
  }

  if (policy.requiresApprovalActions.length > 0) {
    lines.push(`These actions always need operator approval before you commit them: ${describeActions(policy.requiresApprovalActions, ACTION_LABELS)}.`);
  }

  if (policy.allowedAutoTools.length > 0) {
    lines.push(`You may call these tools without approval when the rest of this policy allows it: ${describeActions(policy.allowedAutoTools, TOOL_LABELS)}.`);
  }

  if (policy.requiresApprovalTools.length > 0) {
    lines.push(`These tools always require operator approval, even when the action itself is allowed: ${describeActions(policy.requiresApprovalTools, TOOL_LABELS)}.`);
  }

  if (policy.blockedSafetyFlags.length > 0) {
    lines.push(`Never send autonomously when any of the following apply: ${describeActions(policy.blockedSafetyFlags, SAFETY_LABELS)}.`);
  }

  lines.push(
    "When in doubt, queue the message for the operator and explain your hesitation in one short line. Operator approval is the safety net; use it.",
  );

  return PolicyNarrativeSchema.parse({
    generatedFromPolicyId: policy.id,
    workspaceId: policy.workspaceId,
    body: lines.join("\n\n"),
    generatedAt: new Date().toISOString(),
  });
}

/**
 * Shadow-mode comparison output. We log this to audit_logs while both gates
 * run in parallel; once disagreement rate is < 5% we flip
 * `HARWICK_AI_POLICY_SOURCE` to `model_self_gate` and delete the deterministic
 * gate.
 */
export const PolicyShadowComparisonSchema = z.object({
  workspaceId: z.string().uuid().nullable(),
  turnId: z.string().uuid().nullable(),
  deterministicAutoExecute: z.boolean(),
  deterministicReason: z.string(),
  modelSelfGateAutoExecute: z.boolean(),
  modelSelfGateReason: z.string(),
  agree: z.boolean(),
});

export type PolicyShadowComparison = z.infer<typeof PolicyShadowComparisonSchema>;

export function buildPolicyShadowComparison(params: {
  workspaceId: string | null;
  turnId: string | null;
  deterministicAutoExecute: boolean;
  deterministicReason: string;
  modelSelfGateAutoExecute: boolean;
  modelSelfGateReason: string;
}): PolicyShadowComparison {
  return PolicyShadowComparisonSchema.parse({
    workspaceId: params.workspaceId,
    turnId: params.turnId,
    deterministicAutoExecute: params.deterministicAutoExecute,
    deterministicReason: params.deterministicReason,
    modelSelfGateAutoExecute: params.modelSelfGateAutoExecute,
    modelSelfGateReason: params.modelSelfGateReason,
    agree: params.deterministicAutoExecute === params.modelSelfGateAutoExecute,
  });
}
