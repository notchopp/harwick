import type { FollowUpBossConflictItem } from "@realty-ops/core";
import type { FollowUpBossConflictRepository } from "../../features/operations/follow-up-boss-conflicts";
import type { CrmBacksyncEventRow } from "./database.types";
import type { LeadRow } from "./leads";
import type { RealtyOpsSupabaseClient } from "./server-client";

type LeadConflictRow = Pick<LeadRow, "id" | "workspace_id" | "assigned_agent_id" | "follow_up_boss_contact_id">;

function readPayloadDetail(payload: Record<string, unknown>): string | null {
  const type = payload["type"];
  const action = payload["action"];
  const detail = [type, action].filter((value): value is string => typeof value === "string" && value.trim().length > 0).join(" ");

  return detail.length > 0 ? detail : null;
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
  };
}
