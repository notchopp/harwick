import { HarwickWorkItemCreateSchema, type HarwickWorkItemCreate } from "@realty-ops/core";
import type { ProactiveInsightRepository, AmbiguousInboundEvent, DormantLead, UnassignedPriorityLead } from "../../features/agent-runtime/proactive-insights";
import type { HarwickWorkItemInsertRow, Json } from "./database.types";
import type { RealtyOpsSupabaseClient } from "./server-client";

export type HarwickWorkItemRepository = {
  createWorkItem(item: HarwickWorkItemCreate): Promise<{ workItemId: string }>;
  findOpenInsightBySignalKey(params: {
    workspaceId: string;
    signalKey: string;
  }): Promise<{ id: string } | null>;
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
        .eq("item_type", "insight")
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
  };
}
