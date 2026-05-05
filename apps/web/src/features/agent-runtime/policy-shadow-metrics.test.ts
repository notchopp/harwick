import type { HarwickWorkItemCreate } from "@realty-ops/core";
import { describe, expect, it, vi } from "vitest";
import type { HarwickPolicyShadowSignal } from "../../lib/supabase/audit-logs";
import { surfacePolicyShadowMetrics } from "./policy-shadow-metrics";

const workspaceId = "00000000-0000-0000-0000-000000000001";

function signal(params: Partial<HarwickPolicyShadowSignal> = {}): HarwickPolicyShadowSignal {
  const deterministicAutoExecute = params.deterministicAutoExecute ?? true;
  const modelSelfGateAutoExecute = params.modelSelfGateAutoExecute ?? deterministicAutoExecute;
  return {
    workspaceId,
    turnId: "00000000-0000-0000-0000-000000000010",
    agree: deterministicAutoExecute === modelSelfGateAutoExecute,
    deterministicAutoExecute,
    modelSelfGateAutoExecute,
    deterministicReason: "policy allows this turn to auto-send.",
    modelSelfGateReason: "model agrees.",
    createdAt: "2026-05-05T12:00:00.000Z",
    ...params,
  };
}

describe("surfacePolicyShadowMetrics", () => {
  it("surfaces a team lead insight when policy shadow disagreements exceed threshold", async () => {
    const created: HarwickWorkItemCreate[] = [];
    const signals = [
      signal(),
      signal(),
      signal({ deterministicAutoExecute: true, modelSelfGateAutoExecute: false }),
      signal({ deterministicAutoExecute: false, modelSelfGateAutoExecute: true }),
    ];

    const report = await surfacePolicyShadowMetrics({
      auditRepository: {
        listPolicyShadowSignals: vi.fn(() => Promise.resolve(signals)),
      },
      workItemRepository: {
        findOpenInsightBySignalKey: vi.fn(() => Promise.resolve(null)),
        createWorkItem: vi.fn((item: HarwickWorkItemCreate) => {
          created.push(item);
          return Promise.resolve({ workItemId: "work-item-1" });
        }),
      },
      minSamples: 4,
      disagreementThreshold: 0.05,
      now: () => new Date("2026-05-05T13:00:00.000Z"),
    });

    expect(report).toMatchObject({
      scanned: 4,
      workspaces: 1,
      surfaced: 1,
      skippedInsufficientSamples: 0,
      skippedExisting: 0,
    });
    expect(report.metrics[0]).toMatchObject({
      total: 4,
      disagreements: 2,
      disagreementRate: 0.5,
      modelWouldAutoWhenDeterministicBlocked: 1,
      deterministicWouldAutoWhenModelBlocked: 1,
    });
    expect(created[0]).toEqual(expect.objectContaining({
      workspaceId,
      type: "insight",
      targetRole: "team_lead",
      priority: "urgent",
      title: "Policy shadow disagreements need review",
      recommendedAction: "Review policy disagreements",
    }));
    expect(created[0]?.payload["signalKey"]).toBe(`harwick_ai_policy_shadow:${workspaceId}:2026-05-05`);
  });

  it("skips surfacing when the sample size is too small", async () => {
    const createWorkItem = vi.fn();
    const report = await surfacePolicyShadowMetrics({
      auditRepository: {
        listPolicyShadowSignals: vi.fn(() => Promise.resolve([signal()])),
      },
      workItemRepository: {
        findOpenInsightBySignalKey: vi.fn(() => Promise.resolve(null)),
        createWorkItem,
      },
      minSamples: 2,
      now: () => new Date("2026-05-05T13:00:00.000Z"),
    });

    expect(report).toMatchObject({
      scanned: 1,
      workspaces: 1,
      surfaced: 0,
      skippedInsufficientSamples: 1,
    });
    expect(createWorkItem).not.toHaveBeenCalled();
  });
});
