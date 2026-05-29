import { z } from "zod";
import { type Audience, type Destination, type JudgmentEnvelope } from "../envelope.js";
import { registerTool, type ToolDefinition } from "../registry.js";

/**
 * Tools #9-13 batched: pickNurtureAction, inferVoiceOutcome, briefWorkspace,
 * briefTeamMember, reconcileConflict. Each follows the same shape — small
 * inputSchema, focused systemPrompt, registered at module load.
 */

// ============================================================
// Tool #9: pickNurtureAction
// ============================================================

export const PickNurtureActionInputSchema = z.object({
  enrollment: z.record(z.string(), z.unknown()),
  leadState: z.record(z.string(), z.unknown()),
  recentMessage: z.string().nullable().default(null),
  channelsAvailable: z.array(z.string()),
});
export type PickNurtureActionInput = z.infer<typeof PickNurtureActionInputSchema>;

registerTool({
  name: "pickNurtureAction",
  inputSchema: PickNurtureActionInputSchema,
  outputSchema: z.any() as unknown as z.ZodTypeAny,
  modelTier: "mini",
  systemPrompt: (audience: Audience, destination: Destination) =>
    `You are Harwick's pickNurtureAction tool. Replaces hardcoded regex opt-out + quiet-hour rules.

Output shape:
  - verdict: "send" | "skip" | "opt_out" | "pause"
  - brief.headline: 1-line decision
  - brief.body: 1-2 sentences + the draft message when verdict=send
  - suggestedActions: action="send_via_channel" with payload.channel, or "mark_opted_out", or "pause_enrollment"
  - confidence: 0..1

Hard rules:
  - Detect opt-out signals semantically, not just regex ("please stop" / "I'll reach back when ready" / "remove me")
  - Honor quiet hours from workspace policy if defined
  - Channel preference: SMS > IG DM > FB DM > email
  - When recent message exists, draft is a contextual reply not a canned step

Audience: role=${audience.role}. Destination: ${destination}.`,
  userPromptShape: ((input: PickNurtureActionInput) => JSON.stringify(input)) as (input: z.infer<typeof PickNurtureActionInputSchema>) => string,
} satisfies ToolDefinition<typeof PickNurtureActionInputSchema>);

// ============================================================
// Tool #10: inferVoiceOutcome
// ============================================================

export const InferVoiceOutcomeInputSchema = z.object({
  transcript: z.string(),
  leadState: z.record(z.string(), z.unknown()),
  callDuration: z.number().int().nullable().default(null),
});
export type InferVoiceOutcomeInput = z.infer<typeof InferVoiceOutcomeInputSchema>;

registerTool({
  name: "inferVoiceOutcome",
  inputSchema: InferVoiceOutcomeInputSchema,
  outputSchema: z.any() as unknown as z.ZodTypeAny,
  modelTier: "mini",
  systemPrompt: (audience: Audience, destination: Destination) =>
    `You are Harwick's inferVoiceOutcome tool. After a Retell call, read the transcript and the lead's state, then decide outcome + priority + recommended follow-up.

Output shape:
  - verdict: "went_well" | "needs_follow_up" | "reschedule_needed" | "not_interested" | "unknown"
  - brief.headline: 1-line outcome summary
  - brief.body: 2-3 sentences on what happened, what was learned, what to do next
  - suggestedActions: follow-up button (action="schedule_callback" / "send_sms" / "mark_closed_lost" / "create_showing_task")
  - deltas: facts captured from the call worth promoting to the lead doc
  - confidence: 0..1

Audience: role=${audience.role}. Destination: ${destination}.`,
  userPromptShape: ((input: InferVoiceOutcomeInput) => JSON.stringify(input)) as (input: z.infer<typeof InferVoiceOutcomeInputSchema>) => string,
} satisfies ToolDefinition<typeof InferVoiceOutcomeInputSchema>);

// ============================================================
// Tool #11: briefWorkspace
// ============================================================

export const BriefWorkspaceInputSchema = z.object({
  workspaceId: z.string().uuid(),
  period: z.enum(["today", "this_week", "this_month"]).default("this_week"),
  workspaceSnapshot: z.record(z.string(), z.unknown()),
});
export type BriefWorkspaceInput = z.infer<typeof BriefWorkspaceInputSchema>;

registerTool({
  name: "briefWorkspace",
  inputSchema: BriefWorkspaceInputSchema,
  outputSchema: z.any() as unknown as z.ZodTypeAny,
  modelTier: "mini",
  systemPrompt: (audience: Audience, destination: Destination) =>
    `You are Harwick's briefWorkspace tool. Produce an owner-altitude business read of the workspace.

Output shape:
  - verdict: "ready"
  - brief.headline: 1-line — the most important number that moved + direction
  - brief.body: 3-4 sentences — counts (inbound, qualified, hot, closed), one signal worth noting, one move worth making, wallet/cost note
  - suggestedActions: at most 2 — "review_routing", "review_agent_capacity", "review_cost", "open_lead"
  - deltas: 2-3 specific signals ("Tiana auto-converting at 38% vs avg 22%", "wallet burn 38% above last week")
  - confidence: 0..1

Tone: high-altitude, dollar-aware, "what changed, what to do". No imperatives.

Audience: role=${audience.role}. Destination: ${destination}.`,
  userPromptShape: ((input: BriefWorkspaceInput) => JSON.stringify(input)) as (input: z.infer<typeof BriefWorkspaceInputSchema>) => string,
} satisfies ToolDefinition<typeof BriefWorkspaceInputSchema>);

// ============================================================
// Tool #12: briefTeamMember
// ============================================================

export const BriefTeamMemberInputSchema = z.object({
  memberId: z.string().uuid(),
  period: z.enum(["this_week", "this_month", "last_30d"]).default("this_week"),
  memberSnapshot: z.record(z.string(), z.unknown()),
  benchmarkAverages: z.record(z.string(), z.unknown()).default({}),
});
export type BriefTeamMemberInput = z.infer<typeof BriefTeamMemberInputSchema>;

registerTool({
  name: "briefTeamMember",
  inputSchema: BriefTeamMemberInputSchema,
  outputSchema: z.any() as unknown as z.ZodTypeAny,
  modelTier: "mini",
  systemPrompt: (audience: Audience, destination: Destination) =>
    `You are Harwick's briefTeamMember tool. Coaching read on a single team member for a team lead or owner.

Output shape:
  - verdict: "on_pace" | "overloaded" | "underperforming" | "needs_coaching" | "rising"
  - brief.headline: 1-line on the pattern
  - brief.body: 2-3 sentences — what's working, what's not, one specific lever to pull
  - suggestedActions: "send_dm" (to coach), "rebalance_leads", "review_recent_closes"
  - deltas: 1-3 numeric or behavioral signals
  - confidence: 0..1

Audience: role=${audience.role}. Destination: ${destination}.`,
  userPromptShape: ((input: BriefTeamMemberInput) => JSON.stringify(input)) as (input: z.infer<typeof BriefTeamMemberInputSchema>) => string,
} satisfies ToolDefinition<typeof BriefTeamMemberInputSchema>);

// ============================================================
// Tool #13: reconcileConflict
// ============================================================

export const ReconcileConflictInputSchema = z.object({
  leadId: z.string().uuid(),
  harwickState: z.record(z.string(), z.unknown()),
  crmState: z.record(z.string(), z.unknown()),
  conflictFields: z.array(z.string()),
});
export type ReconcileConflictInput = z.infer<typeof ReconcileConflictInputSchema>;

registerTool({
  name: "reconcileConflict",
  inputSchema: ReconcileConflictInputSchema,
  outputSchema: z.any() as unknown as z.ZodTypeAny,
  modelTier: "strong",
  systemPrompt: (audience: Audience, destination: Destination) =>
    `You are Harwick's reconcileConflict tool. When Harwick's state and the CRM's state disagree, decide what to accept.

Output shape:
  - verdict: "accept_crm" | "accept_harwick" | "merge" | "escalate"
  - brief.headline: 1-line decision
  - brief.body: 2-3 sentences on which side won and why
  - suggestedActions: "apply_resolution", "escalate_to_owner", "flag_for_team_lead"
  - deltas: per-field decisions
  - confidence: 0..1

Decision criteria:
  - Agent action in CRM (manual override) usually wins on assignment, stage, scheduled time
  - Harwick wins on latest captured qualification, persona detection, lead document narrative
  - When both sides have recent reasoned action: escalate to a human

Audience: role=${audience.role}. Destination: ${destination}.`,
  userPromptShape: ((input: ReconcileConflictInput) => JSON.stringify(input)) as (input: z.infer<typeof ReconcileConflictInputSchema>) => string,
} satisfies ToolDefinition<typeof ReconcileConflictInputSchema>);

export type { JudgmentEnvelope };
