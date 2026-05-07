import type { TablesInsert } from "../../lib/supabase/database.types";
import { routeLeadWithHarwick } from "../leads/lead-routing-action";
import { createSupabaseAuditLogRepository } from "../../lib/supabase/audit-logs";
import { createSupabaseConversationAutomationRepository } from "../../lib/supabase/conversation-automation";
import { createSupabaseLeadRoutingActionRepository } from "../../lib/supabase/leads";
import type { RealtyOpsSupabaseClient } from "../../lib/supabase/server-client";
import type {
  HarwickApprovalAdapters,
  HarwickOpenHouseApprovalAdapter,
  HarwickPauseAutomationApprovalAdapter,
  HarwickRouteLeadApprovalAdapter,
  HarwickShowingApprovalAdapter,
  HarwickSyncFubApprovalAdapter,
} from "./approve-harwick-loop-work-item";

const ROUTE_LEAD_UNDO_WINDOW_MINUTES = 10;
const FUB_SYNC_MAX_ATTEMPTS = 5;

type ApproverRole =
  | "owner"
  | "admin"
  | "team_lead"
  | "lead_manager"
  | "operator"
  | "agent"
  | "viewer";

function readPayloadString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readIsoFromPayload(payload: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length === 0) continue;
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  return null;
}

function buildRouteLeadAdapter(params: {
  supabase: RealtyOpsSupabaseClient;
  approverRole: ApproverRole;
}): HarwickRouteLeadApprovalAdapter {
  return {
    async executeRouteLead({ workspaceId, leadId, approverMemberId, callPayload, nowIso }) {
      const undoExpiresAt = new Date(
        Date.parse(nowIso) + ROUTE_LEAD_UNDO_WINDOW_MINUTES * 60_000,
      ).toISOString();
      const result = await routeLeadWithHarwick({
        workspaceId,
        leadId,
        viewer: { memberId: approverMemberId, role: params.approverRole },
        input: callPayload,
        repository: createSupabaseLeadRoutingActionRepository(params.supabase),
        auditRepository: createSupabaseAuditLogRepository(params.supabase),
        auditSource: "harwick_approval",
      });
      if (result.status === "forbidden" || result.status === "not_found") {
        return {
          status: "forbidden",
          routingDecisionId: null,
          assignedMemberId: null,
          reasons: [],
          undoExpiresAt,
        };
      }
      return {
        status: result.status === "routed" ? "executed" : "no_assignment",
        routingDecisionId: result.response.routingDecisionId,
        assignedMemberId: result.response.assignedMemberId,
        reasons: result.response.reasons,
        undoExpiresAt,
      };
    },
  };
}

function buildSyncFubAdapter(params: { supabase: RealtyOpsSupabaseClient }): HarwickSyncFubApprovalAdapter {
  return {
    async executeSyncFollowUpBoss({ workspaceId, leadId, callPayload, nowIso }) {
      const idempotencyKey = `fub_sync:${leadId}`;
      const insert: TablesInsert<"workflow_jobs"> = {
        workspace_id: workspaceId,
        lead_id: leadId,
        lead_event_id: null,
        job_type: "fub_sync",
        status: "queued",
        run_after: nowIso,
        idempotency_key: idempotencyKey,
        attempt_count: 0,
        max_attempts: FUB_SYNC_MAX_ATTEMPTS,
        payload: {
          jobType: "fub_sync",
          workspaceId,
          leadId,
          qualifiedOnly: true,
          source: "harwick_approval",
          requestedNote: readPayloadString(callPayload, "note"),
        },
      };
      const { data, error } = await params.supabase
        .from("workflow_jobs")
        .upsert(insert, { onConflict: "workspace_id,idempotency_key" })
        .select("id")
        .single<{ id: string }>();
      if (error !== null) {
        throw error;
      }
      return {
        status: "executed",
        workflowJobId: data.id,
        idempotencyKey,
        reason: "FUB sync job enqueued; the worker will process the qualified lead.",
      };
    },
  };
}

function buildShowingAdapter(params: { supabase: RealtyOpsSupabaseClient }): HarwickShowingApprovalAdapter {
  return {
    async executeRequestShowingApproval({ workspaceId, leadId, callPayload, nowIso }) {
      const listing = readPayloadString(callPayload, "listing");
      const requestedTime = readPayloadString(callPayload, "requestedTime")
        ?? readPayloadString(callPayload, "time");
      const requestedStart = readIsoFromPayload(callPayload, ["requestedStart", "start", "startTime"]);
      const requestedEnd = readIsoFromPayload(callPayload, ["requestedEnd", "end", "endTime"]);
      const insert: TablesInsert<"lead_tasks"> = {
        workspace_id: workspaceId,
        lead_id: leadId,
        listing_id: null,
        task_type: "request_showing_approval",
        status: "open",
        priority: "high",
        title: listing === null ? "Showing approval requested" : `Showing approval: ${listing}`,
        description: [
          "Operator approved a Harwick showing proposal.",
          listing === null ? "" : `Listing: ${listing}.`,
          requestedTime === null ? "" : `Requested time: ${requestedTime}.`,
          requestedStart === null ? "" : `Requested start: ${requestedStart}.`,
          requestedEnd === null ? "" : `Requested end: ${requestedEnd}.`,
        ].filter((line) => line.length > 0).join("\n"),
        requested_start_at: requestedStart,
        requested_end_at: requestedEnd,
        assigned_member_id: null,
        created_at: nowIso,
        updated_at: nowIso,
      };
      const { data, error } = await params.supabase
        .from("lead_tasks")
        .insert(insert)
        .select("id")
        .single<{ id: string }>();
      if (error !== null) {
        throw error;
      }
      return {
        status: "executed",
        taskId: data.id,
        listing,
        requestedStart,
        requestedEnd,
      };
    },
  };
}

function buildOpenHouseAdapter(params: { supabase: RealtyOpsSupabaseClient }): HarwickOpenHouseApprovalAdapter {
  return {
    async executeRegisterOpenHouse({ workspaceId, leadId, callPayload, nowIso }) {
      const listing = readPayloadString(callPayload, "listing");
      const eventDate = readPayloadString(callPayload, "eventDate")
        ?? readPayloadString(callPayload, "date");
      const insert: TablesInsert<"lead_tasks"> = {
        workspace_id: workspaceId,
        lead_id: leadId,
        listing_id: null,
        task_type: "open_house_registration",
        status: "open",
        priority: "normal",
        title: listing === null ? "Open house registration" : `Open house: ${listing}`,
        description: [
          "Operator approved a Harwick open-house registration.",
          listing === null ? "" : `Listing: ${listing}.`,
          eventDate === null ? "" : `Event date: ${eventDate}.`,
        ].filter((line) => line.length > 0).join("\n"),
        assigned_member_id: null,
        created_at: nowIso,
        updated_at: nowIso,
      };
      const { data, error } = await params.supabase
        .from("lead_tasks")
        .insert(insert)
        .select("id")
        .single<{ id: string }>();
      if (error !== null) {
        throw error;
      }
      return {
        status: "executed",
        taskId: data.id,
        listing,
        eventDate,
      };
    },
  };
}

function buildPauseAutomationAdapter(params: {
  supabase: RealtyOpsSupabaseClient;
}): HarwickPauseAutomationApprovalAdapter {
  const repo = createSupabaseConversationAutomationRepository(params.supabase);
  return {
    async executePauseAutomation({ workspaceId, leadId, approverMemberId, callPayload, nowIso }) {
      const reason = readPayloadString(callPayload, "reason") ?? "Operator approved Harwick takeover request.";
      const existing = await repo.findAutomationState({ workspaceId, leadId });

      if (existing === null) {
        await repo.insertAutomationState({
          workspaceId,
          leadId,
          automationMode: "human_takeover",
          automationReason: reason,
          changedByMemberId: approverMemberId,
          changedAt: nowIso,
        });
        const inserted = await repo.findAutomationState({ workspaceId, leadId });
        return {
          status: "executed",
          automationStateId: inserted?.id ?? "",
          reason,
        };
      }

      await repo.updateAutomationState({
        stateId: existing.id,
        automationMode: "human_takeover",
        automationReason: reason,
        changedByMemberId: approverMemberId,
        changedAt: nowIso,
      });
      return {
        status: "executed",
        automationStateId: existing.id,
        reason,
      };
    },
  };
}

export function buildHarwickApprovalAdapters(params: {
  supabase: RealtyOpsSupabaseClient;
  approverRole: ApproverRole;
}): HarwickApprovalAdapters {
  return {
    routeLead: buildRouteLeadAdapter(params),
    syncFollowUpBoss: buildSyncFubAdapter(params),
    requestShowingApproval: buildShowingAdapter(params),
    registerOpenHouse: buildOpenHouseAdapter(params),
    pauseAutomation: buildPauseAutomationAdapter(params),
  };
}
