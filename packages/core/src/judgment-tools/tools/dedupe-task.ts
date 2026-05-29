import { z } from "zod";
import { type Audience, type Destination, type JudgmentEnvelope } from "../envelope.js";
import { registerTool, type ToolDefinition } from "../registry.js";

/**
 * Tool #7: dedupeTask.
 *
 * Pre-write check before lead_tasks insert: is this a duplicate of an open
 * task (update existing) or a genuine new request (insert)?
 *
 * Fixes the Clinton 3-duplicate-showings problem from the stress test.
 * Handles edge cases rule-based dedupe misses ("different group this time"
 * is a new task, "reconsidering time" is an update).
 */

export const DedupeTaskInputSchema = z.object({
  proposedTask: z.object({
    taskType: z.string(),
    leadId: z.string().uuid(),
    listingId: z.string().nullable(),
    title: z.string(),
    description: z.string().nullable(),
    requestedStartAt: z.string().nullable(),
  }),
  existingOpenTasks: z.array(z.record(z.string(), z.unknown())).default([]),
});
export type DedupeTaskInput = z.infer<typeof DedupeTaskInputSchema>;

const SYSTEM_PROMPT_BASE = `You are Harwick's dedupeTask tool. Given a proposed task and the existing open tasks for the same lead, decide insert vs update vs skip.

Output shape:
  - verdict: "insert" | "update" | "skip"
  - brief.headline: 1-line on what you did and why
  - brief.body: 1-2 sentences
  - suggestedActions:
      - if "update", action="update_task" with payload.targetTaskId
      - if "skip", action="dismiss"
      - if "insert", action="proceed"
  - deltas: explain what shifted from existing ("time changed from Tue 4pm to Sat 2pm")
  - confidence: 0..1

Decision criteria:
  - INSERT: proposed task represents a meaningfully different request (different listing, different group/occasion, different intent)
  - UPDATE: proposed task is a refinement of an existing pending one (time change, additional detail, scope adjustment) — pick the most recent open task as targetTaskId
  - SKIP: proposed task is functionally identical to an existing pending one — operator already has it on their queue

When in doubt, prefer UPDATE over INSERT to keep the operator queue clean.`;

function systemPrompt(audience: Audience, destination: Destination): string {
  return `${SYSTEM_PROMPT_BASE}\n\nAudience: role=${audience.role}. Destination: ${destination}.`;
}

function userPromptShape(input: DedupeTaskInput): string {
  return JSON.stringify(input);
}

registerTool({
  name: "dedupeTask",
  inputSchema: DedupeTaskInputSchema,
  outputSchema: z.any() as unknown as z.ZodTypeAny,
  modelTier: "mini",
  systemPrompt,
  userPromptShape: userPromptShape as (input: z.infer<typeof DedupeTaskInputSchema>) => string,
} satisfies ToolDefinition<typeof DedupeTaskInputSchema>);

export type { JudgmentEnvelope };
