import {
  classifyHarwickLeadActionability,
  HarwickAiDecisionSchema,
  type SocialConversationThreadItem,
  type SocialReplyQueueItem,
  type VoiceHandoffQueueItem,
} from "@realty-ops/core";
import { isSocialReplyChannel } from "@realty-ops/core";
import type {
  LeadEventRow,
  LeadTaskRow,
  ConversationAutomationStateRow,
  SocialReplyReviewRow,
} from "./database.types";
import type { LeadRow } from "./leads";
import type { VoiceLeadHandoffRow } from "./voice-handoffs";
import type { RealtyOpsSupabaseClient } from "./server-client";
import type {
  SocialReplyQueueRepository,
  VoiceHandoffQueueRepository,
} from "../../features/operator-queues/operator-queues";

function mapSocialReplyReview(row: SocialReplyReviewRow): SocialReplyQueueItem {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    leadId: row.lead_id,
    leadEventId: row.lead_event_id,
    providerAccountId: row.provider_account_id,
    recipientUserId: row.recipient_user_id,
    channel: row.channel as "instagram_dm" | "instagram_comment" | "facebook_dm" | "facebook_comment",
    sourcePostId: row.source_post_id,
    sourceCommentId: row.source_comment_id,
    inboundText: row.inbound_text,
    suggestedReply: row.suggested_reply,
    status: row.status as "pending" | "approved" | "sent" | "dismissed" | "failed",
    automationMode: row.automation_mode as "ai_on" | "human_takeover" | "paused_by_rule",
    automationReason: row.automation_reason,
    aiDecision: row.ai_decision === null ? null : HarwickAiDecisionSchema.parse(row.ai_decision),
    providerEventId: row.provider_event_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function automationScopeMatchesReview(row: ConversationAutomationStateRow, review: SocialReplyReviewRow | LeadEventRow) {
  if (row.lead_id !== null && "lead_id" in review && review.lead_id !== null) {
    return row.lead_id === review.lead_id;
  }

  return row.provider_account_id === review.provider_account_id
    && row.recipient_user_id === ("recipient_user_id" in review ? review.recipient_user_id : review.provider_user_id)
    && row.channel === ("channel" in review ? review.channel : review.source_channel);
}

function mapVoiceHandoff(row: VoiceLeadHandoffRow): VoiceHandoffQueueItem {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    leadId: row.lead_id,
    callId: row.call_id,
    phone: row.phone,
    callerName: row.caller_name,
    urgency: row.urgency,
    summary: row.summary,
    status: row.status,
    reviewStatus: row.review_status,
    callbackTaskId: row.callback_task_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLeadEventThreadItem(row: LeadEventRow): SocialConversationThreadItem {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    leadId: row.lead_id,
    provider: row.provider as "manual" | "meta" | "twilio" | "retell" | "follow_up_boss",
    eventType: row.event_type,
    channel: row.source_channel as "manual" | "instagram_dm" | "instagram_comment" | "facebook_dm" | "facebook_comment" | "sms" | "call" | "csv_import",
    text: row.text,
    occurredAt: row.occurred_at,
  };
}

type QueueLeadActionabilityRow = Pick<
  LeadRow,
  | "id"
  | "source_channel"
  | "status"
  | "intent"
  | "score"
  | "assigned_agent_id"
  | "next_followup_at"
  | "follow_up_boss_contact_id"
>;

async function listLeadActionabilityInputs(
  supabase: RealtyOpsSupabaseClient,
  params: { workspaceId: string; leadIds: string[] },
) {
  if (params.leadIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("leads")
    .select("id,source_channel,status,intent,score,assigned_agent_id,next_followup_at,follow_up_boss_contact_id")
    .eq("workspace_id", params.workspaceId)
    .in("id", params.leadIds)
    .returns<QueueLeadActionabilityRow[]>();

  if (error !== null) {
    throw error;
  }

  return (data ?? []).map((lead) => ({
    leadId: lead.id,
    input: {
      sourceChannel: lead.source_channel,
      status: lead.status,
      intent: lead.intent,
      score: lead.score,
      assignedAgentId: lead.assigned_agent_id,
      nextFollowUpAt: lead.next_followup_at,
      followUpBossContactId: lead.follow_up_boss_contact_id,
    },
  }));
}

export function createSupabaseSocialReplyQueueRepository(
  supabase: RealtyOpsSupabaseClient,
): SocialReplyQueueRepository {
  return {
    async materializePendingSocialReplies(params) {
      const { data: events, error } = await supabase
        .from("lead_events")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .eq("provider", "meta")
        .in("event_type", ["message_received", "comment_received"])
        .order("occurred_at", { ascending: false })
        .limit(params.limit)
        .returns<LeadEventRow[]>();

      if (error !== null) {
        throw error;
      }

      const actionableLeadIds = new Set((await listLeadActionabilityInputs(supabase, {
        workspaceId: params.workspaceId,
        leadIds: [...new Set((events ?? []).flatMap((event) => event.lead_id === null ? [] : [event.lead_id]))],
      }))
        .flatMap((lead) => {
          return classifyHarwickLeadActionability(lead.input).shouldShow ? [lead.leadId] : [];
        }));

      const { data: automationStates, error: automationStateError } = await supabase
        .from("conversation_automation_states")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .returns<ConversationAutomationStateRow[]>();

      if (automationStateError !== null) {
        throw automationStateError;
      }

      const rows = (events ?? []).flatMap((event) => {
        if (
          event.lead_id === null
          || !actionableLeadIds.has(event.lead_id)
          || event.text === null
          || event.text.trim().length === 0
          || event.provider_account_id === null
          || !isSocialReplyChannel(event.source_channel)
        ) {
          return [];
        }
        const scopedAutomationState = (automationStates ?? []).find((state) => automationScopeMatchesReview(state, event));

        return [{
          workspace_id: event.workspace_id,
          lead_id: event.lead_id,
          lead_event_id: event.id,
          provider_account_id: event.provider_account_id,
          recipient_user_id: event.provider_user_id,
          channel: event.source_channel,
          source_post_id: event.source_post_id,
          source_comment_id: event.source_comment_id,
          inbound_text: event.text,
          suggested_reply: null,
          status: "pending" as const,
          automation_mode: scopedAutomationState?.automation_mode ?? "ai_on" as const,
          automation_reason: scopedAutomationState?.automation_reason ?? "new social lead is safe for qualification until Harwick finds a reason to pause",
          automation_changed_by_member_id: scopedAutomationState?.changed_by_member_id ?? null,
          automation_changed_at: scopedAutomationState?.changed_at ?? null,
          ai_decision: null,
          reviewed_by_member_id: null,
          reviewed_at: null,
          provider_event_id: null,
          dismissal_reason: null,
          last_error_code: null,
          last_error_message: null,
        }];
      });
      if (rows.length === 0) {
        return 0;
      }

      const { data, error: upsertError } = await supabase
        .from("social_reply_reviews")
        .upsert(rows, {
          onConflict: "workspace_id,lead_event_id",
          ignoreDuplicates: true,
        })
        .select("id");

      if (upsertError !== null) {
        throw upsertError;
      }

      return data?.length ?? 0;
    },

    async listSocialReplyReviews(params) {
      const { data, error } = await supabase
        .from("social_reply_reviews")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .in("status", ["pending", "approved", "failed"])
        .order("updated_at", { ascending: false })
        .limit(params.limit)
        .returns<SocialReplyReviewRow[]>();

      if (error !== null) {
        throw error;
      }

      return (data ?? []).map(mapSocialReplyReview);
    },

    async listLeadActionabilityInputs(params) {
      return listLeadActionabilityInputs(supabase, params);
    },

    async findSocialReplyReview(params) {
      const { data, error } = await supabase
        .from("social_reply_reviews")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.reviewId)
        .maybeSingle<SocialReplyReviewRow>();

      if (error !== null) {
        throw error;
      }

      return data === null ? null : mapSocialReplyReview(data);
    },

    async updateSocialReplyReview(params) {
      const { data, error } = await supabase
        .from("social_reply_reviews")
        .update({
          status: params.values.status,
          ...(params.values.automationMode === undefined ? {} : { automation_mode: params.values.automationMode }),
          ...(params.values.automationReason === undefined ? {} : { automation_reason: params.values.automationReason }),
          ...(params.values.automationChangedByMemberId === undefined ? {} : { automation_changed_by_member_id: params.values.automationChangedByMemberId }),
          ...(params.values.automationChangedAt === undefined ? {} : { automation_changed_at: params.values.automationChangedAt }),
          ...(params.values.aiDecision === undefined ? {} : { ai_decision: params.values.aiDecision }),
          ...(params.values.suggestedReply === undefined ? {} : { suggested_reply: params.values.suggestedReply }),
          ...(params.values.reviewedByMemberId === undefined ? {} : { reviewed_by_member_id: params.values.reviewedByMemberId }),
          ...(params.values.reviewedAt === undefined ? {} : { reviewed_at: params.values.reviewedAt }),
          ...(params.values.providerEventId === undefined ? {} : { provider_event_id: params.values.providerEventId }),
          ...(params.values.dismissalReason === undefined ? {} : { dismissal_reason: params.values.dismissalReason }),
          ...(params.values.lastErrorCode === undefined ? {} : { last_error_code: params.values.lastErrorCode }),
          ...(params.values.lastErrorMessage === undefined ? {} : { last_error_message: params.values.lastErrorMessage }),
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.reviewId)
        .select("*")
        .maybeSingle<SocialReplyReviewRow>();

      if (error !== null) {
        throw error;
      }

      return data === null ? null : mapSocialReplyReview(data);
    },

    async setConversationAutomationForReview(params) {
      const changedAt = params.values.automationChangedAt;
      let existingStateQuery = supabase
        .from("conversation_automation_states")
        .select("*")
        .eq("workspace_id", params.workspaceId);

      if (params.review.leadId !== null) {
        existingStateQuery = existingStateQuery.eq("lead_id", params.review.leadId);
      } else {
        existingStateQuery = existingStateQuery
          .is("lead_id", null)
          .eq("provider_account_id", params.review.providerAccountId)
          .eq("channel", params.review.channel);

        existingStateQuery = params.review.recipientUserId === null
          ? existingStateQuery.is("recipient_user_id", null)
          : existingStateQuery.eq("recipient_user_id", params.review.recipientUserId);
      }

      const { data: existingState, error: existingStateError } = await existingStateQuery
        .maybeSingle<ConversationAutomationStateRow>();

      if (existingStateError !== null) {
        throw existingStateError;
      }

      if (existingState === null) {
        const { error } = await supabase
          .from("conversation_automation_states")
          .insert({
            workspace_id: params.workspaceId,
            lead_id: params.review.leadId,
            provider_account_id: params.review.providerAccountId,
            recipient_user_id: params.review.recipientUserId,
            channel: params.review.channel,
            automation_mode: params.values.automationMode,
            automation_reason: params.values.automationReason,
            changed_by_member_id: params.values.automationChangedByMemberId,
            changed_at: changedAt,
            updated_at: changedAt,
          });

        if (error !== null) {
          throw error;
        }
      } else {
        const { error } = await supabase
          .from("conversation_automation_states")
          .update({
            automation_mode: params.values.automationMode,
            automation_reason: params.values.automationReason,
            changed_by_member_id: params.values.automationChangedByMemberId,
            changed_at: changedAt,
            updated_at: changedAt,
          })
          .eq("id", existingState.id);

        if (error !== null) {
          throw error;
        }
      }

      let reviewUpdateQuery = supabase
        .from("social_reply_reviews")
        .update({
          automation_mode: params.values.automationMode,
          automation_reason: params.values.automationReason,
          automation_changed_by_member_id: params.values.automationChangedByMemberId,
          automation_changed_at: changedAt,
          ai_decision: params.values.aiDecision,
          updated_at: changedAt,
        })
        .eq("workspace_id", params.workspaceId)
        .in("status", ["pending", "approved", "failed"]);

      if (params.review.leadId !== null) {
        reviewUpdateQuery = reviewUpdateQuery.eq("lead_id", params.review.leadId);
      } else {
        reviewUpdateQuery = reviewUpdateQuery
          .is("lead_id", null)
          .eq("provider_account_id", params.review.providerAccountId)
          .eq("channel", params.review.channel);

        reviewUpdateQuery = params.review.recipientUserId === null
          ? reviewUpdateQuery.is("recipient_user_id", null)
          : reviewUpdateQuery.eq("recipient_user_id", params.review.recipientUserId);
      }

      const { error: reviewUpdateError } = await reviewUpdateQuery;

      if (reviewUpdateError !== null) {
        throw reviewUpdateError;
      }

      const { data, error: findUpdatedError } = await supabase
        .from("social_reply_reviews")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.review.id)
        .maybeSingle<SocialReplyReviewRow>();

      if (findUpdatedError !== null) {
        throw findUpdatedError;
      }

      return data === null ? null : mapSocialReplyReview(data);
    },

    async listSocialConversationThread(params) {
      let query = supabase
        .from("lead_events")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .eq("provider", "meta")
        .order("occurred_at", { ascending: true })
        .limit(params.limit);

      if (params.review.leadId !== null) {
        query = query.eq("lead_id", params.review.leadId);
      } else if (params.review.recipientUserId !== null) {
        query = query.eq("provider_user_id", params.review.recipientUserId);
      } else if (params.review.sourcePostId !== null) {
        query = query.eq("source_post_id", params.review.sourcePostId);
      } else {
        query = query.eq("id", params.review.leadEventId);
      }

      const { data, error } = await query.returns<LeadEventRow[]>();

      if (error !== null) {
        throw error;
      }

      return (data ?? []).map(mapLeadEventThreadItem);
    },
  };
}

export function createSupabaseVoiceHandoffQueueRepository(
  supabase: RealtyOpsSupabaseClient,
): VoiceHandoffQueueRepository {
  return {
    async listVoiceHandoffs(params) {
      const { data, error } = await supabase
        .from("voice_lead_handoffs")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .in("review_status", ["pending", "callback_created"])
        .order("created_at", { ascending: false })
        .limit(params.limit)
        .returns<VoiceLeadHandoffRow[]>();

      if (error !== null) {
        throw error;
      }

      return (data ?? []).map(mapVoiceHandoff);
    },

    async findVoiceHandoff(params) {
      const { data, error } = await supabase
        .from("voice_lead_handoffs")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.handoffId)
        .maybeSingle<VoiceLeadHandoffRow>();

      if (error !== null) {
        throw error;
      }

      return data === null ? null : mapVoiceHandoff(data);
    },

    async createCallbackTask(params) {
      const { data, error } = await supabase
        .from("lead_tasks")
        .insert({
          workspace_id: params.workspaceId,
          lead_id: params.leadId,
          task_type: "call_back",
          priority: params.priority,
          title: params.title,
          description: params.description,
          due_at: params.dueAt,
          assigned_member_id: null,
        })
        .select("id")
        .single<Pick<LeadTaskRow, "id">>();

      if (error !== null) {
        throw error;
      }

      return { taskId: data.id };
    },

    async updateVoiceHandoffReview(params) {
      const { data, error } = await supabase
        .from("voice_lead_handoffs")
        .update({
          review_status: params.values.reviewStatus,
          reviewed_by_member_id: params.values.reviewedByMemberId,
          reviewed_at: params.values.reviewedAt,
          ...(params.values.callbackTaskId === undefined ? {} : { callback_task_id: params.values.callbackTaskId }),
          ...(params.values.dismissalReason === undefined ? {} : { dismissal_reason: params.values.dismissalReason }),
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.handoffId)
        .select("*")
        .maybeSingle<VoiceLeadHandoffRow>();

      if (error !== null) {
        throw error;
      }

      return data === null ? null : mapVoiceHandoff(data);
    },
  };
}
