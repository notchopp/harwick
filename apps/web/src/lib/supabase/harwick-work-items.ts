import {
  HarwickHomeWorkItemSchema,
  HarwickWorkItemCreateSchema,
  type HarwickHomeWorkItem,
  type HarwickWorkItemCreate,
  type WorkspaceRole,
} from "@realty-ops/core";
import type {
  ProactiveInsightRepository,
  AmbiguousInboundEvent,
  DormantLead,
  UnassignedPriorityLead,
  WorkspaceMemoryPattern,
  WorkspaceMemoryReviewStats,
} from "../../features/agent-runtime/proactive-insights";
import type {
  HarwickLoopApprovalRepository,
  HarwickLoopWorkItemForApproval,
} from "../../features/agent-runtime/approve-harwick-loop-work-item";
import type { HarwickWorkItemInsertRow, Json, TablesInsert, TablesUpdate } from "./database.types";
import type { RealtyOpsSupabaseClient } from "./server-client";

export type HarwickWorkItemFeedbackLabel =
  | "useful"
  | "not_relevant"
  | "wrong_person"
  | "already_handled"
  | "needs_more_context";

export type HarwickWorkItemActionResult = {
  workItemId: string;
  leadId: string | null;
  trajectoryId: string | null;
  stepId: string | null;
};

export type HarwickWorkItemRepository = {
  createWorkItem(item: HarwickWorkItemCreate): Promise<{ workItemId: string }>;
  findOpenInsightBySignalKey(params: {
    workspaceId: string;
    signalKey: string;
  }): Promise<{ id: string } | null>;
  listVisibleHomeWorkItems(params: {
    workspaceId: string;
    memberId: string;
    role: WorkspaceRole;
    limit: number;
  }): Promise<HarwickHomeWorkItem[]>;
  updateWorkItemStatus(params: {
    workspaceId: string;
    workItemId: string;
    status: "seen" | "dismissed" | "completed";
    actorMemberId?: string | null;
    feedbackLabel?: HarwickWorkItemFeedbackLabel | null;
    feedbackNote?: string | null;
  }): Promise<HarwickWorkItemActionResult>;
};

function mapWorkItemCreateToInsertRow(item: HarwickWorkItemCreate): HarwickWorkItemInsertRow {
  const parsed = HarwickWorkItemCreateSchema.parse(item);
  return {
    workspace_id: parsed.workspaceId,
    lead_id: parsed.leadId,
    routing_decision_id: parsed.routingDecisionId,
    trajectory_id: parsed.trajectoryId,
    step_id: parsed.stepId,
    item_type: parsed.type,
    status: parsed.status,
    target_member_id: parsed.targetMemberId,
    target_role: parsed.targetRole,
    priority: parsed.priority,
    title: parsed.title,
    summary: parsed.summary,
    recommended_action: parsed.recommendedAction,
    reason: parsed.reason,
    payload: parsed.payload as Json,
    due_at: parsed.dueAt,
  };
}

type WorkItemIdRow = {
  id: string;
};

type WorkItemActionRow = {
  id: string;
  lead_id: string | null;
  trajectory_id: string | null;
  step_id: string | null;
  payload: Json;
};

type LoopApprovalWorkItemRow = WorkItemActionRow & {
  workspace_id: string;
  item_type: string;
  status: string;
  priority: string;
};

type HomeWorkItemRow = {
  id: string;
  workspace_id: string;
  lead_id: string | null;
  item_type: string;
  status: string;
  priority: string;
  title: string;
  summary: string;
  recommended_action: string;
  reason: string;
  target_member_id: string | null;
  target_role: string | null;
  created_at: string;
  due_at: string | null;
  payload: Json;
};

function canSeeWorkItem(
  row: HomeWorkItemRow,
  params: { memberId: string; role: WorkspaceRole },
): boolean {
  if (params.role === "owner" || params.role === "admin") {
    return true;
  }

  return row.target_member_id === params.memberId || row.target_role === params.role;
}

function mapHomeWorkItemRow(row: HomeWorkItemRow): HarwickHomeWorkItem {
  return HarwickHomeWorkItemSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    leadId: row.lead_id,
    type: row.item_type,
    status: row.status,
    priority: row.priority,
    title: row.title,
    summary: row.summary,
    recommendedAction: row.recommended_action,
    reason: row.reason,
    targetMemberId: row.target_member_id,
    targetRole: row.target_role,
    createdAt: row.created_at,
    dueAt: row.due_at,
    payload: payloadAsRecord(row.payload),
  });
}

type AmbiguousInboundEventRow = {
  id: string;
  workspace_id: string;
  lead_id: string | null;
  text: string | null;
  occurred_at: string;
  source_channel: string;
  lead_classification_confidence: number | null;
  lead_classification_reason: string | null;
  lead_classification_hint: string | null;
};

type UnassignedPriorityLeadRow = {
  id: string;
  workspace_id: string;
  status: string;
  score: number;
  lead_type: string;
  full_name: string | null;
  target_area: string | null;
  timeline: string | null;
  last_message_at: string | null;
};

type DormantLeadRow = UnassignedPriorityLeadRow & {
  assigned_agent_id: string | null;
};

type WorkspaceMemoryPatternRow = {
  id: string;
  workspace_id: string;
  memory_type: string;
  title: string;
  body: string;
  source: string;
  confidence: number;
  last_observed_at: string;
  updated_at: string;
};

type WorkspaceMemoryReviewStatsRow = {
  workspace_id: string;
  review_status: string;
  reviewed_at: string | null;
  updated_at: string;
};

function payloadAsRecord(payload: Json): Record<string, unknown> {
  return typeof payload === "object" && payload !== null && !Array.isArray(payload)
    ? payload
    : {};
}

function parseWorkItemPriority(value: string): HarwickLoopWorkItemForApproval["priority"] {
  if (value === "low" || value === "high" || value === "urgent") return value;
  return "normal";
}

function mapLoopApprovalWorkItemRow(row: LoopApprovalWorkItemRow): HarwickLoopWorkItemForApproval {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    leadId: row.lead_id,
    trajectoryId: row.trajectory_id,
    stepId: row.step_id,
    type: row.item_type,
    status: row.status,
    priority: parseWorkItemPriority(row.priority),
    payload: payloadAsRecord(row.payload),
  };
}

export function createSupabaseHarwickWorkItemRepository(
  supabase: RealtyOpsSupabaseClient,
): HarwickWorkItemRepository & ProactiveInsightRepository {
  return {
    async createWorkItem(item) {
      const insert = mapWorkItemCreateToInsertRow(item);
      const { data, error } = await supabase
        .from("harwick_work_items")
        .insert(insert)
        .select("id")
        .single<WorkItemIdRow>();

      if (error !== null) {
        throw error;
      }

      return { workItemId: data.id };
    },

    async findOpenInsightBySignalKey(params) {
      const { data, error } = await supabase
        .from("harwick_work_items")
        .select("id")
        .eq("workspace_id", params.workspaceId)
        .in("status", ["pending", "surfaced", "seen"])
        .contains("payload", { signalKey: params.signalKey })
        .limit(1)
        .maybeSingle<WorkItemIdRow>();

      if (error !== null) {
        throw error;
      }

      return data ?? null;
    },

    async listAmbiguousInboundEvents(params) {
      const { data, error } = await supabase
        .from("lead_events")
        .select("id, workspace_id, lead_id, text, occurred_at, source_channel, lead_classification_confidence, lead_classification_reason, lead_classification_hint")
        .eq("lead_classification", "needs_review")
        .not("lead_id", "is", null)
        .gte("occurred_at", params.sinceIso)
        .order("occurred_at", { ascending: false })
        .limit(params.limit);

      if (error !== null) {
        throw error;
      }

      return ((data ?? []) as AmbiguousInboundEventRow[])
        .filter((row): row is AmbiguousInboundEventRow & { lead_id: string } => row.lead_id !== null)
        .map((row): AmbiguousInboundEvent => ({
          id: row.id,
          workspaceId: row.workspace_id,
          leadId: row.lead_id,
          text: row.text,
          occurredAt: row.occurred_at,
          sourceChannel: row.source_channel,
          confidence: row.lead_classification_confidence,
          reasonCode: row.lead_classification_reason,
          leadHint: row.lead_classification_hint,
        }));
    },

    async listVisibleHomeWorkItems(params) {
      const { data, error } = await supabase
        .from("harwick_work_items")
        .select("id, workspace_id, lead_id, item_type, status, priority, title, summary, recommended_action, reason, target_member_id, target_role, created_at, due_at, payload")
        .eq("workspace_id", params.workspaceId)
        .in("status", ["pending", "surfaced", "seen"])
        .order("priority", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(Math.max(params.limit * 3, params.limit));

      if (error !== null) {
        throw error;
      }

      return ((data ?? []) as HomeWorkItemRow[])
        .filter((row) => canSeeWorkItem(row, params))
        .slice(0, params.limit)
        .map(mapHomeWorkItemRow);
    },

    async updateWorkItemStatus(params) {
      const now = new Date().toISOString();
      const { data: existing, error: readError } = await supabase
        .from("harwick_work_items")
        .select("id, lead_id, trajectory_id, step_id, payload")
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.workItemId)
        .single<WorkItemActionRow>();

      if (readError !== null) {
        throw readError;
      }

      const feedback = params.feedbackLabel === undefined || params.feedbackLabel === null
        ? {}
        : {
            operatorFeedback: {
              label: params.feedbackLabel,
              note: params.feedbackNote ?? null,
              actorMemberId: params.actorMemberId ?? null,
              recordedAt: now,
            },
          };
      const update: TablesUpdate<"harwick_work_items"> = {
        status: params.status,
        updated_at: now,
        ...(params.status === "seen" ? { seen_at: now } : {}),
        ...(params.status === "dismissed" || params.status === "completed" ? { completed_at: now } : {}),
        ...(params.feedbackLabel === undefined || params.feedbackLabel === null
          ? {}
          : { payload: { ...payloadAsRecord(existing.payload), ...feedback } }),
      };
      const { data, error } = await supabase
        .from("harwick_work_items")
        .update(update)
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.workItemId)
        .select("id")
        .single<WorkItemIdRow>();

      if (error !== null) {
        throw error;
      }

      return {
        workItemId: data.id,
        leadId: existing.lead_id,
        trajectoryId: existing.trajectory_id,
        stepId: existing.step_id,
      };
    },

    async listUnassignedPriorityLeads(params) {
      const { data, error } = await supabase
        .from("leads")
        .select("id, workspace_id, status, score, lead_type, full_name, target_area, timeline, last_message_at")
        .in("status", ["hot", "qualified"])
        .is("assigned_agent_id", null)
        .order("score", { ascending: false })
        .limit(params.limit);

      if (error !== null) {
        throw error;
      }

      return ((data ?? []) as UnassignedPriorityLeadRow[]).map((row): UnassignedPriorityLead => ({
        id: row.id,
        workspaceId: row.workspace_id,
        status: row.status,
        score: row.score,
        leadType: row.lead_type,
        fullName: row.full_name,
        targetArea: row.target_area,
        timeline: row.timeline,
        lastMessageAt: row.last_message_at,
      }));
    },

    async listDormantLeads(params) {
      const { data, error } = await supabase
        .from("leads")
        .select("id, workspace_id, status, score, lead_type, full_name, target_area, timeline, last_message_at, assigned_agent_id")
        .in("status", ["engaged", "qualified", "hot", "assigned", "nurture"])
        .not("last_message_at", "is", null)
        .lt("last_message_at", params.beforeIso)
        .is("next_followup_at", null)
        .order("last_message_at", { ascending: true })
        .limit(params.limit);

      if (error !== null) {
        throw error;
      }

      return ((data ?? []) as DormantLeadRow[])
        .filter((row): row is DormantLeadRow & { last_message_at: string } => row.last_message_at !== null)
        .map((row): DormantLead => ({
          id: row.id,
          workspaceId: row.workspace_id,
          status: row.status,
          score: row.score,
          leadType: row.lead_type,
          fullName: row.full_name,
          targetArea: row.target_area,
          timeline: row.timeline,
          lastMessageAt: row.last_message_at,
          assignedAgentId: row.assigned_agent_id,
        }));
    },

    async listWorkspaceMemoryPatterns(params) {
      const { data, error } = await supabase
        .from("workspace_memory_documents")
        .select("id, workspace_id, memory_type, title, body, source, confidence, last_observed_at, updated_at")
        .gte("updated_at", params.sinceIso)
        .neq("review_status", "dismissed")
        .order("confidence", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(params.limit);

      if (error !== null) {
        throw error;
      }

      return ((data ?? []) as WorkspaceMemoryPatternRow[])
        .filter((row) => row.source === "distillation_worker" || row.source === "system")
        .map((row): WorkspaceMemoryPattern => ({
          id: row.id,
          workspaceId: row.workspace_id,
          memoryType: row.memory_type,
          title: row.title,
          body: row.body,
          source: row.source,
          confidence: row.confidence,
          lastObservedAt: row.last_observed_at,
          updatedAt: row.updated_at,
        }));
    },

    async listWorkspaceMemoryReviewStats(params) {
      const { data, error } = await supabase
        .from("workspace_memory_documents")
        .select("workspace_id, review_status, reviewed_at, updated_at")
        .gte("updated_at", params.sinceIso)
        .order("updated_at", { ascending: false })
        .limit(params.limit * 50);

      if (error !== null) {
        throw error;
      }

      const grouped = new Map<string, WorkspaceMemoryReviewStats>();

      for (const row of (data ?? []) as WorkspaceMemoryReviewStatsRow[]) {
        const current = grouped.get(row.workspace_id) ?? {
          workspaceId: row.workspace_id,
          pendingCount: 0,
          approvedCount: 0,
          dismissedCount: 0,
          latestObservedAt: row.reviewed_at ?? row.updated_at,
        };
        if (row.review_status === "pending") {
          current.pendingCount += 1;
        } else if (row.review_status === "approved") {
          current.approvedCount += 1;
        } else if (row.review_status === "dismissed") {
          current.dismissedCount += 1;
        }

        const observedAt = row.reviewed_at ?? row.updated_at;
        if (Date.parse(observedAt) > Date.parse(current.latestObservedAt)) {
          current.latestObservedAt = observedAt;
        }
        grouped.set(row.workspace_id, current);
      }

      return [...grouped.values()]
        .sort((a, b) => Date.parse(b.latestObservedAt) - Date.parse(a.latestObservedAt))
        .slice(0, params.limit);
    },
  };
}

export function createSupabaseHarwickLoopApprovalRepository(
  supabase: RealtyOpsSupabaseClient,
): HarwickLoopApprovalRepository {
  return {
    async getLoopWorkItemForApproval(params) {
      const { data, error } = await supabase
        .from("harwick_work_items")
        .select("id, workspace_id, lead_id, trajectory_id, step_id, item_type, status, priority, payload")
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.workItemId)
        .maybeSingle<LoopApprovalWorkItemRow>();

      if (error !== null) {
        throw error;
      }

      return data === null ? null : mapLoopApprovalWorkItemRow(data);
    },

    async enqueueLoopSubagentTask(params) {
      const insert: TablesInsert<"harwick_subagent_tasks"> = {
        workspace_id: params.workspaceId,
        lead_id: params.leadId,
        trajectory_id: params.trajectoryId,
        step_id: params.stepId,
        subagent_type: params.subagentType,
        status: "queued",
        priority: params.priority,
        title: params.title,
        instructions: params.instructions,
        payload: params.payload as Json,
        created_at: params.nowIso,
        updated_at: params.nowIso,
      };
      const { data, error } = await supabase
        .from("harwick_subagent_tasks")
        .insert(insert)
        .select("id")
        .single<{ id: string }>();

      if (error !== null) {
        throw error;
      }

      return { taskId: data.id };
    },

    async completeLoopWorkItemApproval(params) {
      const update: TablesUpdate<"harwick_work_items"> = {
        status: "completed",
        completed_at: params.nowIso,
        updated_at: params.nowIso,
        payload: params.payload as Json,
      };
      const { error } = await supabase
        .from("harwick_work_items")
        .update(update)
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.workItemId);

      if (error !== null) {
        throw error;
      }
    },
  };
}
