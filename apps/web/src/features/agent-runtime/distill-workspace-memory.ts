import { WorkspaceMemoryDocumentCreateSchema, type WorkspaceMemoryDocumentCreate } from "@realty-ops/core";
import type { EmbeddingClient } from "@realty-ops/integrations";
import type {
  WorkspaceMemoryLeadOutcomeSignal,
  WorkspaceMemoryMarketSignal,
  WorkspaceMemoryObjectionSignal,
  WorkspaceMemoryOperatorFeedbackSignal,
  WorkspaceMemoryRepository,
  WorkspaceMemoryRoutingOverrideSignal,
  WorkspaceMemorySourceChannelSignal,
} from "../../lib/supabase/workspace-memory";

export type WorkspaceMemoryDistillationDeps = {
  repository: WorkspaceMemoryRepository;
  now?: () => Date;
  lookbackDays?: number;
  duplicateWindowDays?: number;
  minRoutingOverrideCount?: number;
  minOperatorFeedbackCount?: number;
  minLeadPatternCount?: number;
  minObjectionCount?: number;
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

function formatChannel(channel: string): string {
  return channel.replace(/_/g, " ");
}

function formatArea(area: string | null): string {
  return area === null ? "unknown area" : area;
}

function formatCurrency(value: number | null): string | null {
  if (value === null) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function buildLeadOutcomeMemory(signal: WorkspaceMemoryLeadOutcomeSignal): WorkspaceMemoryDocumentCreate {
  const channel = formatChannel(signal.sourceChannel);
  const area = formatArea(signal.targetArea);
  const outcomeText = signal.signalType === "conversion_pattern"
    ? "converted"
    : signal.signalType === "qualification_pattern"
      ? "qualified"
      : "churned";
  const title = `${outcomeText[0]?.toUpperCase() ?? "O"}${outcomeText.slice(1)} ${signal.leadType} leads repeat from ${channel} in ${area}`;
  const direction = signal.signalType === "churn_pattern"
    ? "Treat this as a caution signal when prioritizing, routing, and choosing the next follow-up angle."
    : "Treat this as a positive pattern when routing, prioritizing, and deciding what Harwick should surface.";

  return WorkspaceMemoryDocumentCreateSchema.parse({
    workspaceId: signal.workspaceId,
    memoryType: signal.signalType === "churn_pattern" ? "policy_signal" : "pattern",
    title,
    body: `${signal.outcomeCount} ${signal.leadType} leads from ${channel} in ${area} recently ${outcomeText}. Average score was ${signal.averageScore ?? "unknown"}. ${direction}`,
    source: "distillation_worker",
    confidence: Math.min(0.92, 0.5 + signal.outcomeCount * 0.06),
    evidence: {
      signalType: signal.signalType,
      sourceChannel: signal.sourceChannel,
      leadType: signal.leadType,
      targetArea: signal.targetArea,
      outcomeCount: signal.outcomeCount,
      finalStatuses: signal.finalStatuses,
      averageScore: signal.averageScore,
    },
    lastObservedAt: signal.latestObservedAt,
  });
}

function buildMarketMemory(signal: WorkspaceMemoryMarketSignal): WorkspaceMemoryDocumentCreate {
  const budgetParts = [formatCurrency(signal.budgetMin), formatCurrency(signal.budgetMax)]
    .filter((value): value is string => value !== null);
  const budgetText = budgetParts.length === 0 ? "no consistent budget range yet" : budgetParts.join(" to ");
  const timelineText = signal.timelines.length === 0 ? "mixed timelines" : signal.timelines.slice(0, 3).join(", ");

  return WorkspaceMemoryDocumentCreateSchema.parse({
    workspaceId: signal.workspaceId,
    memoryType: "market",
    title: `${signal.targetArea} keeps appearing for ${signal.leadType} leads`,
    body: `${signal.outcomeCount} recent ${signal.leadType} leads named ${signal.targetArea}. Their timelines cluster around ${timelineText}, with ${budgetText}. Use this as brokerage-level market context before Harwick asks follow-up questions or recommends routing.`,
    source: "distillation_worker",
    confidence: Math.min(0.88, 0.48 + signal.outcomeCount * 0.05),
    evidence: {
      signalType: "market_area_pattern",
      targetArea: signal.targetArea,
      leadType: signal.leadType,
      outcomeCount: signal.outcomeCount,
      sourceChannels: signal.sourceChannels,
      timelines: signal.timelines,
      budgetMin: signal.budgetMin,
      budgetMax: signal.budgetMax,
    },
    lastObservedAt: signal.latestObservedAt,
  });
}

function buildSourceChannelMemory(signal: WorkspaceMemorySourceChannelSignal): WorkspaceMemoryDocumentCreate {
  const channel = formatChannel(signal.sourceChannel);
  const positiveCount = signal.qualifiedCount + signal.convertedCount;
  const title = `${channel} is showing a ${signal.leadType} lead pattern`;

  return WorkspaceMemoryDocumentCreateSchema.parse({
    workspaceId: signal.workspaceId,
    memoryType: "pattern",
    title,
    body: `${channel} produced ${signal.outcomeCount} recent ${signal.leadType} leads: ${signal.qualifiedCount} qualified or hot, ${signal.convertedCount} converted, and ${signal.churnedCount} churned. ${positiveCount >= signal.churnedCount ? "Use it as a source-credit signal when prioritizing and routing." : "Use it as a caution signal before over-prioritizing similar inbound."}`,
    source: "distillation_worker",
    confidence: Math.min(0.86, 0.45 + signal.outcomeCount * 0.04),
    evidence: {
      signalType: "source_channel_pattern",
      sourceChannel: signal.sourceChannel,
      leadType: signal.leadType,
      outcomeCount: signal.outcomeCount,
      qualifiedCount: signal.qualifiedCount,
      convertedCount: signal.convertedCount,
      churnedCount: signal.churnedCount,
    },
    lastObservedAt: signal.latestObservedAt,
  });
}

function buildObjectionMemory(signal: WorkspaceMemoryObjectionSignal): WorkspaceMemoryDocumentCreate {
  const label = signal.objectionType.replace(/_/g, " ");

  return WorkspaceMemoryDocumentCreateSchema.parse({
    workspaceId: signal.workspaceId,
    memoryType: "objection",
    title: `${label[0]?.toUpperCase() ?? "O"}${label.slice(1)} objections are repeating`,
    body: `Leads raised ${signal.outcomeCount} ${label} objections in recent conversations. Harwick should anticipate this pattern, ask one useful clarifier, and surface the right owner action instead of treating each objection as isolated.`,
    source: "distillation_worker",
    confidence: Math.min(0.9, 0.5 + signal.outcomeCount * 0.06),
    evidence: {
      signalType: "conversation_objection_pattern",
      objectionType: signal.objectionType,
      outcomeCount: signal.outcomeCount,
      sourceChannels: signal.sourceChannels,
      examples: signal.examples,
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
  const leadOutcomeSignals = await deps.repository.listLeadOutcomeSignals({
    sinceIso,
    minCount: deps.minLeadPatternCount ?? 3,
    limit: deps.batchSize ?? 10,
  });
  const marketSignals = await deps.repository.listMarketSignals({
    sinceIso,
    minCount: deps.minLeadPatternCount ?? 3,
    limit: deps.batchSize ?? 10,
  });
  const sourceChannelSignals = await deps.repository.listSourceChannelSignals({
    sinceIso,
    minCount: deps.minLeadPatternCount ?? 3,
    limit: deps.batchSize ?? 10,
  });
  const objectionSignals = await deps.repository.listObjectionSignals({
    sinceIso,
    minCount: deps.minObjectionCount ?? 3,
    limit: deps.batchSize ?? 10,
  });

  let created = 0;
  let embedded = 0;
  let skippedExisting = 0;
  let errors = 0;

  const memories = [
    ...routingSignals.map(buildRoutingOverrideMemory),
    ...operatorFeedbackSignals.map(buildOperatorFeedbackMemory),
    ...leadOutcomeSignals.map(buildLeadOutcomeMemory),
    ...marketSignals.map(buildMarketMemory),
    ...sourceChannelSignals.map(buildSourceChannelMemory),
    ...objectionSignals.map(buildObjectionMemory),
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
    scanned: routingSignals.length
      + operatorFeedbackSignals.length
      + leadOutcomeSignals.length
      + marketSignals.length
      + sourceChannelSignals.length
      + objectionSignals.length,
    created,
    embedded,
    skippedExisting,
    errors,
  };
}
