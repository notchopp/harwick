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

const SubagentTaskResultSchema = z.object({
  summary: z.string().trim().min(1).max(1000),
  recommendation: z.string().trim().min(1).max(160),
  reason: z.string().trim().min(1).max(1000),
  confidence: z.number().min(0).max(1),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
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

export function createSmallModelHarwickSubagentExecutorClient(
  client: SmallModelClient,
): HarwickSubagentExecutorClient {
  return {
    async executeTask(task) {
      return client.classify({
        schema: SubagentTaskResultSchema,
        temperature: 0.2,
        maxTokens: 500,
        instructions: [
          "You are a lightweight specialist subagent for Harwick, a real estate workspace chief of staff.",
          "Execute only the provided task. Do not claim external facts, appointments, CRM writes, or property facts that are not in the task payload.",
          "Return a concise operational result for the human workspace surface.",
          "Return JSON with summary, recommendation, reason, confidence, and optional priority.",
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

  return SubagentTaskResultSchema.parse({
    summary: `${task.title}: queued ${role} was reviewed from the available task instructions. ${task.instructions}`,
    recommendation: task.subagentType === "routing"
      ? "Review routing recommendation"
      : task.subagentType === "calendar"
        ? "Review scheduling next step"
        : task.subagentType === "writer"
          ? "Review draft direction"
          : "Review research finding",
    reason: "This result was produced from the durable Harwick subagent task so the workspace can act on it without losing the thread.",
    confidence: 0.55,
    priority: task.priority,
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
    },
    dueAt: null,
  });
}

export async function executeHarwickSubagentTasks(
  deps: HarwickSubagentExecutionDeps,
): Promise<HarwickSubagentExecutionReport> {
  const now = deps.now?.() ?? new Date();
  const nowIso = now.toISOString();
  const tasks = await deps.taskRepository.listQueuedTasks({ limit: deps.batchSize ?? 10 });
  const executorClient = deps.executorClient ?? { executeTask: deterministicExecuteTask };

  let completed = 0;
  let surfaced = 0;
  let skippedClaimed = 0;
  let skippedExisting = 0;
  let failed = 0;

  for (const task of tasks) {
    const claimed = await deps.taskRepository.markTaskRunning({
      workspaceId: task.workspaceId,
      taskId: task.id,
      nowIso,
    });
    if (!claimed) {
      skippedClaimed += 1;
      continue;
    }

    try {
      const result = SubagentTaskResultSchema.parse(await executorClient.executeTask(task));
      await deps.taskRepository.markTaskCompleted({
        workspaceId: task.workspaceId,
        taskId: task.id,
        result,
        nowIso,
      });
      completed += 1;

      const signalKey = `harwick_subagent_result:${task.id}`;
      const existing = await deps.workItemRepository.findOpenInsightBySignalKey({
        workspaceId: task.workspaceId,
        signalKey,
      });
      if (existing !== null) {
        skippedExisting += 1;
        continue;
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
      surfaced += 1;
    } catch (error) {
      failed += 1;
      await deps.taskRepository.markTaskFailed({
        workspaceId: task.workspaceId,
        taskId: task.id,
        errorMessage: error instanceof Error ? error.message : String(error),
        nowIso,
      });
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
