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
  ClosedWonLeadOpportunity,
  CrossChannelLeadSignal,
  DormantLead,
  SocialLifecycleOpportunity,
  StalledShowingApproval,
  UnassignedPriorityLead,
  VoicePostCallOpportunity,
  WorkspaceMemoryPattern,
  WorkspaceMemoryReviewStats,
} from "../../features/agent-runtime/proactive-insights";
import type {
  HarwickLoopApprovalRepository,
  HarwickLoopWorkItemForApproval,
} from "../../features/agent-runtime/approve-harwick-loop-work-item";
import type { HarwickWorkItemInsertRow, Json, TablesInsert, TablesUpdate } from "./database.types";
import type { LeadRow } from "./leads";
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

type SocialLifecycleLeadRow = DormantLeadRow & {
  next_followup_at: string | null;
  source_channel: string;
};

type LeadEventSignalRow = {
  workspace_id: string;
  lead_id: string | null;
  source_channel: string;
  occurred_at: string;
  source_comment_id: string | null;
};

type LeadIdentityRow = {
  id: string;
  workspace_id: string;
  full_name: string | null;
  status: string;
  assigned_agent_id: string | null;
};

type VoicePostCallRow = {
  id: string;
  workspace_id: string;
  lead_id: string | null;
  caller_name: string | null;
  summary: string;
  urgency: string;
  created_at: string;
  target_area: string | null;
  timeline: string | null;
  budget: string | null;
  financing_status: string;
  lead_type: string;
};

type LeadTaskSignalRow = {
  id: string;
  workspace_id: string;
  lead_id: string | null;
  assigned_member_id: string | null;
  title: string;
  created_at: string;
  due_at: string | null;
  requested_start_at: string | null;
  task_type: string;
  status: string;
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

const socialLeadChannels = [
  "instagram_dm",
  "instagram_comment",
  "facebook_dm",
  "facebook_comment",
] as const;

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

    async listSocialLifecycleOpportunities(params) {
      const { data: leadData, error: leadError } = await supabase
        .from("leads")
        .select("id, workspace_id, status, score, lead_type, full_name, target_area, timeline, last_message_at, assigned_agent_id, next_followup_at, source_channel")
        .in("source_channel", [...socialLeadChannels])
        .in("status", ["new", "engaged", "qualified", "hot", "assigned"])
        .not("last_message_at", "is", null)
        .order("last_message_at", { ascending: false })
        .limit(Math.max(params.limit * 4, params.limit));

      if (leadError !== null) {
        throw leadError;
      }

      const leadSignals = ((leadData ?? []) as SocialLifecycleLeadRow[])
        .filter((row): row is SocialLifecycleLeadRow & { last_message_at: string } => row.last_message_at !== null)
        .flatMap((row): SocialLifecycleOpportunity[] => {
          if (row.last_message_at <= params.idleBeforeIso && row.next_followup_at === null) {
            return [{
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
              sourceChannel: row.source_channel,
              trigger: "post_idle",
              latestEventAt: row.last_message_at,
              sourceCommentId: null,
            }];
          }

          if (row.last_message_at < params.sinceIso) {
            return [];
          }

          return [{
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
            sourceChannel: row.source_channel,
            trigger: row.status === "qualified" || row.status === "hot" || row.status === "assigned"
              ? "post_milestone"
              : "post_message",
            latestEventAt: row.last_message_at,
            sourceCommentId: null,
          }];
        });

      const { data: handoffData, error: handoffError } = await supabase
        .from("lead_events")
        .select("workspace_id, lead_id, source_channel, occurred_at, source_comment_id")
        .in("source_channel", ["instagram_dm", "facebook_dm"])
        .eq("event_type", "reply_sent")
        .not("lead_id", "is", null)
        .not("source_comment_id", "is", null)
        .gte("occurred_at", params.sinceIso)
        .order("occurred_at", { ascending: false })
        .limit(params.limit);

      if (handoffError !== null) {
        throw handoffError;
      }

      const handoffLeadIds = [...new Set(((handoffData ?? []) as LeadEventSignalRow[])
        .flatMap((row) => row.lead_id === null ? [] : [row.lead_id]))];
      const leadMap = new Map<string, LeadIdentityRow>();
      if (handoffLeadIds.length > 0) {
        const { data, error } = await supabase
          .from("leads")
          .select("id, workspace_id, full_name, status, assigned_agent_id")
          .in("id", handoffLeadIds);

        if (error !== null) {
          throw error;
        }

        for (const row of (data ?? []) as LeadIdentityRow[]) {
          leadMap.set(row.id, row);
        }
      }

      const handoffSignals = ((handoffData ?? []) as LeadEventSignalRow[])
        .filter((row): row is LeadEventSignalRow & { lead_id: string } => row.lead_id !== null)
        .map((row): SocialLifecycleOpportunity => {
          const lead = leadMap.get(row.lead_id);
          return {
            id: row.lead_id,
            workspaceId: row.workspace_id,
            status: lead?.status ?? "engaged",
            score: 0,
            leadType: "unknown",
            fullName: lead?.full_name ?? null,
            targetArea: null,
            timeline: null,
            lastMessageAt: row.occurred_at,
            assignedAgentId: lead?.assigned_agent_id ?? null,
            sourceChannel: row.source_channel,
            trigger: "post_handoff",
            latestEventAt: row.occurred_at,
            sourceCommentId: row.source_comment_id,
          };
        });

      const deduped = new Map<string, SocialLifecycleOpportunity>();
      for (const candidate of [...handoffSignals, ...leadSignals]) {
        const key = `${candidate.id}:${candidate.trigger}`;
        const current = deduped.get(key);
        if (current === undefined || Date.parse(candidate.latestEventAt) > Date.parse(current.latestEventAt)) {
          deduped.set(key, candidate);
        }
      }

      return [...deduped.values()]
        .sort((left, right) => Date.parse(right.latestEventAt) - Date.parse(left.latestEventAt))
        .slice(0, params.limit);
    },

    async listCrossChannelLeadSignals(params) {
      const { data, error } = await supabase
        .from("lead_events")
        .select("workspace_id, lead_id, source_channel, occurred_at, source_comment_id")
        .not("lead_id", "is", null)
        .gte("occurred_at", params.sinceIso)
        .order("occurred_at", { ascending: false })
        .limit(Math.max(params.limit * 20, params.limit));

      if (error !== null) {
        throw error;
      }

      const rows = ((data ?? []) as LeadEventSignalRow[])
        .filter((row): row is LeadEventSignalRow & { lead_id: string } => row.lead_id !== null);
      const leadIds = [...new Set(rows.map((row) => row.lead_id))];
      const leadMap = new Map<string, LeadIdentityRow>();
      if (leadIds.length > 0) {
        const { data: leadsData, error: leadsError } = await supabase
          .from("leads")
          .select("id, workspace_id, full_name, status, assigned_agent_id")
          .in("id", leadIds);

        if (leadsError !== null) {
          throw leadsError;
        }

        for (const row of (leadsData ?? []) as LeadIdentityRow[]) {
          leadMap.set(row.id, row);
        }
      }

      const grouped = new Map<string, CrossChannelLeadSignal>();
      for (const row of rows) {
        const lead = leadMap.get(row.lead_id);
        if (lead === undefined) continue;
        const current = grouped.get(row.lead_id) ?? {
          workspaceId: row.workspace_id,
          leadId: row.lead_id,
          fullName: lead.full_name,
          assignedAgentId: lead.assigned_agent_id,
          leadStatus: lead.status,
          channels: [],
          latestOccurredAt: row.occurred_at,
        };
        if (!current.channels.includes(row.source_channel)) {
          current.channels.push(row.source_channel);
        }
        if (Date.parse(row.occurred_at) > Date.parse(current.latestOccurredAt)) {
          current.latestOccurredAt = row.occurred_at;
        }
        grouped.set(row.lead_id, current);
      }

      return [...grouped.values()]
        .filter((row) => row.channels.length >= 2)
        .sort((left, right) => Date.parse(right.latestOccurredAt) - Date.parse(left.latestOccurredAt))
        .slice(0, params.limit);
    },

    async listVoicePostCallOpportunities(params) {
      const { data, error } = await supabase
        .from("voice_lead_handoffs")
        .select("id, workspace_id, lead_id, caller_name, summary, urgency, created_at, target_area, timeline, budget, financing_status, lead_type")
        .eq("review_status", "pending")
        .gte("created_at", params.sinceIso)
        .order("created_at", { ascending: false })
        .limit(params.limit);

      if (error !== null) {
        throw error;
      }

      return ((data ?? []) as VoicePostCallRow[]).map((row): VoicePostCallOpportunity => ({
        workspaceId: row.workspace_id,
        handoffId: row.id,
        leadId: row.lead_id,
        callerName: row.caller_name,
        summary: row.summary,
        urgency: row.urgency,
        createdAt: row.created_at,
        targetArea: row.target_area,
        timeline: row.timeline,
        budget: row.budget,
        financingStatus: row.financing_status,
        leadType: row.lead_type,
      }));
    },

    async listStalledShowingApprovals(params) {
      const { data, error } = await supabase
        .from("lead_tasks")
        .select("id, workspace_id, lead_id, assigned_member_id, title, created_at, due_at, requested_start_at, task_type, status")
        .in("task_type", ["request_showing_approval", "showing_approval"])
        .in("status", ["pending", "queued"])
        .not("lead_id", "is", null)
        .lt("created_at", params.beforeIso)
        .order("created_at", { ascending: true })
        .limit(params.limit)
        .returns<LeadTaskSignalRow[]>();

      if (error !== null) {
        throw error;
      }

      const rows = (data ?? []).filter((row): row is LeadTaskSignalRow & { lead_id: string } => row.lead_id !== null);
      const leadIds = [...new Set(rows.map((row) => row.lead_id))];
      const leadMap = new Map<string, LeadRow>();
      if (leadIds.length > 0) {
        const { data: leadsData, error: leadsError } = await supabase
          .from("leads")
          .select("*")
          .in("id", leadIds)
          .returns<LeadRow[]>();

        if (leadsError !== null) {
          throw leadsError;
        }

        for (const row of leadsData ?? []) {
          leadMap.set(row.id, row);
        }
      }

      return rows.flatMap((row): StalledShowingApproval[] => {
        const lead = leadMap.get(row.lead_id);
        if (lead === undefined) return [];
        return [{
          workspaceId: row.workspace_id,
          taskId: row.id,
          leadId: row.lead_id,
          leadName: lead.full_name ?? lead.instagram_username ?? lead.phone ?? null,
          assignedMemberId: row.assigned_member_id ?? lead.assigned_agent_id,
          taskTitle: row.title,
          requestedAt: row.created_at,
          dueAt: row.due_at,
          requestedStartAt: row.requested_start_at,
          targetArea: lead.target_area,
          timeline: lead.timeline,
          sourceChannel: lead.source_channel,
        }];
      });
    },

    async listClosedWonLeadOpportunities(params) {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .in("status", ["active_client", "closed_won"])
        .is("next_followup_at", null)
        .gte("updated_at", params.sinceIso)
        .order("updated_at", { ascending: false })
        .limit(params.limit)
        .returns<LeadRow[]>();

      if (error !== null) {
        throw error;
      }

      return (data ?? []).map((row): ClosedWonLeadOpportunity => ({
        workspaceId: row.workspace_id,
        leadId: row.id,
        fullName: row.full_name ?? row.instagram_username ?? row.phone ?? null,
        assignedAgentId: row.assigned_agent_id,
        status: row.status,
        sourceChannel: row.source_channel,
        targetArea: row.target_area,
        timeline: row.timeline,
        closedAt: row.updated_at,
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
