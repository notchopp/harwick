import { WorkspaceMemoryDocumentCreateSchema, type WorkspaceMemoryDocumentCreate } from "@realty-ops/core";
import type { EmbeddingClient } from "@realty-ops/integrations";
import type {
  WorkspaceMemoryOperatorFeedbackSignal,
  WorkspaceMemoryRepository,
  WorkspaceMemoryRoutingOverrideSignal,
} from "../../lib/supabase/workspace-memory";

export type WorkspaceMemoryDistillationDeps = {
  repository: WorkspaceMemoryRepository;
  now?: () => Date;
  lookbackDays?: number;
  duplicateWindowDays?: number;
  minRoutingOverrideCount?: number;
  minOperatorFeedbackCount?: number;
  batchSize?: number;
  embeddings?: EmbeddingClient;
};

export type WorkspaceMemoryDistillationReport = {
  scanned: number;
  created: number;
  embedded: number;
  skippedExisting: number;
  errors: number;
};

function buildRoutingOverrideMemory(signal: WorkspaceMemoryRoutingOverrideSignal): WorkspaceMemoryDocumentCreate {
  const title = "Routing overrides are repeating";
  const operatorCount = signal.operatorMemberIds.length;
  const aiCount = signal.aiSuggestedMemberIds.length;

  return WorkspaceMemoryDocumentCreateSchema.parse({
    workspaceId: signal.workspaceId,
    memoryType: "routing",
    title,
    body: `Team members overrode Harwick routing ${signal.outcomeCount} times in the recent window. Treat this as a workspace-level training signal: when similar leads appear, check current routing profiles and recent operator choices before assigning.`,
    source: "distillation_worker",
    confidence: Math.min(0.95, 0.55 + signal.outcomeCount * 0.08),
    evidence: {
      signalType: "routing_overridden",
      outcomeCount: signal.outcomeCount,
      operatorChoiceCount: operatorCount,
      aiSuggestedMemberCount: aiCount,
      operatorMemberIds: signal.operatorMemberIds,
      aiSuggestedMemberIds: signal.aiSuggestedMemberIds,
    },
    lastObservedAt: signal.latestObservedAt,
  });
}

function formatFeedbackLabel(label: string | null): string {
  if (label === null) return "unlabeled feedback";
  return label.replace(/_/g, " ");
}

function buildOperatorFeedbackMemory(signal: WorkspaceMemoryOperatorFeedbackSignal): WorkspaceMemoryDocumentCreate {
  const label = formatFeedbackLabel(signal.feedbackLabel);
  const source = signal.feedbackSource ?? "Harwick output";
  const isPositive = signal.signalType === "operator_tag_positive";
  const isNegative = signal.signalType === "operator_tag_negative";
  const title = isPositive
    ? `Operators keep marking ${label} Harwick work as useful`
    : isNegative
      ? `Operators keep marking ${label} Harwick work as not relevant`
      : `Operators keep leaving ${label} notes on Harwick work`;
  const trainingDirection = isPositive
    ? "Treat similar Harwick behavior as a positive workspace preference."
    : isNegative
      ? "Treat similar Harwick behavior as a correction signal before surfacing or repeating it."
      : "Treat similar operator notes as soft context when deciding what to surface next.";

  return WorkspaceMemoryDocumentCreateSchema.parse({
    workspaceId: signal.workspaceId,
    memoryType: isNegative ? "policy_signal" : "pattern",
    title,
    body: `Operators gave Harwick ${signal.outcomeCount} ${label} feedback signals from ${source} in the recent window. ${trainingDirection} Use this as brokerage-level memory when deciding what to surface, suppress, or explain to the team.`,
    source: "distillation_worker",
    confidence: Math.min(0.9, 0.5 + signal.outcomeCount * 0.07),
    evidence: {
      signalType: signal.signalType,
      feedbackLabel: signal.feedbackLabel,
      feedbackLabelDisplay: label,
      feedbackSource: signal.feedbackSource,
      outcomeCount: signal.outcomeCount,
      memberIds: signal.memberIds,
    },
    lastObservedAt: signal.latestObservedAt,
  });
}

export function buildWorkspaceMemoryEmbeddingText(memory: WorkspaceMemoryDocumentCreate): string {
  return [
    `type: ${memory.memoryType}`,
    `title: ${memory.title}`,
    memory.body,
  ].join("\n");
}

export async function distillWorkspaceMemory(
  deps: WorkspaceMemoryDistillationDeps,
): Promise<WorkspaceMemoryDistillationReport> {
  const now = deps.now?.() ?? new Date();
  const lookbackDays = deps.lookbackDays ?? 14;
  const duplicateWindowDays = deps.duplicateWindowDays ?? 7;
  const sinceIso = new Date(now.getTime() - lookbackDays * 24 * 3600000).toISOString();
  const duplicateSinceIso = new Date(now.getTime() - duplicateWindowDays * 24 * 3600000).toISOString();

  const routingSignals = await deps.repository.listRoutingOverrideSignals({
    sinceIso,
    minCount: deps.minRoutingOverrideCount ?? 2,
    limit: deps.batchSize ?? 10,
  });
  const operatorFeedbackSignals = await deps.repository.listOperatorFeedbackSignals({
    sinceIso,
    minCount: deps.minOperatorFeedbackCount ?? 3,
    limit: deps.batchSize ?? 10,
  });

  let created = 0;
  let embedded = 0;
  let skippedExisting = 0;
  let errors = 0;

  const memories = [
    ...routingSignals.map(buildRoutingOverrideMemory),
    ...operatorFeedbackSignals.map(buildOperatorFeedbackMemory),
  ];

  for (const memory of memories) {
    try {
      const existing = await deps.repository.findRecentMemoryByTitle({
        workspaceId: memory.workspaceId,
        title: memory.title,
        sinceIso: duplicateSinceIso,
      });
      if (existing !== null) {
        skippedExisting += 1;
        continue;
      }

      const { memoryId } = await deps.repository.insertMemoryDocument(memory);
      created += 1;

      if (deps.embeddings !== undefined) {
        const embeddingText = buildWorkspaceMemoryEmbeddingText(memory);
        const embedding = await deps.embeddings.embed(embeddingText);
        await deps.repository.saveMemoryEmbedding({
          workspaceId: memory.workspaceId,
          memoryId,
          embedding,
          embeddingText,
        });
        embedded += 1;
      }
    } catch (error) {
      console.warn("[distillWorkspaceMemory] failed for workspace", memory.workspaceId, error);
      errors += 1;
    }
  }

  return {
    scanned: routingSignals.length + operatorFeedbackSignals.length,
    created,
    embedded,
    skippedExisting,
    errors,
  };
}
