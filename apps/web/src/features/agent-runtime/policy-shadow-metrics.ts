import { HarwickWorkItemCreateSchema, type HarwickWorkItemCreate } from "@realty-ops/core";
import type { AuditLogRepository, HarwickPolicyShadowSignal } from "../../lib/supabase/audit-logs";
import type { HarwickWorkItemRepository } from "../../lib/supabase/harwick-work-items";
import {
  intelligizeHarwickWorkItem,
  type HarwickWorkItemIntelligenceClient,
} from "./harwick-work-item-intelligence";

export type PolicyShadowWorkspaceMetric = {
  workspaceId: string;
  total: number;
  agreements: number;
  disagreements: number;
  disagreementRate: number;
  modelWouldAutoWhenDeterministicBlocked: number;
  deterministicWouldAutoWhenModelBlocked: number;
  latestObservedAt: string;
};

export type PolicyShadowMetricsDeps = {
  auditRepository: Pick<AuditLogRepository, "listPolicyShadowSignals">;
  workItemRepository: Pick<HarwickWorkItemRepository, "createWorkItem" | "findOpenInsightBySignalKey">;
  intelligenceClient?: HarwickWorkItemIntelligenceClient;
  now?: () => Date;
  lookbackDays?: number;
  minSamples?: number;
  disagreementThreshold?: number;
  limit?: number;
};

export type PolicyShadowMetricsReport = {
  scanned: number;
  workspaces: number;
  surfaced: number;
  skippedInsufficientSamples: number;
  skippedExisting: number;
  metrics: PolicyShadowWorkspaceMetric[];
};

function aggregateSignals(signals: HarwickPolicyShadowSignal[]): PolicyShadowWorkspaceMetric[] {
  const grouped = new Map<string, PolicyShadowWorkspaceMetric>();

  for (const signal of signals) {
    const current = grouped.get(signal.workspaceId) ?? {
      workspaceId: signal.workspaceId,
      total: 0,
      agreements: 0,
      disagreements: 0,
      disagreementRate: 0,
      modelWouldAutoWhenDeterministicBlocked: 0,
      deterministicWouldAutoWhenModelBlocked: 0,
      latestObservedAt: signal.createdAt,
    };

    current.total += 1;
    if (signal.agree) {
      current.agreements += 1;
    } else {
      current.disagreements += 1;
      if (signal.modelSelfGateAutoExecute && !signal.deterministicAutoExecute) {
        current.modelWouldAutoWhenDeterministicBlocked += 1;
      }
      if (signal.deterministicAutoExecute && !signal.modelSelfGateAutoExecute) {
        current.deterministicWouldAutoWhenModelBlocked += 1;
      }
    }
    if (Date.parse(signal.createdAt) > Date.parse(current.latestObservedAt)) {
      current.latestObservedAt = signal.createdAt;
    }
    current.disagreementRate = current.disagreements / current.total;
    grouped.set(signal.workspaceId, current);
  }

  return [...grouped.values()].sort((left, right) => right.disagreementRate - left.disagreementRate);
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function buildPolicyShadowWorkItem(params: {
  metric: PolicyShadowWorkspaceMetric;
  signalKey: string;
  threshold: number;
}): HarwickWorkItemCreate {
  const isBelowThreshold = params.metric.disagreementRate <= params.threshold;
  const title = isBelowThreshold
    ? "Policy shadow gate is within deletion threshold"
    : "Policy shadow disagreements need review";
  const priority = isBelowThreshold
    ? "normal"
    : params.metric.disagreementRate >= 0.2
      ? "urgent"
      : "high";

  return HarwickWorkItemCreateSchema.parse({
    workspaceId: params.metric.workspaceId,
    leadId: null,
    routingDecisionId: null,
    trajectoryId: null,
    stepId: null,
    type: "insight",
    status: "pending",
    targetMemberId: null,
    targetRole: "team_lead",
    priority,
    title,
    summary: `${params.metric.disagreements} of ${params.metric.total} Harwick policy shadow checks disagreed in the lookback window (${percent(params.metric.disagreementRate)}).`,
    recommendedAction: isBelowThreshold ? "Review deletion readiness" : "Review policy disagreements",
    reason: isBelowThreshold
      ? "Model self-gating is tracking the deterministic policy closely enough to prepare a controlled deletion review."
      : "The model and deterministic policy still disagree often enough that deterministic policy should remain the source of truth.",
    payload: {
      signalType: "harwick_ai_policy_shadow_metrics",
      signalKey: params.signalKey,
      total: params.metric.total,
      agreements: params.metric.agreements,
      disagreements: params.metric.disagreements,
      disagreementRate: params.metric.disagreementRate,
      threshold: params.threshold,
      modelWouldAutoWhenDeterministicBlocked: params.metric.modelWouldAutoWhenDeterministicBlocked,
      deterministicWouldAutoWhenModelBlocked: params.metric.deterministicWouldAutoWhenModelBlocked,
    },
    dueAt: null,
  });
}

export async function surfacePolicyShadowMetrics(
  deps: PolicyShadowMetricsDeps,
): Promise<PolicyShadowMetricsReport> {
  const now = deps.now?.() ?? new Date();
  const lookbackDays = deps.lookbackDays ?? 7;
  const minSamples = deps.minSamples ?? 20;
  const threshold = deps.disagreementThreshold ?? 0.05;
  const sinceIso = new Date(now.getTime() - lookbackDays * 24 * 3600000).toISOString();
  const signals = await deps.auditRepository.listPolicyShadowSignals({
    sinceIso,
    limit: deps.limit ?? 1000,
  });
  const metrics = aggregateSignals(signals);

  let surfaced = 0;
  let skippedInsufficientSamples = 0;
  let skippedExisting = 0;

  for (const metric of metrics) {
    if (metric.total < minSamples) {
      skippedInsufficientSamples += 1;
      continue;
    }

    const signalKey = `harwick_ai_policy_shadow:${metric.workspaceId}:${now.toISOString().slice(0, 10)}`;
    const existing = await deps.workItemRepository.findOpenInsightBySignalKey({
      workspaceId: metric.workspaceId,
      signalKey,
    });
    if (existing !== null) {
      skippedExisting += 1;
      continue;
    }

    await deps.workItemRepository.createWorkItem(await intelligizeHarwickWorkItem({
      context: {
        signalKey,
        source: "policy_shadow",
        item: buildPolicyShadowWorkItem({
          metric,
          signalKey,
          threshold,
        }),
      },
      ...(deps.intelligenceClient === undefined ? {} : { client: deps.intelligenceClient }),
    }));
    surfaced += 1;
  }

  return {
    scanned: signals.length,
    workspaces: metrics.length,
    surfaced,
    skippedInsufficientSamples,
    skippedExisting,
    metrics,
  };
}
