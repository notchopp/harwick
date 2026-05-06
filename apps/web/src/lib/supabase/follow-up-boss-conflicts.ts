import type { FollowUpBossConflictItem } from "@realty-ops/core";
import type { FollowUpBossConflictRepository } from "../../features/operations/follow-up-boss-conflicts";
import type { CrmBacksyncEventRow } from "./database.types";
import type { LeadRow } from "./leads";
import type { RealtyOpsSupabaseClient } from "./server-client";
import { createWorkflowJobEnqueuer } from "./workflow-jobs";

type LeadConflictRow = Pick<LeadRow, "id" | "workspace_id" | "assigned_agent_id" | "follow_up_boss_contact_id">;
type ConflictEventRow = Pick<
  CrmBacksyncEventRow,
  "id" | "workspace_id" | "provider_event_id" | "event_type" | "resource_ids" | "payload" | "status" | "event_created_at"
>;

function readPayloadDetail(payload: Record<string, unknown>): string | null {
  const type = payload["type"];
  const action = payload["action"];
  const detail = [type, action].filter((value): value is string => typeof value === "string" && value.trim().length > 0).join(" ");

  return detail.length > 0 ? detail : null;
}

async function loadConflictItemByEventId(
  supabase: RealtyOpsSupabaseClient,
  params: {
    workspaceId: string;
    backsyncEventId: string;
  },
): Promise<FollowUpBossConflictItem | null> {
  const { data: event, error: eventError } = await supabase
    .from("crm_backsync_events")
    .select("id,workspace_id,provider_event_id,event_type,resource_ids,payload,status,event_created_at")
    .eq("workspace_id", params.workspaceId)
    .eq("id", params.backsyncEventId)
    .maybeSingle<ConflictEventRow>();

  if (eventError !== null) {
    throw eventError;
  }
  if (event === null) {
    return null;
  }

  const contactIds = event.resource_ids.map((resourceId) => String(resourceId));
  if (contactIds.length === 0) {
    return null;
  }

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id,workspace_id,assigned_agent_id,follow_up_boss_contact_id")
    .eq("workspace_id", params.workspaceId)
    .in("follow_up_boss_contact_id", contactIds)
    .not("assigned_agent_id", "is", null)
    .maybeSingle<LeadConflictRow>();

  if (leadError !== null) {
    throw leadError;
  }
  if (lead === null || lead.follow_up_boss_contact_id === null) {
    return null;
  }

  return {
    id: `fub_conflict:${event.id}`,
    workspaceId: event.workspace_id,
    leadId: lead.id,
    followUpBossContactId: lead.follow_up_boss_contact_id,
    assignedAgentId: lead.assigned_agent_id,
    eventType: event.event_type,
    status: event.status,
    detail: event.payload ? readPayloadDetail(event.payload as Record<string, unknown>) : null,
    occurredAt: event.event_created_at,
  };
}

export function createSupabaseFollowUpBossConflictRepository(
  supabase: RealtyOpsSupabaseClient,
): FollowUpBossConflictRepository {
  return {
    async listPotentialConflicts(params) {
      const { data: leads, error: leadError } = await supabase
        .from("leads")
        .select("id,workspace_id,assigned_agent_id,follow_up_boss_contact_id")
        .eq("workspace_id", params.workspaceId)
        .not("follow_up_boss_contact_id", "is", null)
        .not("assigned_agent_id", "is", null)
        .returns<LeadConflictRow[]>();

      if (leadError !== null) {
        throw leadError;
      }

      const contactIds = (leads ?? [])
        .map((lead) => lead.follow_up_boss_contact_id)
        .filter((value): value is string => value !== null);
      if (contactIds.length === 0) {
        return [];
      }

      const { data: events, error: eventError } = await supabase
        .from("crm_backsync_events")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .neq("status", "ignored")
        .in("event_type", ["peopleUpdated", "peopleStageUpdated", "tasksCreated", "textMessagesCreated", "callsCreated"])
        .order("event_created_at", { ascending: false })
        .limit(params.limit * 5)
        .returns<CrmBacksyncEventRow[]>();

      if (eventError !== null) {
        throw eventError;
      }

      const leadsByContactId = new Map(contactIds.map((contactId) => {
        return [contactId, (leads ?? []).find((lead) => lead.follow_up_boss_contact_id === contactId)!];
      }));

      return (events ?? []).flatMap((event): FollowUpBossConflictItem[] => {
        const matchedContactId = event.resource_ids
          .map((resourceId) => String(resourceId))
          .find((resourceId) => leadsByContactId.has(resourceId));
        if (matchedContactId === undefined) {
          return [];
        }

        const lead = leadsByContactId.get(matchedContactId)!;
        return [{
          id: `fub_conflict:${event.id}`,
          workspaceId: event.workspace_id,
          leadId: lead.id,
          followUpBossContactId: matchedContactId,
          assignedAgentId: lead.assigned_agent_id,
          eventType: event.event_type,
          status: event.status,
          detail: event.payload ? readPayloadDetail(event.payload as Record<string, unknown>) : null,
          occurredAt: event.event_created_at,
        }];
      }).slice(0, params.limit);
    },

    async ignoreConflict(params) {
      const { error } = await supabase
        .from("crm_backsync_events")
        .update({
          status: "ignored",
          processed_at: new Date().toISOString(),
          last_error_code: "operator_ignored",
          last_error_message: params.reason ?? "Ignored from the Follow Up Boss conflict queue.",
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.backsyncEventId);

      if (error !== null) {
        throw error;
      }

      return loadConflictItemByEventId(supabase, params);
    },

    async replayConflict(params) {
      const item = await loadConflictItemByEventId(supabase, params);
      if (item === null) {
        return null;
      }

      const { error } = await supabase
        .from("crm_backsync_events")
        .update({
          status: "queued",
          processed_at: null,
          last_error_code: null,
          last_error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.backsyncEventId);

      if (error !== null) {
        throw error;
      }

      await createWorkflowJobEnqueuer(supabase)({
        workspaceId: params.workspaceId,
        leadId: null,
        leadEventId: null,
        jobType: "fub_backsync_reconcile",
        idempotencyKey: `fub_backsync_reconcile:manual:${params.backsyncEventId}:${new Date().toISOString()}`,
        payload: {
          jobType: "fub_backsync_reconcile",
          workspaceId: params.workspaceId,
          backsyncEventId: params.backsyncEventId,
        },
      });

      return loadConflictItemByEventId(supabase, params);
    },
  };
}
