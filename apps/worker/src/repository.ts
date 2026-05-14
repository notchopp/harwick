import { z } from "zod";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  canAutomationSend,
  decideNurtureAction,
  HarwickAiAutomationDecisionSchema,
  deriveHarwickAiTurnPersistenceStatus,
  HarwickAiTurnSchema,
  MetaConnectedCredentialSchema,
  NurtureEnrollmentSchema,
  NurtureLeadContactSchema,
  type WorkflowJob,
} from "@realty-ops/core";
import {
  createFollowUpBossClient,
  createMetaMessagingClient,
  createTwilioMessagingClient,
  executeHarwickAiToolCalls,
  type FollowUpBossLeadEventInput,
} from "@realty-ops/integrations";
import { chooseAssignmentCandidate, type AssignmentRoutingCandidate } from "./assignment-routing.js";
import { decryptCredential } from "./credentials.js";
import {
  mapFollowUpBossStageToLeadStatus,
  normalizeFollowUpBossActivityResource,
  normalizeFollowUpBossPeopleResource,
  shouldRequalifyFromFollowUpBossBacksyncEvent,
} from "./follow-up-boss-backsync.js";
import {
  parseWorkerJobRows,
  type LeadWorkflowContext,
  type WorkerJobRow,
  type WorkflowJobServices,
} from "./jobs.js";
import type { WorkerEnvironment } from "./environment.js";

type RealtyOpsWorkerDatabase = {
  public: {
    Tables: {
      leads: {
        Row: {
          id: string;
          workspace_id: string;
          full_name: string | null;
          phone: string | null;
          email: string | null;
          instagram_user_id: string | null;
          follow_up_boss_contact_id: string | null;
          source_channel: LeadWorkflowContext["sourceChannel"];
          lead_type: LeadWorkflowContext["leadType"];
          intent: LeadWorkflowContext["intent"];
          timeline: string | null;
          budget_min: number | null;
          budget_max: number | null;
          target_area: string | null;
          financing_status: LeadWorkflowContext["financingStatus"];
          score: number;
          status: LeadWorkflowContext["currentStatus"];
          assigned_agent_id: string | null;
        };
        Insert: Record<string, never>;
        Update: {
          full_name?: string | null;
          phone?: string | null;
          email?: string | null;
          score?: number;
          intent?: LeadWorkflowContext["intent"];
          status?: LeadWorkflowContext["currentStatus"];
          assigned_agent_id?: string | null;
          follow_up_boss_contact_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      lead_events: {
        Row: {
          id: string;
          workspace_id: string;
          lead_id: string | null;
          provider: "meta" | "twilio" | "retell" | "follow_up_boss" | "manual";
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
        Insert: {
          workspace_id: string;
          lead_id: string | null;
          provider: "meta" | "twilio" | "retell" | "follow_up_boss" | "manual";
          event_type: string;
          source_channel: string;
          provider_event_id: string;
          provider_account_id?: string | null;
          provider_user_id?: string | null;
          source_post_id?: string | null;
          source_comment_id?: string | null;
          text?: string | null;
          occurred_at: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      integration_accounts: {
        Row: {
          id: string;
          workspace_id: string;
          account_scope: "workspace" | "member";
          owner_member_id: string | null;
          provider: "meta" | "twilio" | "retell" | "follow_up_boss";
          status: "pending" | "connected" | "needs_reauth" | "disabled" | "error";
          provider_account_id: string | null;
          provider_account_ids: string[];
          encrypted_credential_ref: string | null;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      workspace_members: {
        Row: {
          id: string;
          workspace_id: string;
          role: "owner" | "admin" | "team_lead" | "lead_manager" | "operator" | "agent" | "viewer";
          is_active: boolean;
          created_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      workspace_voice_agents: {
        Row: {
          id: string;
          workspace_id: string;
          account_scope: "workspace" | "member";
          owner_member_id: string | null;
          provider: "retell";
          status: "draft" | "provisioning" | "active" | "needs_sync" | "error" | "disabled";
          retell_agent_id: string | null;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      crm_sync_logs: {
        Row: {
          id: string;
          workspace_id: string;
          lead_id: string;
          provider: "follow_up_boss";
          status: "queued" | "synced" | "failed" | "skipped";
          provider_contact_id: string | null;
          last_outbound_at: string | null;
          backsync_suppressed_until: string | null;
        };
        Insert: {
          workspace_id: string;
          lead_id: string;
          provider: "follow_up_boss";
          status: "queued" | "synced" | "failed" | "skipped";
        };
        Update: {
          status?: "queued" | "synced" | "failed" | "skipped";
          provider_contact_id?: string | null;
          last_outbound_at?: string | null;
          backsync_suppressed_until?: string | null;
          last_error_code?: string | null;
          last_error_message?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      lead_tasks: {
        Row: {
          id: string;
          workspace_id: string;
          lead_id: string | null;
          listing_id: string | null;
          task_type: "call_back" | "verify_listing" | "assign_lead" | "fub_retry" | "nurture_review" | "request_showing_approval" | "showing_approval" | "open_house_registration";
          status: "open" | "in_progress" | "completed" | "dismissed";
          priority: "low" | "normal" | "high" | "urgent";
          assigned_member_id: string | null;
          title: string;
          description: string | null;
          due_at: string | null;
          created_at: string;
        };
        Insert: {
          workspace_id: string;
          lead_id?: string | null;
          listing_id?: string | null;
          task_type: "call_back" | "verify_listing" | "assign_lead" | "fub_retry" | "nurture_review" | "request_showing_approval" | "showing_approval" | "open_house_registration";
          priority: "low" | "normal" | "high" | "urgent";
          title: string;
          description: string;
          due_at?: string | null;
          assigned_member_id: string | null;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      social_reply_reviews: {
        Row: {
          id: string;
          workspace_id: string;
          lead_id: string | null;
          lead_event_id: string;
          provider_account_id: string;
          recipient_user_id: string | null;
          channel: "instagram_dm" | "instagram_comment" | "facebook_dm" | "facebook_comment";
          source_post_id: string | null;
          source_comment_id: string | null;
          suggested_reply: string | null;
          status: "pending" | "approved" | "sent" | "dismissed" | "failed";
          provider_event_id: string | null;
          last_error_code: string | null;
          last_error_message: string | null;
          reviewed_by_member_id: string | null;
          reviewed_at: string | null;
          updated_at: string;
        };
        Insert: Record<string, never>;
        Update: {
          suggested_reply?: string | null;
          status?: "pending" | "approved" | "sent" | "dismissed" | "failed";
          provider_event_id?: string | null;
          last_error_code?: string | null;
          last_error_message?: string | null;
          reviewed_by_member_id?: string | null;
          reviewed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      conversation_automation_states: {
        Row: {
          id: string;
          workspace_id: string;
          lead_id: string | null;
          provider_account_id: string;
          recipient_user_id: string | null;
          channel: "instagram_dm" | "instagram_comment" | "facebook_dm" | "facebook_comment";
          automation_mode: "ai_on" | "human_takeover" | "paused_by_rule";
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      harwick_ai_turns: {
        Row: {
          id: string;
          workspace_id: string;
          lead_id: string | null;
          social_reply_review_id: string | null;
          provider_thread_id: string | null;
          channel: "instagram_dm" | "instagram_comment" | "facebook_dm" | "facebook_comment" | "sms" | "call" | "manual" | "csv_import";
          turn: Record<string, unknown>;
          automation_decision: Record<string, unknown>;
          status: "drafted" | "auto_executed" | "queued_for_approval" | "blocked" | "failed";
          reply: string;
        };
        Insert: Record<string, never>;
        Update: {
          status?: "drafted" | "auto_executed" | "queued_for_approval" | "blocked" | "failed";
        };
        Relationships: [];
      };
      harwick_ai_tool_calls: {
        Row: {
          id: string;
          workspace_id: string;
          turn_id: string;
          lead_id: string | null;
          tool: "send_meta_reply" | "send_meta_dm" | "check_calendar" | "request_showing_approval" | "register_open_house" | "route_lead" | "sync_follow_up_boss" | "pause_automation";
          requires_approval: boolean;
          reason: string;
          payload: Record<string, unknown>;
          policy_status: "approved" | "approval_required" | "blocked";
          execution_status: "pending" | "executed" | "queued_for_approval" | "missing_handler" | "failed" | "blocked";
          execution_output: Record<string, unknown>;
          error_code: string | null;
          error_message: string | null;
          executed_at: string | null;
          created_at: string;
        };
        Insert: Record<string, never>;
        Update: {
          execution_status?: "pending" | "executed" | "queued_for_approval" | "missing_handler" | "failed" | "blocked";
          execution_output?: Record<string, unknown>;
          error_code?: string | null;
          error_message?: string | null;
          executed_at?: string | null;
        };
        Relationships: [];
      };
      nurture_enrollments: {
        Row: {
          id: string;
          workspace_id: string;
          lead_id: string;
          status: "active" | "paused" | "completed" | "opted_out";
          sequence_key: string;
          next_action_at: string | null;
          quiet_hours_timezone: string;
          last_step_index: number;
          opted_out_at: string | null;
          opt_out_reason: string | null;
        };
        Insert: {
          workspace_id: string;
          lead_id: string;
          status: "active";
          sequence_key: string;
          next_action_at: string;
          quiet_hours_timezone?: string;
          last_step_index?: number;
        };
        Update: {
          status?: "active" | "paused" | "completed" | "opted_out";
          next_action_at?: string | null;
          last_step_index?: number;
          opted_out_at?: string | null;
          opt_out_reason?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      nurture_messages: {
        Row: {
          id: string;
          workspace_id: string;
          lead_id: string;
          enrollment_id: string;
          channel: "sms" | "instagram_dm" | "facebook_dm";
          status: "queued" | "blocked" | "drafted" | "sent" | "failed";
          step_index: number;
          body: string | null;
          block_reason: "opted_out" | "quiet_hours" | "missing_contact" | "sequence_complete" | null;
          provider_message_id: string | null;
          scheduled_for: string | null;
          sent_at: string | null;
          last_error_code: string | null;
          last_error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          workspace_id: string;
          lead_id: string;
          enrollment_id: string;
          channel: "sms" | "instagram_dm" | "facebook_dm";
          status: "queued" | "blocked" | "drafted" | "sent" | "failed";
          step_index: number;
          body?: string | null;
          block_reason?: "opted_out" | "quiet_hours" | "missing_contact" | "sequence_complete" | null;
          scheduled_for?: string | null;
          sent_at?: string | null;
          last_error_code?: string | null;
          last_error_message?: string | null;
        };
        Update: {
          status?: "queued" | "blocked" | "drafted" | "sent" | "failed";
          provider_message_id?: string | null;
          sent_at?: string | null;
          last_error_code?: string | null;
          last_error_message?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      listing_facts: {
        Row: {
          id: string;
          workspace_id: string;
          address: string;
          mls_number: string | null;
          status: string | null;
          verification_status: "unverified" | "verified" | "needs_recheck";
          needs_recheck_at: string | null;
        };
        Insert: Record<string, never>;
        Update: {
          verification_status?: "unverified" | "verified" | "needs_recheck";
          needs_recheck_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      workflow_jobs: {
        Row: WorkerJobRow;
        Insert: Omit<
          WorkerJobRow,
          "id" | "created_at" | "updated_at" | "attempt_count" | "status" | "max_attempts" | "run_after" | "locked_at" | "locked_by" | "last_error_code" | "last_error_message"
        > & Partial<Pick<WorkerJobRow, "id" | "created_at" | "updated_at" | "attempt_count" | "status" | "max_attempts" | "run_after" | "locked_at" | "locked_by" | "last_error_code" | "last_error_message">>;
        Update: Partial<WorkerJobRow>;
        Relationships: [];
      };
      workspace_subscriptions: {
        Row: {
          workspace_id: string;
          status: "active" | "trialing" | "past_due" | "canceled" | "unpaid" | "incomplete" | "incomplete_expired" | "paused";
          current_period_start: string;
          current_period_end: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      workspace_usage_events: {
        Row: Record<string, unknown>;
        Insert: {
          workspace_id: string;
          event_type: "ai_message_sent";
          event_count: number;
          resource_id?: string | null;
          event_metadata?: Record<string, unknown> | null;
          billing_period_start: string;
          billing_period_end: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      crm_backsync_events: {
        Row: {
          id: string;
          workspace_id: string;
          provider: "follow_up_boss";
          subscription_id: string;
          provider_event_id: string;
          event_type: "peopleUpdated" | "peopleStageUpdated" | "notesCreated" | "tasksCreated" | "textMessagesCreated" | "callsCreated";
          resource_ids: number[];
          resource_uri: string | null;
          event_created_at: string;
          payload: Record<string, unknown>;
          status: "queued" | "processing" | "completed" | "failed" | "ignored";
          correlated_sync_log_id: string | null;
          processed_at: string | null;
          last_error_code: string | null;
          last_error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, never>;
        Update: {
          status?: "queued" | "processing" | "completed" | "failed" | "ignored";
          correlated_sync_log_id?: string | null;
          processed_at?: string | null;
          last_error_code?: string | null;
          last_error_message?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      conversation_messages: {
        Row: {
          id: string;
          lead_id: string;
          workspace_id: string;
          sender_type: "customer" | "ai" | "operator";
          sender_id: string | null;
          body: string;
          created_at: string;
          updated_at: string;
          status: "sent" | "in_progress" | "failed";
          source_channel: string | null;
          provider_message_id: string | null;
          error_code: string | null;
          error_message: string | null;
          agent_trajectory_id: string | null;
          agent_step_id: string | null;
        };
        Insert: {
          lead_id: string;
          workspace_id: string;
          sender_type: "customer" | "ai" | "operator";
          sender_id?: string | null;
          body: string;
          created_at?: string;
          status?: "sent" | "in_progress" | "failed";
          source_channel?: string | null;
          provider_message_id?: string | null;
          error_code?: string | null;
          error_message?: string | null;
          agent_trajectory_id?: string | null;
          agent_step_id?: string | null;
        };
        Update: {
          status?: "sent" | "in_progress" | "failed";
          error_code?: string | null;
          error_message?: string | null;
          updated_at?: string;
          agent_trajectory_id?: string | null;
          agent_step_id?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      claim_workflow_jobs: {
        Args: {
          worker_id: string;
          batch_size?: number;
          lock_timeout?: string;
        };
        Returns: WorkerJobRow[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type WorkflowJobRepository = {
  claimJobs(params: {
    workerId: string;
    batchSize: number;
  }): Promise<WorkflowJob[]>;
  markCompleted(params: {
    jobId: string;
    status: "completed" | "skipped";
    message: string;
  }): Promise<void>;
  markFailed(params: {
    job: WorkflowJob;
    errorCode: string;
    errorMessage: string;
  }): Promise<void>;
};

type WorkerSupabaseClient = SupabaseClient<RealtyOpsWorkerDatabase>;

export function createWorkerSupabaseClient(environment: WorkerEnvironment): WorkerSupabaseClient {
  return createClient<RealtyOpsWorkerDatabase>(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

export function createSupabaseWorkflowJobRepository(
  supabase: WorkerSupabaseClient,
): WorkflowJobRepository {
  return {
    async claimJobs(params) {
      const { data, error } = await supabase.rpc("claim_workflow_jobs", {
        worker_id: params.workerId,
        batch_size: params.batchSize,
      });

      if (error !== null) {
        throw error;
      }

      return parseWorkerJobRows(data ?? []);
    },

    async markCompleted(params) {
      const { error } = await supabase
        .from("workflow_jobs")
        .update({
          status: params.status,
          locked_at: null,
          locked_by: null,
          last_error_code: null,
          last_error_message: params.message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", params.jobId);

      if (error !== null) {
        throw error;
      }
    },

    async markFailed(params) {
      const retryable = params.job.attemptCount < params.job.maxAttempts;
      const { error } = await supabase
        .from("workflow_jobs")
        .update({
          status: "failed",
          run_after: retryable
            ? new Date(Date.now() + Math.min(params.job.attemptCount * 30_000, 300_000)).toISOString()
            : params.job.runAfter,
          locked_at: null,
          locked_by: null,
          last_error_code: params.errorCode,
          last_error_message: params.errorMessage.slice(0, 1000),
          updated_at: new Date().toISOString(),
        })
        .eq("id", params.job.id);

      if (error !== null) {
        throw error;
      }
    },
  };
}

export function createSupabaseWorkflowJobServices(
  supabase: WorkerSupabaseClient,
  options: {
    credentialSecret?: string | undefined;
    followUpBossApiKey?: string | undefined;
    twilio?: {
      accountSid: string;
      authToken: string;
      fromPhoneNumber: string;
    } | undefined;
    fetchImpl?: typeof fetch;
  } = {},
): WorkflowJobServices {
  const FollowUpBossCredentialSchema = z.object({
    apiKey: z.string().trim().min(1),
  });
  const leadSignalEventTypes = [
    "message_received",
    "comment_received",
    "call_completed",
    "sms_received",
    "callsCreated",
    "textMessagesCreated",
  ] as const;
  const closedLeadStatuses = new Set<LeadWorkflowContext["currentStatus"]>(["closed_won", "closed_lost", "archived"]);

  async function resolveSourceOwnerMemberId(params: {
    workspaceId: string;
    leadId: string;
  }): Promise<string | null> {
    const { data: latestEvent, error: latestEventError } = await supabase
      .from("lead_events")
      .select("provider,provider_account_id")
      .eq("lead_id", params.leadId)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestEventError !== null) {
      throw latestEventError;
    }

    const providerAccountId = latestEvent?.provider_account_id ?? null;
    if (latestEvent === null || providerAccountId === null) {
      return null;
    }
    if (latestEvent.provider === "manual") {
      return null;
    }

    if (latestEvent.provider === "retell") {
      const { data: voiceAgent, error: voiceAgentError } = await supabase
        .from("workspace_voice_agents")
        .select("owner_member_id")
        .eq("workspace_id", params.workspaceId)
        .eq("provider", "retell")
        .eq("account_scope", "member")
        .eq("retell_agent_id", providerAccountId)
        .in("status", ["active", "needs_sync"])
        .not("owner_member_id", "is", null)
        .maybeSingle();

      if (voiceAgentError !== null) {
        throw voiceAgentError;
      }

      if (voiceAgent?.owner_member_id !== null && voiceAgent?.owner_member_id !== undefined) {
        return voiceAgent.owner_member_id;
      }
    }

    const { data: directOwner, error: directOwnerError } = await supabase
      .from("integration_accounts")
      .select("owner_member_id")
      .eq("workspace_id", params.workspaceId)
      .eq("provider", latestEvent.provider)
      .eq("status", "connected")
      .eq("account_scope", "member")
      .eq("provider_account_id", providerAccountId)
      .not("owner_member_id", "is", null)
      .maybeSingle();

    if (directOwnerError !== null) {
      throw directOwnerError;
    }

    if (directOwner?.owner_member_id !== null && directOwner?.owner_member_id !== undefined) {
      return directOwner.owner_member_id;
    }

    const { data: aliasOwner, error: aliasOwnerError } = await supabase
      .from("integration_accounts")
      .select("owner_member_id")
      .eq("workspace_id", params.workspaceId)
      .eq("provider", latestEvent.provider)
      .eq("status", "connected")
      .eq("account_scope", "member")
      .contains("provider_account_ids", [providerAccountId])
      .not("owner_member_id", "is", null)
      .maybeSingle();

    if (aliasOwnerError !== null) {
      throw aliasOwnerError;
    }

    return aliasOwner?.owner_member_id ?? null;
  }

  async function resolveFollowUpBossApiKey(workspaceId: string): Promise<string | null> {
    if (options.credentialSecret !== undefined) {
      const { data, error } = await supabase
        .from("integration_accounts")
        .select("encrypted_credential_ref")
        .eq("workspace_id", workspaceId)
        .eq("provider", "follow_up_boss")
        .eq("status", "connected")
        .not("encrypted_credential_ref", "is", null)
        .maybeSingle();

      if (error !== null) {
        throw error;
      }

      if (data?.encrypted_credential_ref !== null && data?.encrypted_credential_ref !== undefined) {
        const parsed = FollowUpBossCredentialSchema.parse(
          decryptCredential<unknown>(data.encrypted_credential_ref, options.credentialSecret),
        );
        return parsed.apiKey;
      }
    }

    return options.followUpBossApiKey ?? null;
  }

  async function findConnectedMetaCredential(params: {
    workspaceId: string;
    providerAccountId: string;
  }): Promise<{
    providerAccountId: string;
    encryptedCredentialRef: string;
  } | null> {
    const selectColumns = "provider_account_id,provider_account_ids,encrypted_credential_ref";

    const { data, error } = await supabase
      .from("integration_accounts")
      .select(selectColumns)
      .eq("workspace_id", params.workspaceId)
      .eq("provider", "meta")
      .eq("status", "connected")
      .eq("provider_account_id", params.providerAccountId)
      .maybeSingle();

    if (error !== null) {
      throw error;
    }

    if (
      data?.encrypted_credential_ref !== null
      && data?.encrypted_credential_ref !== undefined
      && data.provider_account_id !== null
    ) {
      return {
        providerAccountId: data.provider_account_id,
        encryptedCredentialRef: data.encrypted_credential_ref,
      };
    }

    const { data: aliasData, error: aliasError } = await supabase
      .from("integration_accounts")
      .select(selectColumns)
      .eq("workspace_id", params.workspaceId)
      .eq("provider", "meta")
      .eq("status", "connected")
      .contains("provider_account_ids", [params.providerAccountId])
      .maybeSingle();

    if (aliasError !== null) {
      throw aliasError;
    }

    if (
      aliasData?.encrypted_credential_ref === null
      || aliasData === null
      || aliasData.provider_account_id === null
    ) {
      return null;
    }

    return {
      providerAccountId: aliasData.provider_account_id,
      encryptedCredentialRef: aliasData.encrypted_credential_ref,
    };
  }

  async function resolveConversationAutomationMode(params: {
    workspaceId: string;
    leadId: string | null;
    providerAccountId: string;
    recipientUserId: string | null;
    channel: "instagram_dm" | "instagram_comment" | "facebook_dm" | "facebook_comment";
  }): Promise<"ai_on" | "human_takeover" | "paused_by_rule"> {
    let query = supabase
      .from("conversation_automation_states")
      .select("automation_mode")
      .eq("workspace_id", params.workspaceId);

    if (params.leadId !== null) {
      query = query.eq("lead_id", params.leadId);
    } else {
      query = query
        .is("lead_id", null)
        .eq("provider_account_id", params.providerAccountId)
        .eq("channel", params.channel);

      query = params.recipientUserId === null
        ? query.is("recipient_user_id", null)
        : query.eq("recipient_user_id", params.recipientUserId);
    }

    const { data, error } = await query.maybeSingle();
    if (error !== null) {
      throw error;
    }

    return data?.automation_mode ?? "ai_on";
  }

  async function resolveLatestProviderAccountId(params: {
    workspaceId: string;
    leadId: string;
    channels: string[];
  }): Promise<string | null> {
    const { data, error } = await supabase
      .from("lead_events")
      .select("provider_account_id")
      .eq("workspace_id", params.workspaceId)
      .eq("lead_id", params.leadId)
      .in("source_channel", params.channels)
      .not("provider_account_id", "is", null)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error !== null) {
      throw error;
    }

    return data?.provider_account_id ?? null;
  }

  async function markNurtureMessageFailed(params: {
    workspaceId: string;
    messageId: string;
    code: string;
    message: string;
  }): Promise<void> {
    const { error } = await supabase
      .from("nurture_messages")
      .update({
        status: "failed",
        last_error_code: params.code,
        last_error_message: params.message.slice(0, 1000),
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", params.workspaceId)
      .eq("id", params.messageId);

    if (error !== null) {
      throw error;
    }
  }

  async function recordSentNurtureUsage(params: {
    workspaceId: string;
    messageId: string;
    leadId: string;
    channel: "sms" | "instagram_dm" | "facebook_dm";
  }): Promise<void> {
    const { data: subscription, error: subscriptionError } = await supabase
      .from("workspace_subscriptions")
      .select("workspace_id,status,current_period_start,current_period_end")
      .eq("workspace_id", params.workspaceId)
      .maybeSingle();

    if (subscriptionError !== null) {
      throw subscriptionError;
    }
    if (
      subscription === null
      || subscription.status === "canceled"
      || subscription.status === "incomplete_expired"
      || subscription.status === "paused"
    ) {
      return;
    }

    const { error } = await supabase
      .from("workspace_usage_events")
      .insert({
        workspace_id: params.workspaceId,
        event_type: "ai_message_sent",
        event_count: 1,
        resource_id: params.messageId,
        event_metadata: {
          kind: "nurture_message",
          leadId: params.leadId,
          channel: params.channel,
        },
        billing_period_start: subscription.current_period_start,
        billing_period_end: subscription.current_period_end,
      });

    if (error !== null) {
      throw error;
    }
  }

  function readMetaToolReply(payload: Record<string, unknown>): string | null {
    const directReply = payload["reply"];
    if (typeof directReply === "string" && directReply.trim().length > 0) {
      return directReply.trim();
    }

    const buyerBlueprintUrl = payload["buyerBlueprintUrl"];
    if (typeof buyerBlueprintUrl === "string" && buyerBlueprintUrl.trim().length > 0) {
      return buyerBlueprintUrl.trim();
    }

    return null;
  }

  type MetaMessageTarget = "current_thread" | "comment" | "dm";

  function readMetaToolTarget(payload: Record<string, unknown>): MetaMessageTarget {
    const value = payload["target"];
    return value === "comment" || value === "dm" ? value : "current_thread";
  }

  function metaDmChannelFor(channel: "instagram_dm" | "instagram_comment" | "facebook_dm" | "facebook_comment") {
    return channel.startsWith("instagram") ? "instagram_dm" : "facebook_dm";
  }

  async function findLeadIdByFollowUpBossContactId(params: {
    workspaceId: string;
    providerContactId: string;
  }): Promise<string | null> {
    const { data, error } = await supabase
      .from("leads")
      .select("id")
      .eq("workspace_id", params.workspaceId)
      .eq("follow_up_boss_contact_id", params.providerContactId)
      .maybeSingle();

    if (error !== null) {
      throw error;
    }

    return data?.id ?? null;
  }

  return {
    async getLeadWorkflowContext(leadId) {
      const { data: lead, error } = await supabase
        .from("leads")
        .select("id,workspace_id,full_name,phone,email,source_channel,lead_type,intent,timeline,budget_min,budget_max,target_area,financing_status,score,status,assigned_agent_id")
        .eq("id", leadId)
        .maybeSingle();

      if (error !== null) {
        throw error;
      }
      if (lead === null) {
        return null;
      }

      const { data: latestEvents, error: eventError } = await supabase
        .from("lead_events")
        .select("text,occurred_at")
        .eq("lead_id", leadId)
        .in("event_type", [...leadSignalEventTypes])
        .order("occurred_at", { ascending: false })
        .limit(1);

      if (eventError !== null) {
        throw eventError;
      }

      const { count: engagementCount, error: engagementCountError } = await supabase
        .from("lead_events")
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq("lead_id", leadId)
        .in("event_type", [...leadSignalEventTypes]);

      if (engagementCountError !== null) {
        throw engagementCountError;
      }

      return {
        leadId: lead.id,
        workspaceId: lead.workspace_id,
        sourceChannel: lead.source_channel,
        leadType: lead.lead_type,
        intent: lead.intent,
        timeline: lead.timeline,
        budgetMin: lead.budget_min,
        budgetMax: lead.budget_max,
        targetArea: lead.target_area,
        financingStatus: lead.financing_status,
        currentScore: lead.score,
        currentStatus: lead.status,
        assignedAgentId: lead.assigned_agent_id,
        engagementCount: engagementCount ?? 0,
        latestText: latestEvents?.[0]?.text ?? null,
      };
    },

    async updateLeadWorkflowDecision(params) {
      const { error } = await supabase
        .from("leads")
        .update({
          score: params.score,
          intent: params.intent,
          status: params.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", params.leadId);

      if (error !== null) {
        throw error;
      }
    },

    async assignLead(params) {
      const { data: members, error } = await supabase
        .from("workspace_members")
        .select("id,role,is_active,workspace_id,created_at")
        .eq("workspace_id", params.workspaceId)
        .eq("is_active", true)
        .in("role", ["agent", "lead_manager", "team_lead", "owner", "admin"])
        .order("created_at", { ascending: true });

      if (error !== null) {
        throw error;
      }

      const eligibleMembers = members ?? [];
      if (eligibleMembers.length === 0) {
        return null;
      }

      const sourceOwnerMemberId = await resolveSourceOwnerMemberId({
        workspaceId: params.workspaceId,
        leadId: params.leadId,
      });

      const { data: assignedLeads, error: assignedLeadError } = await supabase
        .from("leads")
        .select("assigned_agent_id,status")
        .eq("workspace_id", params.workspaceId)
        .not("assigned_agent_id", "is", null);

      if (assignedLeadError !== null) {
        throw assignedLeadError;
      }

      const { data: openTasks, error: openTasksError } = await supabase
        .from("lead_tasks")
        .select("assigned_member_id,status,priority")
        .eq("workspace_id", params.workspaceId)
        .not("assigned_member_id", "is", null)
        .in("status", ["open", "in_progress"]);

      if (openTasksError !== null) {
        throw openTasksError;
      }

      const activeLeadCounts = new Map<string, number>();
      for (const row of assignedLeads ?? []) {
        if (row.assigned_agent_id === null || closedLeadStatuses.has(row.status)) {
          continue;
        }

        activeLeadCounts.set(row.assigned_agent_id, (activeLeadCounts.get(row.assigned_agent_id) ?? 0) + 1);
      }

      const openTaskCounts = new Map<string, number>();
      const urgentTaskCounts = new Map<string, number>();
      for (const row of openTasks ?? []) {
        if (row.assigned_member_id === null) {
          continue;
        }

        openTaskCounts.set(row.assigned_member_id, (openTaskCounts.get(row.assigned_member_id) ?? 0) + 1);
        if (row.priority === "high" || row.priority === "urgent") {
          urgentTaskCounts.set(row.assigned_member_id, (urgentTaskCounts.get(row.assigned_member_id) ?? 0) + 1);
        }
      }

      const routingCandidates: AssignmentRoutingCandidate[] = eligibleMembers
        .filter((member): member is typeof member & { role: AssignmentRoutingCandidate["role"] } => {
          return member.role === "agent"
            || member.role === "lead_manager"
            || member.role === "team_lead"
            || member.role === "owner"
            || member.role === "admin";
        })
        .map((member) => ({
        memberId: member.id,
        role: member.role,
        activeLeadCount: activeLeadCounts.get(member.id) ?? 0,
        openTaskCount: openTaskCounts.get(member.id) ?? 0,
        urgentTaskCount: urgentTaskCounts.get(member.id) ?? 0,
        createdAt: member.created_at,
      }));
      const assignmentDecision = chooseAssignmentCandidate({
        sourceOwnerMemberId,
        candidates: routingCandidates,
      });
      if (assignmentDecision.memberId === null) {
        return null;
      }

      const { error: updateError } = await supabase
        .from("leads")
        .update({
          assigned_agent_id: assignmentDecision.memberId,
          status: "assigned",
          updated_at: new Date().toISOString(),
        })
        .eq("id", params.leadId);

      if (updateError !== null) {
        throw updateError;
      }

      return assignmentDecision.memberId;
    },

    async createHandoffTask(params) {
      const { error } = await supabase
        .from("lead_tasks")
        .insert({
          workspace_id: params.workspaceId,
          lead_id: params.leadId,
          task_type: "call_back",
          priority: params.priority,
          title: params.title,
          description: params.description,
          assigned_member_id: params.assignedMemberId,
        });

      if (error !== null) {
        throw error;
      }
    },

    async enqueueFubSync(params) {
      const { error: logError } = await supabase
        .from("crm_sync_logs")
        .insert({
          workspace_id: params.workspaceId,
          lead_id: params.leadId,
          provider: "follow_up_boss",
          status: "queued",
        });

      if (logError !== null) {
        throw logError;
      }

      const { error: jobError } = await supabase
        .from("workflow_jobs")
        .upsert({
          workspace_id: params.workspaceId,
          lead_id: params.leadId,
          lead_event_id: null,
          job_type: "fub_sync",
          payload: {
            jobType: "fub_sync",
            workspaceId: params.workspaceId,
            leadId: params.leadId,
            qualifiedOnly: true,
          },
          idempotency_key: `fub_sync:${params.leadId}`,
        }, {
          onConflict: "workspace_id,idempotency_key",
          ignoreDuplicates: true,
        });

      if (jobError !== null) {
        throw jobError;
      }
    },

    async enrollNurture(params) {
      const nextActionAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("nurture_enrollments")
        .upsert({
          workspace_id: params.workspaceId,
          lead_id: params.leadId,
          status: "active",
          sequence_key: "default_realtor_nurture_v1",
          next_action_at: nextActionAt,
          quiet_hours_timezone: "America/Chicago",
          last_step_index: 0,
        }, {
          onConflict: "workspace_id,lead_id,sequence_key",
        })
        .select("id")
        .single<{ id: string }>();

      if (error !== null) {
        throw error;
      }

      const { error: jobError } = await supabase
        .from("workflow_jobs")
        .upsert({
          workspace_id: params.workspaceId,
          lead_id: params.leadId,
          lead_event_id: null,
          job_type: "nurture_delivery",
          run_after: nextActionAt,
          payload: {
            jobType: "nurture_delivery",
            workspaceId: params.workspaceId,
            leadId: params.leadId,
            enrollmentId: data.id,
            reason: "scheduled_followup",
          },
          idempotency_key: `nurture_delivery:${data.id}:0`,
        }, {
          onConflict: "workspace_id,idempotency_key",
          ignoreDuplicates: true,
        });

      if (jobError !== null) {
        throw jobError;
      }
    },

    async processListingRecheck(params) {
      const { data: listing, error: listingError } = await supabase
        .from("listing_facts")
        .select("id,workspace_id,address,mls_number,status,verification_status,needs_recheck_at")
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.listingId)
        .maybeSingle();

      if (listingError !== null) {
        throw listingError;
      }
      if (listing === null) {
        return "listing recheck skipped because listing was not found";
      }

      const { data: existingTask, error: taskLookupError } = await supabase
        .from("lead_tasks")
        .select("id")
        .eq("workspace_id", params.workspaceId)
        .eq("listing_id", params.listingId)
        .eq("task_type", "verify_listing")
        .in("status", ["open", "in_progress"])
        .limit(1)
        .maybeSingle();

      if (taskLookupError !== null) {
        throw taskLookupError;
      }
      if (existingTask !== null) {
        return "listing recheck task already open";
      }

      const reference = listing.mls_number === null ? listing.address : `${listing.address} (${listing.mls_number})`;
      const { error: taskError } = await supabase
        .from("lead_tasks")
        .insert({
          workspace_id: params.workspaceId,
          lead_id: null,
          listing_id: listing.id,
          task_type: "verify_listing",
          priority: "normal",
          title: `Recheck listing details: ${reference}`.slice(0, 255),
          description: `Scheduled listing freshness checkpoint. Confirm price, status, incentives, and availability for ${reference}.`,
          due_at: listing.needs_recheck_at,
          assigned_member_id: null,
        });

      if (taskError !== null) {
        throw taskError;
      }

      const { error: listingUpdateError } = await supabase
        .from("listing_facts")
        .update({
          verification_status: "needs_recheck",
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.listingId);

      if (listingUpdateError !== null) {
        throw listingUpdateError;
      }

      return "listing recheck task created";
    },

    async processNurtureDelivery(params) {
      const { data: enrollmentRow, error: enrollmentError } = await supabase
        .from("nurture_enrollments")
        .select("id,workspace_id,lead_id,status,sequence_key,next_action_at,quiet_hours_timezone,last_step_index,opted_out_at,opt_out_reason")
        .eq("workspace_id", params.workspaceId)
        .eq("lead_id", params.leadId)
        .eq("id", params.enrollmentId)
        .maybeSingle();

      if (enrollmentError !== null) {
        throw enrollmentError;
      }
      if (enrollmentRow === null) {
        return "nurture enrollment was not found";
      }

      const { data: leadRow, error: leadError } = await supabase
        .from("leads")
        .select("id,workspace_id,full_name,phone,instagram_user_id,source_channel")
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.leadId)
        .maybeSingle();

      if (leadError !== null) {
        throw leadError;
      }
      if (leadRow === null) {
        return "nurture lead was not found";
      }

      const enrollment = NurtureEnrollmentSchema.parse({
        id: enrollmentRow.id,
        workspaceId: enrollmentRow.workspace_id,
        leadId: enrollmentRow.lead_id,
        status: enrollmentRow.status,
        sequenceKey: enrollmentRow.sequence_key,
        nextActionAt: enrollmentRow.next_action_at,
        quietHoursTimezone: enrollmentRow.quiet_hours_timezone,
        lastStepIndex: enrollmentRow.last_step_index,
        optedOutAt: enrollmentRow.opted_out_at,
        optOutReason: enrollmentRow.opt_out_reason,
      });
      const lead = NurtureLeadContactSchema.parse({
        leadId: leadRow.id,
        workspaceId: leadRow.workspace_id,
        fullName: leadRow.full_name,
        phone: leadRow.phone,
        instagramUserId: leadRow.instagram_user_id,
        sourceChannel: leadRow.source_channel,
      });

      if (params.messageId !== undefined) {
        const approvedMessageId = params.messageId;
        const { data: messageRow, error: messageError } = await supabase
          .from("nurture_messages")
          .select("id,workspace_id,lead_id,enrollment_id,channel,status,step_index,body,block_reason,provider_message_id,scheduled_for,sent_at,last_error_code,last_error_message,created_at,updated_at")
          .eq("workspace_id", params.workspaceId)
          .eq("lead_id", params.leadId)
          .eq("enrollment_id", params.enrollmentId)
          .eq("id", approvedMessageId)
          .maybeSingle();

        if (messageError !== null) {
          throw messageError;
        }
        if (messageRow === null) {
          return "approved nurture message was not found";
        }
        if (messageRow.status === "sent") {
          return "approved nurture message was already sent";
        }
        if (messageRow.status !== "queued") {
          return `approved nurture message skipped because status is ${messageRow.status}`;
        }

        const body = messageRow.body?.trim() ?? "";
        if (body.length === 0) {
          await markNurtureMessageFailed({
            workspaceId: params.workspaceId,
            messageId: approvedMessageId,
            code: "missing_message_body",
            message: "Approved nurture delivery cannot send a blank message.",
          });
          throw new Error("Approved nurture delivery cannot send a blank message.");
        }

        let providerEventId: string;
        let provider: "meta" | "twilio";
        let providerAccountId: string | null;
        let providerUserId: string | null;
        if (messageRow.channel === "sms") {
          if (lead.phone === null || lead.phone.trim().length === 0) {
            await markNurtureMessageFailed({
              workspaceId: params.workspaceId,
              messageId: approvedMessageId,
              code: "missing_sms_contact",
              message: "Approved nurture delivery cannot send SMS because the lead has no phone number.",
            });
            throw new Error("Approved nurture delivery cannot send SMS because the lead has no phone number.");
          }
          if (options.twilio === undefined) {
            await markNurtureMessageFailed({
              workspaceId: params.workspaceId,
              messageId: approvedMessageId,
              code: "provider_not_configured",
              message: "Twilio SMS credentials are not configured in the worker.",
            });
            throw new Error("Twilio SMS credentials are not configured in the worker.");
          }

          const twilioClient = createTwilioMessagingClient(
            options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl },
          );
          const result = await twilioClient.sendSms({
            accountSid: options.twilio.accountSid,
            authToken: options.twilio.authToken,
            from: options.twilio.fromPhoneNumber,
            to: lead.phone,
            body,
          }).catch(async (error: unknown) => {
            const message = error instanceof Error ? error.message : "Twilio SMS delivery failed.";
            await markNurtureMessageFailed({
              workspaceId: params.workspaceId,
              messageId: approvedMessageId,
              code: "provider_send_failed",
              message,
            });
            throw error;
          });
          providerEventId = result.providerEventId;
          provider = "twilio";
          providerAccountId = options.twilio.fromPhoneNumber;
          providerUserId = lead.phone;
        } else {
          if (lead.instagramUserId === null) {
            await markNurtureMessageFailed({
              workspaceId: params.workspaceId,
              messageId: approvedMessageId,
              code: "missing_social_contact",
              message: "Approved nurture delivery cannot send a social DM because the lead has no provider user id.",
            });
            throw new Error("Approved nurture delivery cannot send a social DM because the lead has no provider user id.");
          }
          if (options.credentialSecret === undefined) {
            await markNurtureMessageFailed({
              workspaceId: params.workspaceId,
              messageId: approvedMessageId,
              code: "credential_secret_missing",
              message: "Meta credentials cannot be decrypted because the worker credential secret is missing.",
            });
            throw new Error("Meta credentials cannot be decrypted because the worker credential secret is missing.");
          }

          const providerAccount = await resolveLatestProviderAccountId({
            workspaceId: params.workspaceId,
            leadId: params.leadId,
            channels: messageRow.channel === "instagram_dm"
              ? ["instagram_dm", "instagram_comment"]
              : ["facebook_dm", "facebook_comment"],
          });
          if (providerAccount === null) {
            await markNurtureMessageFailed({
              workspaceId: params.workspaceId,
              messageId: approvedMessageId,
              code: "provider_account_missing",
              message: "Approved nurture delivery cannot find a connected Meta provider account for this lead.",
            });
            throw new Error("Approved nurture delivery cannot find a connected Meta provider account for this lead.");
          }

          const connectedCredential = await findConnectedMetaCredential({
            workspaceId: params.workspaceId,
            providerAccountId: providerAccount,
          });
          if (connectedCredential === null) {
            await markNurtureMessageFailed({
              workspaceId: params.workspaceId,
              messageId: approvedMessageId,
              code: "integration_not_found",
              message: "Meta credentials are not connected for this provider account.",
            });
            throw new Error("Meta credentials are not connected for this provider account.");
          }

          const metaCredential = MetaConnectedCredentialSchema.parse(
            decryptCredential<unknown>(connectedCredential.encryptedCredentialRef, options.credentialSecret),
          );
          const metaClient = createMetaMessagingClient(
            options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl },
          );
          const result = await metaClient.sendDirectMessage({
            pageId: metaCredential.pageId,
            recipientUserId: lead.instagramUserId,
            accessToken: metaCredential.pageAccessToken,
            reply: body,
          }).catch(async (error: unknown) => {
            const message = error instanceof Error ? error.message : "Meta DM delivery failed.";
            await markNurtureMessageFailed({
              workspaceId: params.workspaceId,
              messageId: approvedMessageId,
              code: "provider_send_failed",
              message,
            });
            throw error;
          });
          providerEventId = result.providerEventId;
          provider = "meta";
          providerAccountId = connectedCredential.providerAccountId;
          providerUserId = lead.instagramUserId;
        }

        const occurredAt = new Date().toISOString();
        const { error: updateMessageError } = await supabase
          .from("nurture_messages")
          .update({
            status: "sent",
            provider_message_id: providerEventId,
            sent_at: occurredAt,
            last_error_code: null,
            last_error_message: null,
            updated_at: occurredAt,
          })
          .eq("workspace_id", params.workspaceId)
          .eq("id", approvedMessageId);

        if (updateMessageError !== null) {
          throw updateMessageError;
        }

        const { error: leadEventError } = await supabase
          .from("lead_events")
          .insert({
            workspace_id: params.workspaceId,
            lead_id: params.leadId,
            provider,
            event_type: messageRow.channel === "sms" ? "sms_sent" : "reply_sent",
            source_channel: messageRow.channel,
            provider_event_id: providerEventId,
            provider_account_id: providerAccountId,
            provider_user_id: providerUserId,
            source_post_id: null,
            source_comment_id: null,
            text: body,
            occurred_at: occurredAt,
          });

        if (leadEventError !== null) {
          throw leadEventError;
        }

        const { error: conversationMessageError } = await supabase
          .from("conversation_messages")
          .insert({
            lead_id: params.leadId,
            workspace_id: params.workspaceId,
            sender_type: "ai",
            sender_id: "harwick_ai",
            body,
            source_channel: messageRow.channel,
            provider_message_id: providerEventId,
            status: "sent",
            created_at: occurredAt,
            agent_trajectory_id: null,
            agent_step_id: null,
          });

        if (conversationMessageError !== null) {
          throw conversationMessageError;
        }

        await recordSentNurtureUsage({
          workspaceId: params.workspaceId,
          messageId: approvedMessageId,
          leadId: params.leadId,
          channel: messageRow.channel,
        });

        return `approved nurture ${messageRow.channel} message sent`;
      }

      const decision = decideNurtureAction({
        enrollment,
        lead,
        now: new Date(),
      });

      if (decision.action === "block") {
        const { error: messageError } = await supabase
          .from("nurture_messages")
          .insert({
            workspace_id: params.workspaceId,
            lead_id: params.leadId,
            enrollment_id: params.enrollmentId,
            channel: lead.phone === null ? "instagram_dm" : "sms",
            status: "blocked",
            step_index: enrollment.lastStepIndex,
            body: null,
            block_reason: decision.reason,
            scheduled_for: decision.nextActionAt,
          });

        if (messageError !== null) {
          throw messageError;
        }

        const shouldComplete = decision.reason === "sequence_complete" || decision.reason === "missing_contact";
        const { error: updateError } = await supabase
          .from("nurture_enrollments")
          .update({
            status: decision.reason === "opted_out" ? "opted_out" : shouldComplete ? "completed" : "active",
            next_action_at: decision.nextActionAt,
            updated_at: new Date().toISOString(),
          })
          .eq("id", params.enrollmentId);

        if (updateError !== null) {
          throw updateError;
        }

        if (decision.reason === "quiet_hours" && decision.nextActionAt !== null) {
          const { error: jobError } = await supabase
            .from("workflow_jobs")
            .upsert({
              workspace_id: params.workspaceId,
              lead_id: params.leadId,
              lead_event_id: null,
              job_type: "nurture_delivery",
              run_after: decision.nextActionAt,
              payload: {
                jobType: "nurture_delivery",
                workspaceId: params.workspaceId,
                leadId: params.leadId,
                enrollmentId: params.enrollmentId,
                reason: "quiet_hour_resume",
              },
              idempotency_key: `nurture_delivery:${params.enrollmentId}:${enrollment.lastStepIndex}:quiet_hours`,
            }, {
              onConflict: "workspace_id,idempotency_key",
              ignoreDuplicates: true,
            });

          if (jobError !== null) {
            throw jobError;
          }
        }

        return `nurture blocked: ${decision.reason}`;
      }

      const { error: messageError } = await supabase
        .from("nurture_messages")
        .insert({
          workspace_id: params.workspaceId,
          lead_id: params.leadId,
          enrollment_id: params.enrollmentId,
          channel: decision.step.channel,
          status: "drafted",
          step_index: decision.step.index,
          body: decision.step.body,
          block_reason: null,
          scheduled_for: null,
        });

      if (messageError !== null) {
        throw messageError;
      }

      const { error: taskError } = await supabase
        .from("lead_tasks")
        .insert({
          workspace_id: params.workspaceId,
          lead_id: params.leadId,
          task_type: "nurture_review",
          priority: "normal",
          title: "Review nurture follow-up",
          description: decision.step.body,
          assigned_member_id: null,
        });

      if (taskError !== null) {
        throw taskError;
      }

      const nextStepIndex = decision.step.index + 1;
      const { error: updateError } = await supabase
        .from("nurture_enrollments")
        .update({
          last_step_index: nextStepIndex,
          next_action_at: decision.nextActionAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", params.enrollmentId);

      if (updateError !== null) {
        throw updateError;
      }

      if (decision.nextActionAt !== null) {
        const { error: jobError } = await supabase
          .from("workflow_jobs")
          .upsert({
            workspace_id: params.workspaceId,
            lead_id: params.leadId,
            lead_event_id: null,
            job_type: "nurture_delivery",
            run_after: decision.nextActionAt,
            payload: {
              jobType: "nurture_delivery",
              workspaceId: params.workspaceId,
              leadId: params.leadId,
              enrollmentId: params.enrollmentId,
              reason: "scheduled_followup",
            },
            idempotency_key: `nurture_delivery:${params.enrollmentId}:${nextStepIndex}`,
          }, {
            onConflict: "workspace_id,idempotency_key",
            ignoreDuplicates: true,
          });

        if (jobError !== null) {
          throw jobError;
        }
      }

      return `nurture drafted step ${decision.step.index}`;
    },

    async processHarwickAiReply(params) {
      const now = new Date().toISOString();
      const { data: turnRow, error: turnError } = await supabase
        .from("harwick_ai_turns")
        .select("id,workspace_id,lead_id,social_reply_review_id,provider_thread_id,channel,turn,automation_decision,status,reply")
        .eq("id", params.turnId)
        .eq("workspace_id", params.workspaceId)
        .maybeSingle();

      if (turnError !== null) {
        throw turnError;
      }
      if (turnRow === null) {
        return {
          status: "skipped",
          message: "Harwick AI reply skipped because the persisted turn was not found",
        };
      }

      const automationDecision = HarwickAiAutomationDecisionSchema.parse(turnRow.automation_decision);
      const { data: toolRows, error: toolError } = await supabase
        .from("harwick_ai_tool_calls")
        .select("*")
        .eq("turn_id", params.turnId)
        .order("created_at", { ascending: true });

      if (toolError !== null) {
        throw toolError;
      }

      const approvedToolRows = (toolRows ?? []).filter((row) => row.policy_status === "approved");
      if (approvedToolRows.length === 0) {
        await supabase
          .from("harwick_ai_turns")
          .update({ status: "blocked" })
          .eq("id", params.turnId);
        return {
          status: "skipped",
          message: "Harwick AI reply skipped because no approved tool calls were available",
        };
      }

      if (turnRow.status === "auto_executed" && approvedToolRows.every((row) => row.execution_status === "executed")) {
        return {
          status: "skipped",
          message: "Harwick AI reply skipped because the turn already executed",
        };
      }

      const currentAutomationMode = await resolveConversationAutomationMode({
        workspaceId: params.workspaceId,
        leadId: params.leadId,
        providerAccountId: params.providerAccountId,
        recipientUserId: params.recipientUserId,
        channel: params.channel,
      });
      if (!canAutomationSend(currentAutomationMode)) {
        for (const toolRow of approvedToolRows.filter((row) => row.execution_status === "pending")) {
          const { error } = await supabase
            .from("harwick_ai_tool_calls")
            .update({
              execution_status: "blocked",
              error_code: "automation_paused",
              error_message: "Harwick AI is not allowed to send while this conversation is paused or in human takeover.",
            })
            .eq("id", toolRow.id);
          if (error !== null) {
            throw error;
          }
        }

        const { error } = await supabase
          .from("harwick_ai_turns")
          .update({ status: "blocked" })
          .eq("id", params.turnId);
        if (error !== null) {
          throw error;
        }

        return {
          status: "skipped",
          message: "Harwick AI reply skipped because the conversation is paused or in human takeover",
        };
      }

      if (options.credentialSecret === undefined) {
        return {
          status: "skipped",
          message: "Harwick AI reply skipped because credential encryption is not configured in the worker",
        };
      }

      const connectedCredential = await findConnectedMetaCredential({
        workspaceId: params.workspaceId,
        providerAccountId: params.providerAccountId,
      });
      if (connectedCredential === null) {
        const failureMessage = "Meta credentials are not connected for this provider account.";
        for (const toolRow of approvedToolRows.filter((row) => row.execution_status === "pending")) {
          const { error } = await supabase
            .from("harwick_ai_tool_calls")
            .update({
              execution_status: "failed",
              error_code: "integration_not_found",
              error_message: failureMessage,
            })
            .eq("id", toolRow.id);
          if (error !== null) {
            throw error;
          }
        }
        const { error: turnUpdateError } = await supabase
          .from("harwick_ai_turns")
          .update({ status: "failed" })
          .eq("id", params.turnId);
        if (turnUpdateError !== null) {
          throw turnUpdateError;
        }
        if (params.socialReplyReviewId !== null) {
          const { error: reviewError } = await supabase
            .from("social_reply_reviews")
            .update({
              status: "failed",
              suggested_reply: turnRow.reply,
              last_error_code: "integration_not_found",
              last_error_message: failureMessage,
              updated_at: now,
            })
            .eq("id", params.socialReplyReviewId)
            .eq("workspace_id", params.workspaceId);
          if (reviewError !== null) {
            throw reviewError;
          }
        }
        return {
          status: "skipped",
          message: failureMessage,
        };
      }

      const metaCredential = MetaConnectedCredentialSchema.parse(
        decryptCredential<unknown>(connectedCredential.encryptedCredentialRef, options.credentialSecret),
      );
      const executableRows = approvedToolRows.filter((row) => row.execution_status !== "executed");
      if (executableRows.length === 0) {
        const { error } = await supabase
          .from("harwick_ai_turns")
          .update({ status: "auto_executed" })
          .eq("id", params.turnId);
        if (error !== null) {
          throw error;
        }
        return {
          status: "skipped",
          message: "Harwick AI reply skipped because the approved tool calls already executed",
        };
      }

      HarwickAiTurnSchema.parse(turnRow.turn);
      const metaClient = createMetaMessagingClient(
        options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl },
      );
      const sendMetaMessage = async (toolCall: {
        payload: Record<string, unknown>;
      }) => {
        const reply = readMetaToolReply(toolCall.payload);
        const target = readMetaToolTarget(toolCall.payload);
        const sendChannel = target === "comment"
          ? params.channel
          : target === "dm"
            ? metaDmChannelFor(params.channel)
            : params.channel.endsWith("_comment")
              ? params.channel
              : metaDmChannelFor(params.channel);

        if (reply === null) {
          throw new Error("Harwick AI reply payload is missing a reply body.");
        }

        if (sendChannel.endsWith("_comment") && params.sourceCommentId === null) {
          throw new Error("Harwick AI reply payload is missing a comment target.");
        }

        if (sendChannel.endsWith("_dm") && params.recipientUserId === null) {
          throw new Error("Harwick AI reply payload is missing a recipient.");
        }

        const occurredAt = new Date().toISOString();
        const providerEvent = sendChannel.endsWith("_comment")
          ? await metaClient.replyToComment({
              commentId: params.sourceCommentId ?? "",
              accessToken: metaCredential.pageAccessToken,
              reply,
            })
          : await metaClient.sendDirectMessage({
              pageId: metaCredential.pageId,
              recipientUserId: params.recipientUserId ?? "",
              accessToken: metaCredential.pageAccessToken,
              reply,
            });
        const { error } = await supabase
          .from("lead_events")
          .insert({
            workspace_id: params.workspaceId,
            lead_id: params.leadId,
            provider: "meta",
            event_type: "reply_sent",
            source_channel: sendChannel,
            provider_event_id: providerEvent.providerEventId,
            provider_account_id: params.providerAccountId,
            provider_user_id: params.recipientUserId,
            source_post_id: params.sourcePostId,
            source_comment_id: params.sourceCommentId,
            text: reply,
            occurred_at: occurredAt,
          });
        if (error !== null) {
          throw error;
        }

        if (params.leadId !== null) {
          const { error: msgError } = await supabase
            .from("conversation_messages")
            .insert({
              lead_id: params.leadId,
              workspace_id: params.workspaceId,
              sender_type: "ai",
              sender_id: "harwick_ai",
              body: reply,
              source_channel: sendChannel,
              provider_message_id: providerEvent.providerEventId,
              status: "sent",
              created_at: occurredAt,
              agent_trajectory_id: null,
              agent_step_id: null,
            });
          if (msgError !== null) {
            throw msgError;
          }
        }

        return {
          providerEventId: providerEvent.providerEventId,
          occurredAt,
          channel: sendChannel,
          handoffFromComment: params.channel.endsWith("_comment") && sendChannel.endsWith("_dm"),
          sourceCommentId: params.channel.endsWith("_comment") && sendChannel.endsWith("_dm")
            ? params.sourceCommentId
            : null,
        };
      };
      const results = await executeHarwickAiToolCalls({
        toolCalls: executableRows.map((row) => ({
          tool: row.tool,
          reason: row.reason,
          requiresApproval: row.requires_approval,
          payload: row.payload,
        })),
        handlers: {
          send_meta_message: sendMetaMessage,
          send_meta_reply: async (toolCall) => sendMetaMessage({
            ...toolCall,
            payload: {
              ...toolCall.payload,
              target: "comment",
            },
          }),
          send_meta_dm: async (toolCall) => sendMetaMessage({
            ...toolCall,
            payload: {
              ...toolCall.payload,
              target: "dm",
            },
          }),
        },
        approvedTools: automationDecision.approvedTools,
      });

      const executionStatusByToolId = new Map(
        approvedToolRows.map((row) => [row.id, row.execution_status] as const),
      );
      let firstExecutedProviderEventId: string | null = null;
      let firstFailure: { code: string; message: string } | null = null;

      for (const [index, result] of results.entries()) {
        const toolRow = executableRows[index];
        if (toolRow === undefined) {
          continue;
        }

        const nextExecutionStatus = result.status === "failed"
          ? "failed"
          : result.status === "missing_handler"
            ? "missing_handler"
            : result.status;
        executionStatusByToolId.set(toolRow.id, nextExecutionStatus);

        if (firstExecutedProviderEventId === null && typeof result.output["providerEventId"] === "string") {
          firstExecutedProviderEventId = result.output["providerEventId"];
        }
        if (
          firstFailure === null
          && (result.status === "failed" || result.status === "missing_handler")
        ) {
          firstFailure = {
            code: result.status === "missing_handler" ? "missing_handler" : (result.errorCode ?? "handler_execution_failed"),
            message: result.status === "missing_handler"
              ? `No handler is configured for ${result.tool}.`
              : (result.errorMessage ?? "Harwick AI tool execution failed."),
          };
        }

        const { error } = await supabase
          .from("harwick_ai_tool_calls")
          .update({
            execution_status: nextExecutionStatus,
            execution_output: result.output,
            error_code: result.status === "failed"
              ? (result.errorCode ?? "handler_execution_failed")
              : result.status === "missing_handler"
                ? "missing_handler"
                : null,
            error_message: result.status === "failed"
              ? (result.errorMessage ?? "Harwick AI tool execution failed.")
              : result.status === "missing_handler"
                ? `No handler is configured for ${result.tool}.`
                : null,
            executed_at: result.status === "executed" ? new Date().toISOString() : null,
          })
          .eq("id", toolRow.id);
        if (error !== null) {
          throw error;
        }
      }

      const hasExecutionFailure = [...executionStatusByToolId.values()].some((status) => {
        return status === "failed" || status === "missing_handler";
      });
      const allApprovedExecuted = approvedToolRows.every((row) => executionStatusByToolId.get(row.id) === "executed");
      const turnStatus = deriveHarwickAiTurnPersistenceStatus({
        automationDecision,
        isExecuted: allApprovedExecuted,
        hasExecutionFailure,
      });

      const { error: turnStatusError } = await supabase
        .from("harwick_ai_turns")
        .update({ status: turnStatus })
        .eq("id", params.turnId);
      if (turnStatusError !== null) {
        throw turnStatusError;
      }

      if (params.socialReplyReviewId !== null) {
        const { error: reviewError } = await supabase
          .from("social_reply_reviews")
          .update(allApprovedExecuted
            ? {
                status: "sent",
                suggested_reply: turnRow.reply,
                provider_event_id: firstExecutedProviderEventId,
                last_error_code: null,
                last_error_message: null,
                updated_at: now,
              }
            : hasExecutionFailure
              ? {
                  status: "failed",
                  suggested_reply: turnRow.reply,
                  last_error_code: firstFailure?.code ?? "harwick_ai_reply_failed",
                  last_error_message: firstFailure?.message ?? "Harwick AI reply execution failed.",
                  updated_at: now,
                }
              : {
                  updated_at: now,
                })
          .eq("id", params.socialReplyReviewId)
          .eq("workspace_id", params.workspaceId);
        if (reviewError !== null) {
          throw reviewError;
        }
      }

      if (hasExecutionFailure) {
        throw new Error(firstFailure?.message ?? "Harwick AI reply execution failed.");
      }

      return {
        status: "completed",
        message: `executed ${results.filter((result) => result.status === "executed").length} Harwick AI tool call(s)`,
      };
    },

    async syncLeadToFub(params) {
      const followUpBossApiKey = await resolveFollowUpBossApiKey(params.workspaceId);
      if (followUpBossApiKey === null) {
        return null;
      }

      const { data: lead, error } = await supabase
        .from("leads")
        .select("id,workspace_id,full_name,phone,email,source_channel,lead_type,intent,timeline,budget_min,budget_max,target_area,financing_status,score,status,assigned_agent_id")
        .eq("id", params.leadId)
        .maybeSingle();

      if (error !== null) {
        throw error;
      }
      if (lead === null) {
        return null;
      }
      if (!["qualified", "hot", "assigned"].includes(lead.status)) {
        return null;
      }

      const client = createFollowUpBossClient({
        apiKey: followUpBossApiKey,
        ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
      });
      const event: FollowUpBossLeadEventInput = {
        source: "Realty Ops",
        system: "Realty Ops",
        type: lead.source_channel === "call"
          ? "Incoming Call"
          : lead.lead_type === "seller"
            ? "Seller Inquiry"
            : lead.target_area !== null
              ? "Property Inquiry"
              : "General Inquiry",
        message: [
          `${lead.lead_type} lead from ${lead.source_channel}.`,
          lead.target_area === null ? "" : `Target area: ${lead.target_area}.`,
          lead.timeline === null ? "" : `Timeline: ${lead.timeline}.`,
          `Intent: ${lead.intent}. Score: ${lead.score}.`,
        ].filter((part) => part.length > 0).join(" "),
        person: {
          ...(lead.full_name === null ? {} : { name: lead.full_name }),
          ...(lead.email === null ? {} : { emails: [{ value: lead.email }] }),
          ...(lead.phone === null ? {} : { phones: [{ value: lead.phone }] }),
        },
      };
      const providerContactId = await client.sendLeadEvent(event);
      const lastOutboundAt = new Date().toISOString();
      const backsyncSuppressedUntil = providerContactId === null
        ? null
        : new Date(Date.now() + 2 * 60 * 1000).toISOString();

      if (providerContactId !== null) {
        const { error: leadUpdateError } = await supabase
          .from("leads")
          .update({
            follow_up_boss_contact_id: providerContactId,
            updated_at: lastOutboundAt,
          })
          .eq("id", params.leadId);

        if (leadUpdateError !== null) {
          throw leadUpdateError;
        }
      }

      const { error: syncError } = await supabase
        .from("crm_sync_logs")
        .update({
          status: "synced",
          provider_contact_id: providerContactId,
          last_outbound_at: lastOutboundAt,
          backsync_suppressed_until: backsyncSuppressedUntil,
          last_error_code: null,
          last_error_message: null,
          updated_at: lastOutboundAt,
        })
        .eq("workspace_id", params.workspaceId)
        .eq("lead_id", params.leadId)
        .eq("provider", "follow_up_boss");

      if (syncError !== null) {
        throw syncError;
      }

      return providerContactId;
    },

    async reconcileFubBacksyncEvent(params) {
      const { data: backsyncEvent, error: backsyncError } = await supabase
        .from("crm_backsync_events")
        .select("id,workspace_id,provider_event_id,event_type,resource_uri,event_created_at,status,payload")
        .eq("id", params.backsyncEventId)
        .eq("workspace_id", params.workspaceId)
        .maybeSingle();

      if (backsyncError !== null) {
        throw backsyncError;
      }
      if (backsyncEvent === null) {
        return;
      }
      if (backsyncEvent.status === "completed" || backsyncEvent.status === "ignored") {
        return;
      }

      const { error: processingError } = await supabase
        .from("crm_backsync_events")
        .update({
          status: "processing",
          last_error_code: null,
          last_error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", backsyncEvent.id);

      if (processingError !== null) {
        throw processingError;
      }

      try {
        const followUpBossApiKey = await resolveFollowUpBossApiKey(params.workspaceId);
        if (followUpBossApiKey === null) {
          throw new Error("Follow Up Boss API key is not configured for backsync reconciliation.");
        }

        const client = createFollowUpBossClient({
          apiKey: followUpBossApiKey,
          ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
        });
        const resourcePayload = backsyncEvent.resource_uri === null
          ? null
          : await client.fetchResource(backsyncEvent.resource_uri);
        let reconciledCount = 0;

        if (backsyncEvent.event_type === "peopleUpdated" || backsyncEvent.event_type === "peopleStageUpdated") {
          if (resourcePayload !== null) {
            const people = normalizeFollowUpBossPeopleResource(resourcePayload);
            const stageFromWebhook = (() => {
              const data = backsyncEvent.payload["data"];
              if (data && typeof data === "object" && !Array.isArray(data)) {
                const record = data as Record<string, unknown>;
                return typeof record["stage"] === "string" ? record["stage"] : null;
              }

              return null;
            })();

            for (const person of people) {
              const leadId = await findLeadIdByFollowUpBossContactId({
                workspaceId: params.workspaceId,
                providerContactId: person.personId,
              });
              if (leadId === null) {
                continue;
              }

              const nextStatus = mapFollowUpBossStageToLeadStatus(stageFromWebhook ?? person.stage);
              const { error: leadUpdateError } = await supabase
                .from("leads")
                .update({
                  ...(person.fullName === null ? {} : { full_name: person.fullName }),
                  ...(person.email === null ? {} : { email: person.email }),
                  ...(person.phone === null ? {} : { phone: person.phone }),
                  ...(nextStatus === null ? {} : { status: nextStatus }),
                  updated_at: new Date().toISOString(),
                })
                .eq("id", leadId);

              if (leadUpdateError !== null) {
                throw leadUpdateError;
              }

              reconciledCount += 1;
            }
          }
        } else if (resourcePayload !== null) {
          const activities = normalizeFollowUpBossActivityResource({
            eventType: backsyncEvent.event_type,
            payload: resourcePayload,
            fallbackOccurredAt: backsyncEvent.event_created_at,
          });
          const leadsToRequalify = new Set<string>();

          for (const activity of activities) {
            const leadId = await findLeadIdByFollowUpBossContactId({
              workspaceId: params.workspaceId,
              providerContactId: activity.personId,
            });
            if (leadId === null) {
              continue;
            }

            const { error: leadEventError } = await supabase
              .from("lead_events")
              .insert({
                workspace_id: params.workspaceId,
                lead_id: leadId,
                provider: "follow_up_boss",
                event_type: backsyncEvent.event_type,
                source_channel: backsyncEvent.event_type === "callsCreated"
                  ? "call"
                  : backsyncEvent.event_type === "textMessagesCreated"
                    ? "sms"
                    : "manual",
                provider_event_id: `${backsyncEvent.provider_event_id}:${activity.activityId}`,
                provider_account_id: null,
                provider_user_id: activity.providerUserId,
                source_post_id: null,
                source_comment_id: null,
                text: activity.text,
                occurred_at: activity.occurredAt ?? backsyncEvent.event_created_at,
              });

            if (leadEventError !== null) {
              throw leadEventError;
            }

            if (shouldRequalifyFromFollowUpBossBacksyncEvent(backsyncEvent.event_type)) {
              leadsToRequalify.add(leadId);
            }

            reconciledCount += 1;
          }

          for (const leadId of leadsToRequalify) {
            const { error: qualificationJobError } = await supabase
              .from("workflow_jobs")
              .upsert({
                workspace_id: params.workspaceId,
                lead_id: leadId,
                lead_event_id: null,
                job_type: "lead_qualification",
                payload: {
                  jobType: "lead_qualification",
                  workspaceId: params.workspaceId,
                  leadId,
                  reason: "crm_backsync_activity",
                },
                idempotency_key: `lead_qualification:fub_backsync:${backsyncEvent.id}:${leadId}`,
              }, {
                onConflict: "workspace_id,idempotency_key",
                ignoreDuplicates: true,
              });

            if (qualificationJobError !== null) {
              throw qualificationJobError;
            }
          }
        }

        const { error: completeError } = await supabase
          .from("crm_backsync_events")
          .update({
            status: reconciledCount > 0 ? "completed" : "ignored",
            processed_at: new Date().toISOString(),
            last_error_code: null,
            last_error_message: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", backsyncEvent.id);

        if (completeError !== null) {
          throw completeError;
        }
      } catch (error: unknown) {
        const { error: failError } = await supabase
          .from("crm_backsync_events")
          .update({
            status: "failed",
            last_error_code: "fub_backsync_reconcile_failed",
            last_error_message: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000),
            updated_at: new Date().toISOString(),
          })
          .eq("id", backsyncEvent.id);

        if (failError !== null) {
          throw failError;
        }

        throw error;
      }
    },
  };
}
