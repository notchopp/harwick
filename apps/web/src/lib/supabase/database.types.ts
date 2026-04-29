import type { LeadEventInsertRow } from "./lead-events";
import type { LeadInsertRow, LeadRow, LeadUpdateRow } from "./leads";
import type { ListingFactRow } from "./listings";
import type { MetaAccountFoundationInsertRow, MetaAccountFoundationRow } from "./meta-foundations";
import type { SocialPostInsertRow, SocialPostRow } from "./social-posts";
import type { VoiceLeadHandoffInsertRow, VoiceLeadHandoffRow } from "./voice-handoffs";
import type { WorkflowJobInsertRow, WorkflowJobRow } from "./workflow-jobs";

export type WorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
};

export type WorkspaceMemberRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  role: "owner" | "admin" | "lead_manager" | "agent";
  display_name: string;
  email: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type IntegrationAccountRow = {
  id: string;
  workspace_id: string;
  account_scope: "workspace" | "member";
  owner_member_id: string | null;
  provider: "meta" | "twilio" | "retell" | "follow_up_boss" | "repliers";
  status: "pending" | "connected" | "needs_reauth" | "disabled" | "error";
  provider_account_id: string | null;
  provider_account_ids: string[];
  provider_account_name: string | null;
  encrypted_credential_ref: string | null;
  oauth_state: string | null;
  connected_at: string | null;
  last_health_check_at: string | null;
  created_at: string;
  updated_at: string;
};

export type IntegrationAccountInsertRow = Omit<
  IntegrationAccountRow,
  "id" | "created_at" | "updated_at" | "account_scope" | "owner_member_id"
> & {
  id?: string;
  account_scope?: IntegrationAccountRow["account_scope"];
  owner_member_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type FollowUpBossWebhookSubscriptionRow = {
  id: string;
  workspace_id: string;
  integration_account_id: string;
  event_type: "peopleUpdated" | "peopleStageUpdated" | "notesCreated" | "tasksCreated" | "textMessagesCreated" | "callsCreated";
  status: "pending" | "active" | "error" | "disabled";
  provider_webhook_id: string | null;
  callback_token: string;
  system_name: string;
  encrypted_system_key_ref: string;
  last_registered_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type FollowUpBossWebhookSubscriptionInsertRow = {
  workspace_id: string;
  integration_account_id: string;
  event_type: FollowUpBossWebhookSubscriptionRow["event_type"];
  status?: FollowUpBossWebhookSubscriptionRow["status"];
  provider_webhook_id?: string | null;
  callback_token: string;
  system_name: string;
  encrypted_system_key_ref: string;
  last_registered_at?: string | null;
  last_error_code?: string | null;
  last_error_message?: string | null;
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type CrmBacksyncEventRow = {
  id: string;
  workspace_id: string;
  provider: "follow_up_boss";
  subscription_id: string;
  provider_event_id: string;
  event_type: FollowUpBossWebhookSubscriptionRow["event_type"];
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

export type CrmBacksyncEventInsertRow = {
  workspace_id: string;
  provider: "follow_up_boss";
  subscription_id: string;
  provider_event_id: string;
  event_type: CrmBacksyncEventRow["event_type"];
  resource_ids?: number[];
  resource_uri?: string | null;
  event_created_at: string;
  payload?: Record<string, unknown>;
  status?: CrmBacksyncEventRow["status"];
  correlated_sync_log_id?: string | null;
  processed_at?: string | null;
  last_error_code?: string | null;
  last_error_message?: string | null;
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type MetaAccountFoundationRecentPostJson = {
  source_post_id: string;
  caption: string | null;
  permalink: string | null;
  media_type: string | null;
  published_at: string | null;
};

export type WorkspaceVoiceAgentRow = {
  id: string;
  workspace_id: string;
  account_scope: "workspace" | "member";
  owner_member_id: string | null;
  provider: "retell";
  status: "draft" | "provisioning" | "active" | "needs_sync" | "error" | "disabled";
  retell_agent_id: string | null;
  retell_conversation_flow_id: string | null;
  retell_phone_number_id: string | null;
  phone_number: string | null;
  service_areas: string[];
  transfer_number: string | null;
  template_version: string;
  published_config_hash: string | null;
  webhook_url: string | null;
  dynamic_variables_webhook_url: string | null;
  last_synced_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkspaceVoiceAgentInsertRow = {
  workspace_id: string;
  account_scope?: WorkspaceVoiceAgentRow["account_scope"];
  owner_member_id?: string | null;
  provider: "retell";
  status?: WorkspaceVoiceAgentRow["status"];
  retell_agent_id?: string | null;
  retell_conversation_flow_id?: string | null;
  retell_phone_number_id?: string | null;
  phone_number?: string | null;
  service_areas?: string[];
  transfer_number?: string | null;
  template_version?: string;
  published_config_hash?: string | null;
  webhook_url?: string | null;
  dynamic_variables_webhook_url?: string | null;
  last_synced_at?: string | null;
  last_error_code?: string | null;
  last_error_message?: string | null;
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type LeadTaskRow = {
  id: string;
  workspace_id: string;
  lead_id: string;
  task_type: "call_back" | "verify_listing" | "assign_lead" | "fub_retry" | "nurture_review";
  status: "open" | "in_progress" | "completed" | "dismissed";
  priority: "low" | "normal" | "high" | "urgent";
  title: string;
  description: string | null;
  due_at: string | null;
  assigned_member_id: string | null;
  created_at: string;
  updated_at: string;
};

export type LeadTaskInsertRow = {
  workspace_id: string;
  lead_id: string;
  task_type: LeadTaskRow["task_type"];
  status?: LeadTaskRow["status"];
  priority?: LeadTaskRow["priority"];
  title: string;
  description?: string | null;
  due_at?: string | null;
  assigned_member_id?: string | null;
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type LeadEventRow = LeadEventInsertRow & {
  id: string;
  created_at: string;
};

export type RealtyOpsDatabase = {
  public: {
    Tables: {
      workspaces: {
        Row: WorkspaceRow;
        Insert: Omit<WorkspaceRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<WorkspaceRow>;
        Relationships: [];
      };
      workspace_members: {
        Row: WorkspaceMemberRow;
        Insert: Omit<WorkspaceMemberRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<WorkspaceMemberRow>;
        Relationships: [];
      };
      integration_accounts: {
        Row: IntegrationAccountRow;
        Insert: IntegrationAccountInsertRow;
        Update: Partial<IntegrationAccountRow>;
        Relationships: [];
      };
      workspace_voice_agents: {
        Row: WorkspaceVoiceAgentRow;
        Insert: WorkspaceVoiceAgentInsertRow;
        Update: Partial<WorkspaceVoiceAgentRow>;
        Relationships: [];
      };
      leads: {
        Row: LeadRow;
        Insert: LeadInsertRow;
        Update: LeadUpdateRow;
        Relationships: [];
      };
      lead_tasks: {
        Row: LeadTaskRow;
        Insert: LeadTaskInsertRow;
        Update: Partial<LeadTaskRow>;
        Relationships: [];
      };
      lead_events: {
        Row: LeadEventRow;
        Insert: LeadEventInsertRow;
        Update: Partial<LeadEventRow>;
        Relationships: [];
      };
      voice_lead_handoffs: {
        Row: VoiceLeadHandoffRow;
        Insert: VoiceLeadHandoffInsertRow;
        Update: Partial<VoiceLeadHandoffRow>;
        Relationships: [];
      };
      workflow_jobs: {
        Row: WorkflowJobRow;
        Insert: WorkflowJobInsertRow;
        Update: Partial<WorkflowJobRow>;
        Relationships: [];
      };
      listing_facts: {
        Row: ListingFactRow;
        Insert: Omit<ListingFactRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<ListingFactRow>;
        Relationships: [];
      };
      social_posts: {
        Row: SocialPostRow;
        Insert: SocialPostInsertRow;
        Update: Partial<SocialPostRow>;
        Relationships: [];
      };
      meta_account_foundations: {
        Row: MetaAccountFoundationRow;
        Insert: MetaAccountFoundationInsertRow;
        Update: Partial<MetaAccountFoundationRow>;
        Relationships: [];
      };
      follow_up_boss_webhook_subscriptions: {
        Row: FollowUpBossWebhookSubscriptionRow;
        Insert: FollowUpBossWebhookSubscriptionInsertRow;
        Update: Partial<FollowUpBossWebhookSubscriptionRow>;
        Relationships: [];
      };
      crm_backsync_events: {
        Row: CrmBacksyncEventRow;
        Insert: CrmBacksyncEventInsertRow;
        Update: Partial<CrmBacksyncEventRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
