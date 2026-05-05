import type {
  AgentOutcomeInsert,
  AgentTrajectoryStore,
} from "../../lib/supabase/agent-trajectory-store";
import type { RealtyOpsSupabaseClient } from "../../lib/supabase/server-client";

/**
 * Trajectory outcome reconciliation.
 *
 * The runtime writes outcome signals it observes synchronously (operator
 * approve/dismiss/edit/takeover/release, inline tags). Most signals,
 * however, are *delayed* — the lead replies an hour later, the deal closes
 * three weeks later, FUB sync is acknowledged a few minutes after. This
 * worker bridges that gap: it scans trajectories whose outcome_label is
 * still pending past their reconciliation window, looks at the world's
 * current state, and writes the implicit outcome.
 *
 * Implicit signals derived:
 *   reply_engaged          — auto-sent reply, lead responded within window
 *   reply_no_engagement    — auto-sent reply, lead ghosted past window
 *   qualification_completed — lead qualified entirely on the auto path
 *   fub_accepted           — FUB sync workflow_job completed cleanly
 *   showing_booked         — showing task closed as booked
 *   converted              — lead status closed_won
 *   churned                — lead status closed_lost / archived
 *   routing_accepted       — AI's route_lead decision matches the current
 *                            assigned_member_id past the override window
 *   routing_overridden     — operator changed assignment within the window
 *
 * Customers never know they're labeling. They use Harwick; Harwick records.
 */

type ReconcileWindowConfig = {
  replyEngagementHours: number;
  routingOverrideHours: number;
  qualificationCompletionHours: number;
  fubAcceptanceHours: number;
};

const DEFAULT_WINDOW: ReconcileWindowConfig = {
  replyEngagementHours: 24,
  routingOverrideHours: 6,
  qualificationCompletionHours: 48,
  fubAcceptanceHours: 4,
};

type PendingTrajectory = {
  id: string;
  workspace_id: string;
  lead_id: string | null;
  channel: string | null;
  started_at: string;
  completed_at: string | null;
  step_count: number;
};

async function fetchPendingTrajectories(
  supabase: RealtyOpsSupabaseClient,
  params: { batchSize: number; olderThanIso: string },
): Promise<PendingTrajectory[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("agent_trajectories")
    .select("id, workspace_id, lead_id, channel, started_at, completed_at, step_count")
    .eq("outcome_label", "pending")
    .lt("started_at", params.olderThanIso)
    .order("started_at", { ascending: true })
    .limit(params.batchSize);

  if (error !== null) {
    throw error;
  }
  return (data ?? []) as PendingTrajectory[];
}

type LeadSnapshot = {
  id: string;
  workspace_id: string;
  status: string | null;
  assigned_member_id: string | null;
  last_message_at: string | null;
  updated_at: string | null;
};

async function fetchLeadSnapshot(
  supabase: RealtyOpsSupabaseClient,
  params: { workspaceId: string; leadId: string },
): Promise<LeadSnapshot | null> {
  const { data, error } = await supabase
    .from("leads")
    .select("id, workspace_id, status, assigned_member_id, last_message_at, updated_at")
    .eq("workspace_id", params.workspaceId)
    .eq("id", params.leadId)
    .maybeSingle<LeadSnapshot>();
  if (error !== null) return null;
  return data;
}

type StepRow = {
  id: string;
  iteration: number;
  turn_output: { toolCalls?: Array<{ tool: string; payload: Record<string, unknown> }> } | null;
  tool_executions: unknown;
  created_at: string;
};

async function fetchSteps(
  supabase: RealtyOpsSupabaseClient,
  trajectoryId: string,
): Promise<StepRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("agent_steps")
    .select("id, iteration, turn_output, tool_executions, created_at")
    .eq("trajectory_id", trajectoryId)
    .order("iteration", { ascending: true });
  if (error !== null) return [];
  return (data ?? []) as StepRow[];
}

type ExistingOutcome = { signal_type: string };

async function fetchOutcomeTypesForTrajectory(
  supabase: RealtyOpsSupabaseClient,
  trajectoryId: string,
): Promise<Set<string>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("agent_outcomes")
    .select("signal_type")
    .eq("trajectory_id", trajectoryId);
  if (error !== null) return new Set();
  return new Set(((data ?? []) as ExistingOutcome[]).map((row) => row.signal_type));
}

function findStepWithToolCall(steps: StepRow[], toolName: string): StepRow | null {
  for (const step of steps) {
    const toolCalls = step.turn_output?.toolCalls ?? [];
    if (toolCalls.some((call) => call.tool === toolName)) {
      return step;
    }
  }
  return null;
}

function hoursBetween(startIso: string, endIso: string): number {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return (end - start) / (1000 * 60 * 60);
}

async function findInboundLeadReplyAfter(
  supabase: RealtyOpsSupabaseClient,
  params: { workspaceId: string; leadId: string; afterIso: string },
): Promise<string | null> {
  const { data, error } = await supabase
    .from("conversation_messages")
    .select("created_at")
    .eq("workspace_id", params.workspaceId)
    .eq("lead_id", params.leadId)
    .eq("sender_type", "customer")
    .gt("created_at", params.afterIso)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ created_at: string }>();
  if (error !== null) return null;
  return data?.created_at ?? null;
}

async function findCompletedFubSync(
  supabase: RealtyOpsSupabaseClient,
  params: { workspaceId: string; leadId: string; afterIso: string },
): Promise<{ jobId: string; updatedAt: string } | null> {
  const { data, error } = await supabase
    .from("workflow_jobs")
    .select("id, updated_at, status")
    .eq("workspace_id", params.workspaceId)
    .eq("lead_id", params.leadId)
    .eq("job_type", "fub_sync")
    .eq("status", "completed")
    .gt("updated_at", params.afterIso)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; updated_at: string; status: string }>();
  if (error !== null) return null;
  return data === null ? null : { jobId: data.id, updatedAt: data.updated_at };
}

async function findClosedShowingTask(
  supabase: RealtyOpsSupabaseClient,
  params: { workspaceId: string; leadId: string; afterIso: string },
): Promise<{ taskId: string; closedAt: string } | null> {
  const { data, error } = await supabase
    .from("lead_tasks")
    .select("id, updated_at, status, task_type")
    .eq("workspace_id", params.workspaceId)
    .eq("lead_id", params.leadId)
    .in("task_type", ["request_showing_approval", "showing_approval", "open_house_registration"])
    .eq("status", "completed")
    .gt("updated_at", params.afterIso)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; updated_at: string; status: string; task_type: string }>();
  if (error !== null) return null;
  return data === null ? null : { taskId: data.id, closedAt: data.updated_at };
}

export type ReconciliationDeps = {
  supabase: RealtyOpsSupabaseClient;
  store: AgentTrajectoryStore;
  windows?: Partial<ReconcileWindowConfig>;
  now?: () => Date;
  batchSize?: number;
};

export type ReconciliationReport = {
  scanned: number;
  signalsRecorded: number;
  trajectoriesPromoted: number;
  errors: number;
};

export async function reconcileAgentTrajectories(
  deps: ReconciliationDeps,
): Promise<ReconciliationReport> {
  const windows = { ...DEFAULT_WINDOW, ...(deps.windows ?? {}) };
  const now = (deps.now?.() ?? new Date()).toISOString();
  // Only scan trajectories at least one window-span old so we have signal
  // to look at. Use the shortest window as the "started before" cutoff.
  const minAgeHours = Math.min(
    windows.replyEngagementHours,
    windows.routingOverrideHours,
    windows.fubAcceptanceHours,
  );
  const olderThanIso = new Date(Date.parse(now) - minAgeHours * 3600 * 1000).toISOString();

  const trajectories = await fetchPendingTrajectories(deps.supabase, {
    batchSize: deps.batchSize ?? 50,
    olderThanIso,
  });

  let signalsRecorded = 0;
  let trajectoriesPromoted = 0;
  let errors = 0;

  for (const trajectory of trajectories) {
    if (trajectory.lead_id === null) continue;

    try {
      const lead = await fetchLeadSnapshot(deps.supabase, {
        workspaceId: trajectory.workspace_id,
        leadId: trajectory.lead_id,
      });
      if (lead === null) continue;

      const steps = await fetchSteps(deps.supabase, trajectory.id);
      const existingOutcomes = await fetchOutcomeTypesForTrajectory(deps.supabase, trajectory.id);
      const trajectoryStartedAt = trajectory.started_at;
      const ageHours = hoursBetween(trajectoryStartedAt, now);

      const recordIfMissing = async (params: {
        signalType: AgentOutcomeInsert["signalType"];
        signalValue: Record<string, unknown>;
        attributedToStepId?: string | null;
      }) => {
        if (existingOutcomes.has(params.signalType)) return;
        await deps.store.recordOutcome({
          trajectoryId: trajectory.id,
          workspaceId: trajectory.workspace_id,
          signalType: params.signalType,
          signalValue: params.signalValue,
          attributedToStepId: params.attributedToStepId ?? null,
        });
        existingOutcomes.add(params.signalType);
        signalsRecorded += 1;
      };

      // ─── routing_accepted / routing_overridden ────────────────────────
      const routeStep = findStepWithToolCall(steps, "route_lead");
      if (routeStep !== null && ageHours >= windows.routingOverrideHours) {
        const aiAssignedRaw = (routeStep.turn_output?.toolCalls ?? []).find((call) => call.tool === "route_lead");
        const aiAssignedAgentId = aiAssignedRaw?.payload?.["assignedMemberId"] as string | undefined
          ?? aiAssignedRaw?.payload?.["agentId"] as string | undefined
          ?? null;

        if (lead.assigned_member_id !== null && aiAssignedAgentId !== null) {
          if (lead.assigned_member_id === aiAssignedAgentId) {
            await recordIfMissing({
              signalType: "routing_accepted",
              signalValue: { assignedMemberId: lead.assigned_member_id, aiSuggestedMemberId: aiAssignedAgentId },
              attributedToStepId: routeStep.id,
            });
          } else {
            await recordIfMissing({
              signalType: "routing_overridden",
              signalValue: {
                operatorChoseMemberId: lead.assigned_member_id,
                aiSuggestedMemberId: aiAssignedAgentId,
              },
              attributedToStepId: routeStep.id,
            });
          }
        }
      }

      // ─── reply_engaged / reply_no_engagement ──────────────────────────
      const sendStep = findStepWithToolCall(steps, "send_meta_dm")
        ?? findStepWithToolCall(steps, "send_meta_reply");
      if (sendStep !== null && ageHours >= windows.replyEngagementHours) {
        const inboundReply = await findInboundLeadReplyAfter(deps.supabase, {
          workspaceId: trajectory.workspace_id,
          leadId: trajectory.lead_id,
          afterIso: sendStep.created_at,
        });
        if (inboundReply !== null) {
          await recordIfMissing({
            signalType: "reply_engaged",
            signalValue: {
              respondedAt: inboundReply,
              hoursToReply: hoursBetween(sendStep.created_at, inboundReply),
            },
            attributedToStepId: sendStep.id,
          });
        } else {
          await recordIfMissing({
            signalType: "reply_no_engagement",
            signalValue: {
              ghostedAfterHours: ageHours,
              sendStepIteration: sendStep.iteration,
            },
            attributedToStepId: sendStep.id,
          });
        }
      }

      // ─── qualification_completed ──────────────────────────────────────
      if (
        ageHours >= windows.qualificationCompletionHours
        && (lead.status === "qualified" || lead.status === "hot")
      ) {
        await recordIfMissing({
          signalType: "qualification_completed",
          signalValue: { finalLeadStatus: lead.status },
        });
      }

      // ─── fub_accepted ─────────────────────────────────────────────────
      const fubStep = findStepWithToolCall(steps, "sync_follow_up_boss");
      if (fubStep !== null && ageHours >= windows.fubAcceptanceHours) {
        const fubResult = await findCompletedFubSync(deps.supabase, {
          workspaceId: trajectory.workspace_id,
          leadId: trajectory.lead_id,
          afterIso: fubStep.created_at,
        });
        if (fubResult !== null) {
          await recordIfMissing({
            signalType: "fub_accepted",
            signalValue: { jobId: fubResult.jobId, completedAt: fubResult.updatedAt },
            attributedToStepId: fubStep.id,
          });
        }
      }

      // ─── showing_booked ───────────────────────────────────────────────
      const showingStep = findStepWithToolCall(steps, "request_showing_approval")
        ?? findStepWithToolCall(steps, "register_open_house");
      if (showingStep !== null) {
        const closedTask = await findClosedShowingTask(deps.supabase, {
          workspaceId: trajectory.workspace_id,
          leadId: trajectory.lead_id,
          afterIso: showingStep.created_at,
        });
        if (closedTask !== null) {
          await recordIfMissing({
            signalType: "showing_booked",
            signalValue: { taskId: closedTask.taskId, closedAt: closedTask.closedAt },
            attributedToStepId: showingStep.id,
          });
        }
      }

      // ─── converted / churned ──────────────────────────────────────────
      if (lead.status === "closed_won" || lead.status === "active_client") {
        await recordIfMissing({
          signalType: "converted",
          signalValue: { finalLeadStatus: lead.status },
        });
      } else if (lead.status === "closed_lost" || lead.status === "archived") {
        await recordIfMissing({
          signalType: "churned",
          signalValue: { finalLeadStatus: lead.status },
        });
      }

      // ─── promote outcome_label if any decisive signal landed ──────────
      const decisiveSet = new Set(["converted", "qualification_completed", "fub_accepted", "showing_booked", "reply_engaged", "routing_accepted"]);
      const negativeSet = new Set(["churned", "reply_no_engagement", "routing_overridden"]);
      let promotedTo: "positive" | "negative" | "neutral" | null = null;
      for (const signal of existingOutcomes) {
        if (decisiveSet.has(signal)) {
          promotedTo = "positive";
          break;
        }
        if (negativeSet.has(signal)) {
          promotedTo = "negative";
        }
      }
      if (promotedTo !== null) {
        const occurredAt = new Date().toISOString();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: promoteError } = await (deps.supabase as any)
          .from("agent_trajectories")
          .update({
            outcome_label: promotedTo,
            final_lead_status: lead.status,
            updated_at: occurredAt,
          })
          .eq("id", trajectory.id);
        if (promoteError === null) {
          trajectoriesPromoted += 1;
        }
      }
    } catch (perTrajectoryError) {
      console.warn("[reconcileAgentTrajectories] error on trajectory", trajectory.id, perTrajectoryError);
      errors += 1;
    }
  }

  return {
    scanned: trajectories.length,
    signalsRecorded,
    trajectoriesPromoted,
    errors,
  };
}
