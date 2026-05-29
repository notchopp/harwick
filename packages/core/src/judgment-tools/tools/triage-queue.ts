import { z } from "zod";
import {
  type Audience,
  type Destination,
  type JudgmentEnvelope,
} from "../envelope.js";
import { registerTool, type ToolDefinition } from "../registry.js";

/**
 * Tool #2: triageQueue.
 *
 * Replaces /home's flat work-item dump with a ranked top-N + clusters
 * section. The LLM looks at all pending callbacks, showings, replies, FUB
 * conflicts, ops failures, and assigned/unassigned hot leads, then writes
 * an executive read: top 5 with 1-line "why this first", clusters (dedupe
 * candidates: "3 showings for Clinton on same listing — merge?"), and a
 * collapsed "can wait" tail.
 *
 * Returns a JudgmentEnvelope where:
 *   - brief.headline: the workspace-state one-liner ("3 callbacks past SLA,
 *     2 hot leads waiting on assignment, 1 sync conflict")
 *   - brief.body: prose summary of the workspace state
 *   - suggestedActions: top-5 cards (each action="open_entity", payload has
 *     entity_type + entity_id + cluster info)
 *   - deltas: ["3 duplicate showings for Clinton — merge?", "Tiana at 18/12 capacity"]
 */

export const TriageQueueInputSchema = z.object({
  workspaceId: z.string().uuid(),
  pendingTasks: z.array(z.record(z.string(), z.unknown())).default([]),
  pendingReplies: z.array(z.record(z.string(), z.unknown())).default([]),
  voiceHandoffs: z.array(z.record(z.string(), z.unknown())).default([]),
  fubConflicts: z.array(z.record(z.string(), z.unknown())).default([]),
  unassignedLeads: z.array(z.record(z.string(), z.unknown())).default([]),
  teamCapacity: z.array(z.record(z.string(), z.unknown())).default([]),
  operatorTier: z.enum(["owner", "team_lead", "agent", "ops"]).default("agent"),
});
export type TriageQueueInput = z.infer<typeof TriageQueueInputSchema>;

const SYSTEM_PROMPT_BASE = `You are Harwick's triageQueue tool. You produce an executive read of the workspace's pending work — what to do first, what to cluster, what can wait.

Output shape:
  - headline: ONE line summarizing workspace state ("3 callbacks past SLA, 2 hot leads need routing, 1 sync conflict")
  - body: 2-3 sentences of context — what's the pressure, what's the pattern
  - suggestedActions: up to 5 items, each one a top-priority work item. action="open_entity", payload contains entity_type, entity_id, and 1-line "why this first" in payload.why
  - deltas: cluster observations — duplicates, capacity issues, repeat patterns ("3 duplicate showings for Clinton on same listing — merge?", "Tiana at 18/12 capacity, suggest rebalance")
  - confidence: 0..1 self-rating

Hard rules:
  - Cluster duplicates (same lead + same listing + same task_type) BEFORE counting them as separate priorities
  - Agents see only their personal work; team_leads see team-wide; owners see workspace-wide
  - Time-bound items (callbacks past SLA, showings within 24h) outrank async insight items
  - Never recommend more than 5 top items — anything beyond goes in the "can wait" tail (implied, not surfaced)
  - Confidence < 0.7 when work-item set is thin or contradictory`;

function systemPrompt(audience: Audience, destination: Destination): string {
  return [
    SYSTEM_PROMPT_BASE,
    "",
    `Audience: role=${audience.role}, scope=${audience.scope}.`,
    `Destination: ${destination}.`,
  ].join("\n");
}

function userPromptShape(input: TriageQueueInput): string {
  return JSON.stringify({
    workspaceId: input.workspaceId,
    operatorTier: input.operatorTier,
    counts: {
      pendingTasks: input.pendingTasks.length,
      pendingReplies: input.pendingReplies.length,
      voiceHandoffs: input.voiceHandoffs.length,
      fubConflicts: input.fubConflicts.length,
      unassignedLeads: input.unassignedLeads.length,
    },
    pendingTasks: input.pendingTasks,
    pendingReplies: input.pendingReplies,
    voiceHandoffs: input.voiceHandoffs,
    fubConflicts: input.fubConflicts,
    unassignedLeads: input.unassignedLeads,
    teamCapacity: input.teamCapacity,
  });
}

const definition: ToolDefinition<typeof TriageQueueInputSchema> = {
  name: "triageQueue",
  inputSchema: TriageQueueInputSchema,
  outputSchema: z.any() as unknown as z.ZodTypeAny,
  modelTier: "mini",
  systemPrompt,
  userPromptShape: userPromptShape as (input: z.infer<typeof TriageQueueInputSchema>) => string,
};

registerTool(definition);

export const triageQueueToolDefinition = definition;

export type { JudgmentEnvelope };
