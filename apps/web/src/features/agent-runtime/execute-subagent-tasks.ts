import { HarwickWorkItemCreateSchema, type HarwickWorkItemCreate, type WorkspaceRole } from "@realty-ops/core";
import type { SmallModelClient } from "@realty-ops/integrations";
import { z } from "zod";
import type { HarwickWorkItemRepository } from "../../lib/supabase/harwick-work-items";
import {
  intelligizeHarwickWorkItem,
  type HarwickWorkItemIntelligenceClient,
} from "./harwick-work-item-intelligence";

export type HarwickSubagentType = "research" | "writer" | "calendar" | "routing";

export type HarwickSubagentTask = {
  id: string;
  workspaceId: string;
  leadId: string | null;
  trajectoryId: string | null;
  stepId: string | null;
  subagentType: HarwickSubagentType;
  priority: "low" | "normal" | "high" | "urgent";
  title: string;
  instructions: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

const SubagentConfidenceSchema = z.preprocess((value) => {
  const numeric = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(numeric) ? numeric : 0.5;
}, z.number().min(0).max(1));

// Structured finding — what the subagent observed about one specific subject.
// Forces specificity: every finding ties to a named entity, includes a concrete
// observation, and explains operational implication.
const SubagentFindingSchema = z.object({
  subject: z.string().trim().min(2).max(120).describe("Who or what this finding is about. Use specific names: 'Priya Shah', 'lead Marcus Webb', 'listing 1234 Oak Ave', 'response_time_metric'."),
  observation: z.string().trim().min(8).max(600).describe("The specific observation. Include numbers, dates, or names — no generalities. Bad: 'workload is uneven'. Good: 'Priya has 14 open leads vs Malik's 4; Priya's median response time is 38h.'"),
  implication: z.string().trim().min(8).max(400).describe("Why this finding matters operationally. Tie back to revenue, SLA, lead drop-off, or team health."),
  evidence: z.object({
    kind: z.enum(["lead", "member", "listing", "conversation", "trajectory", "metric", "task"]),
    id: z.string().nullable().default(null),
    label: z.string().trim().max(200).nullable().default(null),
  }).optional().describe("Optional pointer to the workspace record this finding is grounded in."),
  confidence: SubagentConfidenceSchema,
});

const SubagentNextStepSchema = z.object({
  who: z.string().trim().min(2).max(120).describe("Who should do this: a workspace role ('owner', 'team_lead'), a named member ('Sarah'), or 'Harwick' if Harwick should automate it."),
  action: z.string().trim().min(8).max(400).describe("Verb-first concrete action. Bad: 'consider adjusting'. Good: 'Reassign 4 of Priya's lowest-priority leads to Malik this week.'"),
  why: z.string().trim().min(4).max(240),
  urgency: z.enum(["now", "this_week", "this_month", "later"]).default("this_week"),
});

const SubagentTaskResultSchema = z.object({
  // Headline trio — same as before, but length floors raised so the model
  // can't dodge with one-word answers.
  summary: z.string().trim().min(20).max(1000).describe("2-3 dense sentences naming the specific entities, numbers, or patterns you found. NOT generic prose."),
  recommendation: z.string().trim().min(8).max(280).describe("The single most important next move, as a verb-first phrase."),
  reason: z.string().trim().min(20).max(1000).describe("Why this recommendation is right, grounded in the findings above."),
  confidence: SubagentConfidenceSchema,
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),

  // Rich body — required so the model can't fall back to vague prose.
  findings: z.array(SubagentFindingSchema).min(2).max(10).describe("2-10 SPECIFIC findings. Each must name a concrete subject and an observation grounded in numbers/dates/names."),
  nextSteps: z.array(SubagentNextStepSchema).min(1).max(8).describe("1-8 concrete next steps in order of urgency. Each names WHO and WHAT verb-first."),
  blockers: z.array(z.string().trim().min(4).max(240)).max(5).default([]).describe("What blocks acting on findings — missing approvals, data access gaps, capacity limits, regulatory constraints."),
  dataGaps: z.array(z.string().trim().min(4).max(240)).max(5).default([]).describe("Data the subagent wished it had access to and didn't. Honest gaps, not excuses."),
});

export type HarwickSubagentTaskResult = z.infer<typeof SubagentTaskResultSchema>;

export type HarwickSubagentTaskRepository = {
  listQueuedTasks(params: { limit: number }): Promise<HarwickSubagentTask[]>;
  markTaskRunning(params: {
    workspaceId: string;
    taskId: string;
    nowIso: string;
  }): Promise<boolean>;
  markTaskCompleted(params: {
    workspaceId: string;
    taskId: string;
    result: HarwickSubagentTaskResult;
    nowIso: string;
  }): Promise<void>;
  markTaskFailed(params: {
    workspaceId: string;
    taskId: string;
    errorMessage: string;
    nowIso: string;
  }): Promise<void>;
  resolveLeadAssignedMember(params: {
    workspaceId: string;
    leadId: string;
  }): Promise<string | null>;
};

export type HarwickSubagentExecutorClient = {
  executeTask(task: HarwickSubagentTask): Promise<HarwickSubagentTaskResult>;
};

export type HarwickSubagentExecutionDeps = {
  taskRepository: HarwickSubagentTaskRepository;
  workItemRepository: Pick<HarwickWorkItemRepository, "createWorkItem" | "findOpenInsightBySignalKey">;
  executorClient?: HarwickSubagentExecutorClient;
  intelligenceClient?: HarwickWorkItemIntelligenceClient;
  now?: () => Date;
  batchSize?: number;
};

export type HarwickSubagentExecutionReport = {
  scanned: number;
  completed: number;
  surfaced: number;
  skippedClaimed: number;
  skippedExisting: number;
  failed: number;
};

export type HarwickSubagentSingleExecutionResult =
  | {
    status: "completed";
    result: HarwickSubagentTaskResult;
    surfaced: boolean;
  }
  | {
    status: "already_claimed";
  }
  | {
    status: "failed";
    errorMessage: string;
  };

export function createSmallModelHarwickSubagentExecutorClient(
  client: SmallModelClient,
): HarwickSubagentExecutorClient {
  return {
    async executeTask(task) {
      const result = await client.classify({
        schema: SubagentTaskResultSchema,
        temperature: 0.2,
        maxTokens: 1600,
        instructions: [
          "You are a specialist subagent for Harwick, a real estate workspace chief of staff.",
          "Your job is to PRODUCE A RICH ANALYTICAL REPORT, not a one-line answer.",
          "",
          "Specificity rules — these are non-negotiable:",
          "  - Every finding MUST name a specific subject (a person, a lead, a listing, a metric).",
          "  - Every observation MUST include at least one of: a number, a date, a percentage, or a named entity.",
          "  - Generic statements like 'workload is uneven' or 'team should improve response times' are NOT acceptable findings. Reject them in your own output.",
          "  - Every next step MUST be verb-first and name WHO does it.",
          "  - If you genuinely don't have data for a specific finding, list what you'd need under dataGaps — don't pad with generalities.",
          "",
          "Schema requirements:",
          "  - summary: 2-3 dense sentences naming entities/numbers (not 'completed analysis of...')",
          "  - findings: 2-10 specific findings, each tied to a named subject",
          "  - nextSteps: 1-8 concrete steps, verb-first, naming the responsible party",
          "  - blockers: things that prevent acting on findings (approvals, access, capacity)",
          "  - dataGaps: honest list of what you wanted but didn't have",
          "  - confidence: 0..1; lower it if you had to extrapolate from thin data",
          "",
          "Ground every finding in the payload + instructions provided. If the dispatching context (Harwick rail) gave you workspace data in the payload, USE IT — quote specific names, IDs, and numbers from it. Do not invent facts.",
        ].join("\n"),
        input: JSON.stringify({
          taskId: task.id,
          subagentType: task.subagentType,
          priority: task.priority,
          title: task.title,
          instructions: task.instructions,
          payload: task.payload,
        }),
      });
      return SubagentTaskResultSchema.parse(result);
    },
  };
}

function deterministicExecuteTask(task: HarwickSubagentTask): HarwickSubagentTaskResult {
  const role = task.subagentType === "routing"
    ? "routing context"
    : task.subagentType === "calendar"
      ? "calendar context"
      : task.subagentType === "writer"
        ? "drafting context"
        : "research context";

  const recommendation = task.subagentType === "routing"
    ? "Review routing recommendation"
    : task.subagentType === "calendar"
      ? "Review scheduling next step"
      : task.subagentType === "writer"
        ? "Review draft direction"
        : "Review research finding";

  // Deterministic fallback when no LLM client is wired (tests / offline). The
  // shape mirrors the live schema (rich findings + nextSteps) so the executor's
  // schema parse passes and downstream code paths don't branch on this case.
  return SubagentTaskResultSchema.parse({
    summary: `${task.title}: queued ${role} was reviewed from the available task instructions. ${task.instructions}`,
    recommendation,
    reason: "This result was produced from the durable Harwick subagent task so the workspace can act on it without losing the thread.",
    confidence: 0.55,
    priority: task.priority,
    findings: [
      {
        subject: `${role}`,
        observation: `The task '${task.title}' was reviewed against the available instructions without a live model client. Priority is '${task.priority}'.`,
        implication: "The operator can use this placeholder to confirm the task was queued; richer findings require the live LLM path.",
        confidence: 0.6,
      },
      {
        subject: "Task instructions",
        observation: task.instructions.slice(0, 300),
        implication: "These are the literal instructions provided to the subagent at dispatch time.",
        confidence: 0.95,
      },
    ],
    nextSteps: [
      {
        who: "operator",
        action: recommendation,
        why: "The deterministic fallback can't analyze deeper than this; the operator gets to interpret.",
        urgency: "this_week",
      },
    ],
    blockers: [],
    dataGaps: ["Live LLM client output for richer per-entity findings."],
  });
}

function targetRoleForTask(task: HarwickSubagentTask): WorkspaceRole {
  if (task.subagentType === "routing") return "team_lead";
  if (task.subagentType === "calendar") return "operator";
  return "agent";
}

function buildResultWorkItem(params: {
  task: HarwickSubagentTask;
  result: HarwickSubagentTaskResult;
  assignedMemberId: string | null;
}): HarwickWorkItemCreate {
  const targetRole = targetRoleForTask(params.task);
  const targetMemberId = targetRole === "agent" ? params.assignedMemberId : null;

  return HarwickWorkItemCreateSchema.parse({
    workspaceId: params.task.workspaceId,
    leadId: params.task.leadId,
    routingDecisionId: null,
    trajectoryId: params.task.trajectoryId,
    stepId: params.task.stepId,
    type: "insight",
    status: "pending",
    targetMemberId,
    targetRole,
    priority: params.result.priority ?? params.task.priority,
    title: `Subagent result: ${params.task.title}`,
    summary: params.result.summary,
    recommendedAction: params.result.recommendation,
    reason: params.result.reason,
    payload: {
      signalType: "harwick_subagent_result",
      signalKey: `harwick_subagent_result:${params.task.id}`,
      taskId: params.task.id,
      subagentType: params.task.subagentType,
      confidence: params.result.confidence,
      source: "harwick_subagent_executor",
      // Rich structured body — flows through to the work-item drawer.
      findings: params.result.findings,
      nextSteps: params.result.nextSteps,
      blockers: params.result.blockers,
      dataGaps: params.result.dataGaps,
    },
    dueAt: null,
  });
}

export async function executeHarwickSubagentTasks(
  deps: HarwickSubagentExecutionDeps,
): Promise<HarwickSubagentExecutionReport> {
  const now = deps.now?.() ?? new Date();
  const tasks = await deps.taskRepository.listQueuedTasks({ limit: deps.batchSize ?? 10 });

  let completed = 0;
  let surfaced = 0;
  let skippedClaimed = 0;
  let skippedExisting = 0;
  let failed = 0;

  for (const task of tasks) {
    const execution = await executeHarwickSubagentTask({
      ...deps,
      task,
      now: () => now,
    });

    if (execution.status === "already_claimed") {
      skippedClaimed += 1;
      continue;
    }
    if (execution.status === "failed") {
      failed += 1;
      continue;
    }

    completed += 1;
    if (execution.surfaced) {
      surfaced += 1;
    } else {
      skippedExisting += 1;
    }
  }

  return {
    scanned: tasks.length,
    completed,
    surfaced,
    skippedClaimed,
    skippedExisting,
    failed,
  };
}

export async function executeHarwickSubagentTask(
  deps: Omit<HarwickSubagentExecutionDeps, "batchSize"> & {
    task: HarwickSubagentTask;
  },
): Promise<HarwickSubagentSingleExecutionResult> {
  const now = deps.now?.() ?? new Date();
  const nowIso = now.toISOString();
  const executorClient = deps.executorClient ?? { executeTask: deterministicExecuteTask };
  const task = deps.task;

  const claimed = await deps.taskRepository.markTaskRunning({
    workspaceId: task.workspaceId,
    taskId: task.id,
    nowIso,
  });
  if (!claimed) {
    return { status: "already_claimed" };
  }

  try {
    const result = SubagentTaskResultSchema.parse(await executorClient.executeTask(task));
    await deps.taskRepository.markTaskCompleted({
      workspaceId: task.workspaceId,
      taskId: task.id,
      result,
      nowIso,
    });

    const signalKey = `harwick_subagent_result:${task.id}`;
    const existing = await deps.workItemRepository.findOpenInsightBySignalKey({
      workspaceId: task.workspaceId,
      signalKey,
    });
    if (existing !== null) {
      return { status: "completed", result, surfaced: false };
    }

    const assignedMemberId = task.leadId === null
      ? null
      : await deps.taskRepository.resolveLeadAssignedMember({
        workspaceId: task.workspaceId,
        leadId: task.leadId,
      });
    const workItem = await intelligizeHarwickWorkItem({
      context: {
        signalKey,
        source: "subagent_result",
        item: buildResultWorkItem({ task, result, assignedMemberId }),
      },
      ...(deps.intelligenceClient === undefined ? {} : { client: deps.intelligenceClient }),
    });
    await deps.workItemRepository.createWorkItem(workItem);
    return { status: "completed", result, surfaced: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await deps.taskRepository.markTaskFailed({
      workspaceId: task.workspaceId,
      taskId: task.id,
      errorMessage,
      nowIso,
    });
    return { status: "failed", errorMessage };
  }
}
