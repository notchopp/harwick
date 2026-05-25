import { isOptOutMessage, type IntegrationProvider, type NormalizedLeadEvent } from "@realty-ops/core";
import type { LeadEventWriter, MetaWorkspaceResolver } from "../../features/lead-intake/meta-webhook";
import type { LeadUpsertRepository } from "./leads";
import { upsertLeadFromInboundEvent } from "./leads";
import type { RealtyOpsSupabaseClient } from "./server-client";
import type { WorkflowJobEnqueuer } from "./workflow-jobs";
import { recordCurrentPeriodUsageEvent } from "./billing";

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

export type LeadEventInsertedRow = {
  id: string;
  workspace_id: string;
  provider: NormalizedLeadEvent["provider"];
  provider_event_id: string;
  lead_id: string | null;
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

type LeadEventRow = {
  id: string;
  workspace_id: string;
  lead_id: string | null;
  provider: string;
  event_type: string;
  source_channel: string;
  provider_event_id: string;
  provider_account_id: string | null;
  provider_user_id: string | null;
  source_post_id: string | null;
  source_comment_id: string | null;
  text: string | null;
  occurred_at: string;
};

export type LeadEventPersistenceRepository = {
  findWorkspaceIdByIntegrationAccount(lookup: IntegrationAccountLookup): Promise<string | null>;
  findWorkspaceIdByVoiceAgent?(retellAgentId: string): Promise<string | null>;
  findExistingLeadEventIdentities(identities: LeadEventIdentity[]): Promise<Set<string>>;
  insertLeadEventRows(rows: LeadEventInsertRow[]): Promise<LeadEventInsertedRow[]>;
  updateLeadsLastMessageAt?(params: {
    workspaceId: string;
    leadIds: string[];
  }): Promise<void>;
  markLeadNurtureOptedOut?(params: {
    workspaceId: string;
    leadId: string;
    reason: string;
  }): Promise<void>;
  getLeadEventById(eventId: string): Promise<{
    id: string;
    workspaceId: string;
    leadId: string | null;
    provider: string;
    eventType: string;
    sourceChannel: string;
    providerEventId: string;
    providerAccountId: string | null;
    providerUserId: string | null;
    sourcePostId: string | null;
    sourceCommentId: string | null;
    text: string | null;
    occurredAt: string;
  } | null>;
};

export type LeadEventWriterOptions = {
  leadUpsertRepository?: LeadUpsertRepository;
  enqueueWorkflowJob?: WorkflowJobEnqueuer;
  createPostCallVoiceHandoff?: (params: {
    workspaceId: string;
    leadId: string;
    leadEventId: string;
    event: NormalizedLeadEvent;
  }) => Promise<void>;
  generateAndExecuteHarwickAiTurn?: (params: {
    workspaceId: string;
    leadId: string;
    leadEventId: string;
    event: NormalizedLeadEvent;
  }) => Promise<void>;
  createConversationMessage?: (params: {
    workspaceId: string;
    leadId: string;
    event: NormalizedLeadEvent;
  }) => Promise<void>;
};

type IntegrationAccountWorkspaceRow = {
  workspace_id: string;
};

type ExistingLeadEventRow = {
  workspace_id: string;
  provider: NormalizedLeadEvent["provider"];
  provider_event_id: string;
};

function isSocialReplySent(row: LeadEventInsertRow): boolean {
  return row.event_type === "reply_sent"
    && (
      row.source_channel === "instagram_dm"
      || row.source_channel === "instagram_comment"
      || row.source_channel === "facebook_dm"
      || row.source_channel === "facebook_comment"
    );
}

async function recordLeadEventUsageSafely(
  supabase: RealtyOpsSupabaseClient,
  rows: LeadEventInsertRow[],
): Promise<void> {
  const workspaceIds = [...new Set(rows.map((row) => row.workspace_id))];
  await Promise.all(workspaceIds.map(async (workspaceId) => {
    const workspaceRows = rows.filter((row) => row.workspace_id === workspaceId);
    try {
      await recordCurrentPeriodUsageEvent(supabase, {
        workspaceId,
        eventType: "lead_event",
        eventCount: workspaceRows.length,
        eventMetadata: {
          providers: [...new Set(workspaceRows.map((row) => row.provider))],
          sourceChannels: [...new Set(workspaceRows.map((row) => row.source_channel))],
        },
      });

      const socialReplyCount = workspaceRows.filter(isSocialReplySent).length;
      if (socialReplyCount > 0) {
        await recordCurrentPeriodUsageEvent(supabase, {
          workspaceId,
          eventType: "social_message_sent",
          eventCount: socialReplyCount,
          eventMetadata: {
            sourceChannels: [...new Set(workspaceRows.filter(isSocialReplySent).map((row) => row.source_channel))],
          },
        });
      }
    } catch (error) {
      console.error("[lead-events] failed to record usage event:", error);
    }
  }));
}

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
      if (options.leadUpsertRepository === undefined) {
        rows.push(mapNormalizedLeadEventToInsertRow(event));
      } else {
        const result = await upsertLeadFromInboundEvent({
            event,
            repository: options.leadUpsertRepository,
        });
        rows.push(mapNormalizedLeadEventToInsertRow(event, result.leadId));
        leadUpsertCount += 1;
        if (event.text !== null && isOptOutMessage(event.text)) {
          await repository.markLeadNurtureOptedOut?.({
            workspaceId: event.workspaceId,
            leadId: result.leadId,
            reason: "inbound_stop_keyword",
          });
        }
      }
    }

    const insertedRows = await repository.insertLeadEventRows(rows);
    const insertedByIdentity = new Map(
      insertedRows.map((row) => [
        toLeadEventIdentityKey({
          workspaceId: row.workspace_id,
          provider: row.provider,
          providerEventId: row.provider_event_id,
        }),
        row,
      ]),
    );

    for (const event of newEvents) {
      const identityKey = toLeadEventIdentityKey({
        workspaceId: event.workspaceId,
        provider: event.provider,
        providerEventId: event.providerEventId,
      });
      const insertedEvent = insertedByIdentity.get(identityKey);
      const leadId = insertedEvent?.lead_id ?? rows.find((row) =>
        row.workspace_id === event.workspaceId
        && row.provider === event.provider
        && row.provider_event_id === event.providerEventId
      )?.lead_id ?? null;
      const leadEventId = insertedEvent?.id ?? null;

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
          leadEventId,
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
          leadEventId,
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

      if (
        options.createPostCallVoiceHandoff !== undefined
        && event.provider === "retell"
        && event.eventType === "call_completed"
        && leadId !== null
        && leadEventId !== null
      ) {
        await options.createPostCallVoiceHandoff({
          workspaceId: event.workspaceId,
          leadId,
          leadEventId,
          event,
        });
      }

      // Create conversation message for inbound events if callback provided
      if (options.createConversationMessage !== undefined && leadId !== null && event.text !== null) {
        await options.createConversationMessage({
          workspaceId: event.workspaceId,
          leadId,
          event,
        });
      }

      // Generate Harwick AI turn if callback provided
      if (options.generateAndExecuteHarwickAiTurn !== undefined && leadId !== null && leadEventId !== null) {
        await options.generateAndExecuteHarwickAiTurn({
          workspaceId: event.workspaceId,
          leadId,
          leadEventId,
          event,
        });
      }
    }

    // Update last_message_at on leads that received events
    const leadIds = rows
      .map((row) => row.lead_id)
      .filter((id): id is string => id !== null && id !== undefined);
    
    if (leadIds.length > 0 && repository.updateLeadsLastMessageAt) {
      const uniqueLeadIds = Array.from(new Set(leadIds));
      await repository.updateLeadsLastMessageAt({
        workspaceId: newEvents[0]?.workspaceId || "",
        leadIds: uniqueLeadIds,
      });
    }

    return {
      persistedCount: insertedRows.length,
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
        return [];
      }

      // Webhook idempotency: lead_events has a UNIQUE INDEX on
      // (workspace_id, provider, provider_event_id). The provider_event_id is
      // the Meta message `mid` for DMs or the comment `id` for comment events
      // — i.e. the natural deduplication key. We pre-check via
      // findExistingLeadEventIdentities above, but in the rare case where two
      // concurrent webhook deliveries both pass the pre-check, the DB
      // constraint protects us. We use upsert with ignoreDuplicates so the
      // race is silently absorbed rather than thrown.
      const { data, error } = await supabase
        .from("lead_events")
        .upsert(rows, {
          onConflict: "workspace_id,provider,provider_event_id",
          ignoreDuplicates: true,
        })
        .select("id, workspace_id, provider, provider_event_id, lead_id")
        .returns<LeadEventInsertedRow[]>();

      if (error !== null) {
        throw error;
      }

      const insertedRows = data ?? [];
      if (insertedRows.length > 0) {
        await recordLeadEventUsageSafely(supabase, rows);
      }

      return insertedRows;
    },

    async updateLeadsLastMessageAt(params) {
      if (params.leadIds.length === 0) {
        return;
      }

      const now = new Date().toISOString();
      const { error } = await supabase
        .from("leads")
        .update({
          last_message_at: now,
          updated_at: now,
        })
        .eq("workspace_id", params.workspaceId)
        .in("id", params.leadIds);

      if (error !== null) {
        throw error;
      }
    },

    async markLeadNurtureOptedOut(params) {
      const { error } = await supabase
        .from("nurture_enrollments")
        .update({
          status: "opted_out",
          next_action_at: null,
          opted_out_at: new Date().toISOString(),
          opt_out_reason: params.reason,
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", params.workspaceId)
        .eq("lead_id", params.leadId)
        .eq("status", "active");

      if (error !== null) {
        throw error;
      }
    },

    async getLeadEventById(eventId) {
      const { data, error } = await supabase
        .from("lead_events")
        .select("id, workspace_id, lead_id, provider, event_type, source_channel, provider_event_id, provider_account_id, provider_user_id, source_post_id, source_comment_id, text, occurred_at")
        .eq("id", eventId)
        .maybeSingle<LeadEventRow>();

      if (error !== null) {
        throw error;
      }

      if (!data) {
        return null;
      }

      return {
        id: data.id,
        workspaceId: data.workspace_id,
        leadId: data.lead_id,
        provider: data.provider,
        eventType: data.event_type,
        sourceChannel: data.source_channel,
        providerEventId: data.provider_event_id,
        providerAccountId: data.provider_account_id,
        providerUserId: data.provider_user_id,
        sourcePostId: data.source_post_id,
        sourceCommentId: data.source_comment_id,
        text: data.text,
        occurredAt: data.occurred_at,
      };
    },
  };
}
