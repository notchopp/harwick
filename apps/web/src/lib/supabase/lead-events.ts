import type { IntegrationProvider, NormalizedLeadEvent } from "@realty-ops/core";
import type { LeadEventWriter, MetaWorkspaceResolver } from "../../features/lead-intake/meta-webhook";
import type { LeadUpsertRepository } from "./leads";
import { upsertLeadFromInboundEvent } from "./leads";
import type { RealtyOpsSupabaseClient } from "./server-client";
import type { WorkflowJobEnqueuer } from "./workflow-jobs";

export type LeadEventInsertRow = {
  workspace_id: string;
  lead_id: string | null;
  provider: NormalizedLeadEvent["provider"];
  event_type: NormalizedLeadEvent["eventType"];
  source_channel: NormalizedLeadEvent["sourceChannel"];
  provider_event_id: string;
  provider_account_id: string | null;
  provider_user_id: string | null;
  source_post_id: string | null;
  source_comment_id: string | null;
  text: string | null;
  occurred_at: string;
};

export type LeadEventIdentity = {
  workspaceId: string;
  provider: NormalizedLeadEvent["provider"];
  providerEventId: string;
};

export type IntegrationAccountLookup = {
  provider: IntegrationProvider;
  providerAccountId: string;
};

export type LeadEventPersistenceRepository = {
  findWorkspaceIdByIntegrationAccount(lookup: IntegrationAccountLookup): Promise<string | null>;
  findWorkspaceIdByVoiceAgent?(retellAgentId: string): Promise<string | null>;
  findExistingLeadEventIdentities(identities: LeadEventIdentity[]): Promise<Set<string>>;
  insertLeadEventRows(rows: LeadEventInsertRow[]): Promise<number>;
};

export type LeadEventWriterOptions = {
  leadUpsertRepository?: LeadUpsertRepository;
  enqueueWorkflowJob?: WorkflowJobEnqueuer;
};

type IntegrationAccountWorkspaceRow = {
  workspace_id: string;
};

type ExistingLeadEventRow = {
  workspace_id: string;
  provider: NormalizedLeadEvent["provider"];
  provider_event_id: string;
};

export function toLeadEventIdentityKey(identity: LeadEventIdentity): string {
  return `${identity.workspaceId}:${identity.provider}:${identity.providerEventId}`;
}

export function mapNormalizedLeadEventToInsertRow(
  event: NormalizedLeadEvent,
  leadId: string | null = null,
): LeadEventInsertRow {
  return {
    workspace_id: event.workspaceId,
    lead_id: leadId,
    provider: event.provider,
    event_type: event.eventType,
    source_channel: event.sourceChannel,
    provider_event_id: event.providerEventId,
    provider_account_id: event.providerAccountId,
    provider_user_id: event.providerUserId,
    source_post_id: event.sourcePostId,
    source_comment_id: event.sourceCommentId,
    text: event.text,
    occurred_at: event.occurredAt,
  };
}

export function createMetaWorkspaceResolver(
  repository: LeadEventPersistenceRepository,
): MetaWorkspaceResolver {
  return (providerAccountId: string) => {
    return repository.findWorkspaceIdByIntegrationAccount({
      provider: "meta",
      providerAccountId,
    });
  };
}

export function createRetellWorkspaceResolver(repository: LeadEventPersistenceRepository) {
  return async (providerAccountId: string) => {
    const workspaceId = await repository.findWorkspaceIdByVoiceAgent?.(providerAccountId);
    if (workspaceId !== null && workspaceId !== undefined) {
      return workspaceId;
    }

    return repository.findWorkspaceIdByIntegrationAccount({
      provider: "retell",
      providerAccountId,
    });
  };
}

export function createLeadEventWriter(
  repository: LeadEventPersistenceRepository,
  options: LeadEventWriterOptions = {},
): LeadEventWriter {
  return async (events: NormalizedLeadEvent[]) => {
    if (events.length === 0) {
      return {
        persistedCount: 0,
        duplicateCount: 0,
        leadUpsertCount: 0,
      };
    }

    const identities = events.map((event) => ({
      workspaceId: event.workspaceId,
      provider: event.provider,
      providerEventId: event.providerEventId,
    }));
    const existingIdentityKeys = await repository.findExistingLeadEventIdentities(identities);
    const newEvents = events.filter((event) => {
      return !existingIdentityKeys.has(toLeadEventIdentityKey({
        workspaceId: event.workspaceId,
        provider: event.provider,
        providerEventId: event.providerEventId,
      }));
    });

    if (newEvents.length === 0) {
      return {
        persistedCount: 0,
        duplicateCount: events.length,
        leadUpsertCount: 0,
      };
    }

    let leadUpsertCount = 0;
    const rows: LeadEventInsertRow[] = [];

    for (const event of newEvents) {
      let leadId: string | null = null;
      if (options.leadUpsertRepository === undefined) {
        rows.push(mapNormalizedLeadEventToInsertRow(event));
      } else {
        const result = await upsertLeadFromInboundEvent({
            event,
            repository: options.leadUpsertRepository,
        });
        leadId = result.leadId;
        rows.push(mapNormalizedLeadEventToInsertRow(event, result.leadId));
        leadUpsertCount += 1;
      }

      if (options.enqueueWorkflowJob !== undefined) {
        const intakeSource = event.sourceChannel === "instagram_dm" || event.sourceChannel === "instagram_comment"
          ? "instagram"
          : event.sourceChannel === "facebook_dm" || event.sourceChannel === "facebook_comment"
            ? "facebook"
          : event.provider === "retell"
            ? "retell"
            : event.provider === "twilio"
              ? "sms"
              : "manual";
        await options.enqueueWorkflowJob({
          workspaceId: event.workspaceId,
          leadId,
          leadEventId: null,
          jobType: "lead_intake",
          idempotencyKey: `lead_intake:${event.provider}:${event.providerEventId}`,
          payload: {
            jobType: "lead_intake",
            workspaceId: event.workspaceId,
            ...(leadId === null ? {} : { leadId }),
            source: intakeSource,
          },
        });
        await options.enqueueWorkflowJob({
          workspaceId: event.workspaceId,
          leadId,
          leadEventId: null,
          jobType: "lead_qualification",
          idempotencyKey: `lead_qualification:${event.provider}:${event.providerEventId}`,
          payload: {
            jobType: "lead_qualification",
            workspaceId: event.workspaceId,
            ...(leadId === null ? {} : { leadId }),
            reason: event.provider === "retell" ? "post_call_analysis" : "new_event",
          },
        });
      }
    }

    const insertedCount = await repository.insertLeadEventRows(rows);

    return {
      persistedCount: insertedCount,
      duplicateCount: events.length - newEvents.length,
      leadUpsertCount,
    };
  };
}

export function createSupabaseLeadEventRepository(
  supabase: RealtyOpsSupabaseClient,
): LeadEventPersistenceRepository {
  return {
    async findWorkspaceIdByIntegrationAccount(lookup) {
      const { data, error } = await supabase
        .from("integration_accounts")
        .select("workspace_id")
        .eq("provider", lookup.provider)
        .eq("provider_account_id", lookup.providerAccountId)
        .eq("status", "connected")
        .maybeSingle<IntegrationAccountWorkspaceRow>();

      if (error !== null) {
        throw error;
      }

      if (data?.workspace_id !== undefined) {
        return data.workspace_id;
      }

      const { data: aliasData, error: aliasError } = await supabase
        .from("integration_accounts")
        .select("workspace_id")
        .eq("provider", lookup.provider)
        .contains("provider_account_ids", [lookup.providerAccountId])
        .eq("status", "connected")
        .maybeSingle<IntegrationAccountWorkspaceRow>();

      if (aliasError !== null) {
        throw aliasError;
      }

      return aliasData?.workspace_id ?? null;
    },

    async findWorkspaceIdByVoiceAgent(retellAgentId) {
      const { data, error } = await supabase
        .from("workspace_voice_agents")
        .select("workspace_id")
        .eq("provider", "retell")
        .eq("retell_agent_id", retellAgentId)
        .in("status", ["active", "needs_sync"])
        .maybeSingle<IntegrationAccountWorkspaceRow>();

      if (error !== null) {
        throw error;
      }

      return data?.workspace_id ?? null;
    },

    async findExistingLeadEventIdentities(identities) {
      if (identities.length === 0) {
        return new Set<string>();
      }

      const workspaceIds = [...new Set(identities.map((identity) => identity.workspaceId))];
      const providers = [...new Set(identities.map((identity) => identity.provider))];
      const providerEventIds = [...new Set(identities.map((identity) => identity.providerEventId))];

      const { data, error } = await supabase
        .from("lead_events")
        .select("workspace_id,provider,provider_event_id")
        .in("workspace_id", workspaceIds)
        .in("provider", providers)
        .in("provider_event_id", providerEventIds)
        .returns<ExistingLeadEventRow[]>();

      if (error !== null) {
        throw error;
      }

      return new Set(
        (data ?? []).map((row) => toLeadEventIdentityKey({
          workspaceId: row.workspace_id,
          provider: row.provider,
          providerEventId: row.provider_event_id,
        })),
      );
    },

    async insertLeadEventRows(rows) {
      if (rows.length === 0) {
        return 0;
      }

      const { data, error } = await supabase
        .from("lead_events")
        .insert(rows)
        .select("id");

      if (error !== null) {
        throw error;
      }

      return data?.length ?? rows.length;
    },
  };
}
