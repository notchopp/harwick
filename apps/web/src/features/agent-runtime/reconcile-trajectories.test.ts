import { describe, expect, it, vi } from "vitest";
import type { AgentTrajectoryStore } from "../../lib/supabase/agent-trajectory-store";
import type { RealtyOpsSupabaseClient } from "../../lib/supabase/server-client";
import { reconcileAgentTrajectories } from "./reconcile-trajectories";

const workspaceId = "00000000-0000-0000-0000-000000000001";
const leadId = "00000000-0000-0000-0000-000000000002";
const trajectoryId = "00000000-0000-0000-0000-000000000003";
const stepId = "00000000-0000-0000-0000-000000000004";
const agentId = "00000000-0000-0000-0000-000000000005";

function createSupabaseMock() {
  const updateTrajectory = vi.fn(() => ({
    eq: vi.fn(() => Promise.resolve({ error: null })),
  }));

  const from = vi.fn((table: string) => {
    if (table === "agent_trajectories") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            lt: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve({
                  data: [{
                    id: trajectoryId,
                    workspace_id: workspaceId,
                    lead_id: leadId,
                    channel: "instagram_dm",
                    started_at: "2026-05-05T10:00:00.000Z",
                    completed_at: "2026-05-05T10:01:00.000Z",
                    step_count: 1,
                  }],
                  error: null,
                })),
              })),
            })),
          })),
        })),
        update: updateTrajectory,
      };
    }

    if (table === "leads") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({
                data: {
                  id: leadId,
                  workspace_id: workspaceId,
                  status: "assigned",
                  assigned_agent_id: agentId,
                  last_message_at: null,
                  updated_at: "2026-05-05T10:05:00.000Z",
                },
                error: null,
              })),
            })),
          })),
        })),
      };
    }

    if (table === "agent_steps") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({
              data: [{
                id: stepId,
                iteration: 1,
                turn_output: {
                  toolCalls: [{
                    tool: "route_lead",
                    payload: { assignedMemberId: agentId },
                  }],
                },
                tool_executions: [],
                created_at: "2026-05-05T10:00:30.000Z",
              }],
              error: null,
            })),
          })),
        })),
      };
    }

    if (table === "agent_outcomes") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({
            data: [],
            error: null,
          })),
        })),
      };
    }

    throw new Error(`Unexpected table in reconcile test: ${table}`);
  });

  return {
    supabase: { from } as unknown as RealtyOpsSupabaseClient,
    updateTrajectory,
  };
}

describe("reconcileAgentTrajectories", () => {
  it("labels routing accepted against the lead assigned_agent_id", async () => {
    const { supabase, updateTrajectory } = createSupabaseMock();
    const recordOutcome = vi.fn().mockResolvedValue({ outcomeId: "outcome-1" });
    const store: AgentTrajectoryStore = {
      startTrajectory: vi.fn(),
      appendStep: vi.fn(),
      completeTrajectory: vi.fn(),
      recordOutcome,
      saveTrajectoryEmbedding: vi.fn(),
      saveStepEmbedding: vi.fn(),
    };

    const report = await reconcileAgentTrajectories({
      supabase,
      store,
      windows: {
        routingOverrideHours: 1,
        replyEngagementHours: 99,
        qualificationCompletionHours: 99,
        fubAcceptanceHours: 99,
      },
      now: () => new Date("2026-05-05T12:00:00.000Z"),
      batchSize: 5,
    });

    expect(recordOutcome).toHaveBeenCalledWith({
      trajectoryId,
      workspaceId,
      signalType: "routing_accepted",
      signalValue: {
        assignedMemberId: agentId,
        aiSuggestedMemberId: agentId,
      },
      attributedToStepId: stepId,
    });
    expect(updateTrajectory).toHaveBeenCalledWith(expect.objectContaining({
      outcome_label: "positive",
      final_lead_status: "assigned",
    }));
    expect(report).toEqual({
      scanned: 1,
      signalsRecorded: 1,
      trajectoriesPromoted: 1,
      errors: 0,
    });
  });
});
