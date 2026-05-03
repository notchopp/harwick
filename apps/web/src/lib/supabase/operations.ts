import type { WorkspaceOperationsRepository } from "../../features/operations/workspace-operations";
import type { RealtyOpsSupabaseClient } from "./server-client";
import type { VoiceLeadHandoffRow } from "./voice-handoffs";

async function countQuery(query: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count, error } = await query;
  if (error !== null) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error("Supabase count query failed.");
  }

  return count ?? 0;
}

export function createSupabaseWorkspaceOperationsRepository(
  supabase: RealtyOpsSupabaseClient,
): WorkspaceOperationsRepository {
  return {
    countConnectedIntegrations(params) {
      return countQuery(
        supabase
          .from("integration_accounts")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", params.workspaceId)
          .eq("provider", params.provider)
          .eq("status", "connected"),
      );
    },

    countActiveVoiceAgents(workspaceId) {
      return countQuery(
        supabase
          .from("workspace_voice_agents")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .eq("status", "active"),
      );
    },

    countVerifiedListings(workspaceId) {
      return countQuery(
        supabase
          .from("listing_facts")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .eq("verification_status", "verified"),
      );
    },

    async findLatestWorkerHeartbeat() {
      const { data, error } = await supabase
        .from("worker_heartbeats")
        .select("*")
        .order("last_seen_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error !== null) {
        throw error;
      }

      return data ?? null;
    },

    countOpenTasks(workspaceId) {
      return countQuery(
        supabase
          .from("lead_tasks")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .in("status", ["open", "in_progress"]),
      );
    },

    countUrgentTasks(workspaceId) {
      return countQuery(
        supabase
          .from("lead_tasks")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .in("status", ["open", "in_progress"])
          .in("priority", ["high", "urgent"]),
      );
    },

    countFailedJobs(workspaceId) {
      return countQuery(
        supabase
          .from("workflow_jobs")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .eq("status", "failed"),
      );
    },

    countStuckJobs(params) {
      return countQuery(
        supabase
          .from("workflow_jobs")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", params.workspaceId)
          .eq("status", "processing")
          .lt("locked_at", params.olderThanIso),
      );
    },

    countFailedCrmSyncs(workspaceId) {
      return countQuery(
        supabase
          .from("crm_sync_logs")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .eq("provider", "follow_up_boss")
          .eq("status", "failed"),
      );
    },

    countProviderErrorsSince(params) {
      return countQuery(
        supabase
          .from("provider_error_logs")
          .select("id", { count: "exact", head: true })
          .or(`workspace_id.eq.${params.workspaceId},workspace_id.is.null`)
          .gte("created_at", params.sinceIso),
      );
    },

    async listLeadEvents(params) {
      const { data, error } = await supabase
        .from("lead_events")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .eq("lead_id", params.leadId)
        .order("occurred_at", { ascending: false })
        .limit(params.limit);
      if (error !== null) throw error;
      return data ?? [];
    },

    async listLeadTasks(params) {
      const { data, error } = await supabase
        .from("lead_tasks")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .eq("lead_id", params.leadId)
        .order("updated_at", { ascending: false })
        .limit(params.limit);
      if (error !== null) throw error;
      return data ?? [];
    },

    async listVoiceHandoffs(params) {
      const { data, error } = await supabase
        .from("voice_lead_handoffs")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .eq("lead_id", params.leadId)
        .order("created_at", { ascending: false })
        .limit(params.limit)
        .returns<VoiceLeadHandoffRow[]>();
      if (error !== null) throw error;
      return data ?? [];
    },

    async listCrmSyncLogs(params) {
      const { data, error } = await supabase
        .from("crm_sync_logs")
        .select("id,workspace_id,lead_id,provider,status,provider_contact_id,last_outbound_at,created_at,updated_at")
        .eq("workspace_id", params.workspaceId)
        .eq("lead_id", params.leadId)
        .order("updated_at", { ascending: false })
        .limit(params.limit);
      if (error !== null) throw error;
      return (data ?? []).map((row) => ({
        ...row,
        provider: row.provider as "follow_up_boss",
        status: row.status as "queued" | "failed" | "skipped" | "synced",
      }));
    },

    async listCrmBacksyncEvents(params) {
      if (params.providerContactId === null) {
        return [];
      }

      const { data, error } = await supabase
        .from("crm_backsync_events")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .contains("resource_ids", [Number(params.providerContactId)])
        .order("event_created_at", { ascending: false })
        .limit(params.limit);
      if (error !== null) throw error;
      return data ?? [];
    },

    async listNurtureMessages(params) {
      const { data, error } = await supabase
        .from("nurture_messages")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .eq("lead_id", params.leadId)
        .order("updated_at", { ascending: false })
        .limit(params.limit);
      if (error !== null) throw error;
      return data ?? [];
    },

    async findLeadFubContactId(params) {
      const { data, error } = await supabase
        .from("leads")
        .select("follow_up_boss_contact_id")
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.leadId)
        .maybeSingle<{ follow_up_boss_contact_id: string | null }>();
      if (error !== null) throw error;
      return data?.follow_up_boss_contact_id ?? null;
    },

    async listFubSubscriptions(workspaceId) {
      const { data, error } = await supabase
        .from("follow_up_boss_webhook_subscriptions")
        .select("*")
        .eq("workspace_id", workspaceId);
      if (error !== null) throw error;
      return data ?? [];
    },
  };
}
