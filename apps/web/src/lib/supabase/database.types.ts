export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_type: string
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json
          resource_id: string | null
          resource_type: string
          user_agent: string | null
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          action: string
          actor_type: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          resource_id?: string | null
          resource_type: string
          user_agent?: string | null
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          action?: string
          actor_type?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          resource_id?: string | null
          resource_type?: string
          user_agent?: string | null
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_routing_settings: {
        Row: {
          auto_assign_enabled: boolean
          auto_reply_enabled: boolean
          created_at: string
          id: string
          max_active_leads: number
          max_budget: number | null
          member_id: string
          min_budget: number | null
          specializations: string[]
          territories: string[]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          auto_assign_enabled?: boolean
          auto_reply_enabled?: boolean
          created_at?: string
          id?: string
          max_active_leads?: number
          max_budget?: number | null
          member_id: string
          min_budget?: number | null
          specializations?: string[]
          territories?: string[]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          auto_assign_enabled?: boolean
          auto_reply_enabled?: boolean
          created_at?: string
          id?: string
          max_active_leads?: number
          max_budget?: number | null
          member_id?: string
          min_budget?: number | null
          specializations?: string[]
          territories?: string[]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_routing_settings_fk_member"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "workspace_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_routing_settings_fk_workspace"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_trajectories: {
        Row: {
          channel: string | null
          completed_at: string | null
          completion_reason: string | null
          created_at: string
          final_lead_status: string | null
          id: string
          lead_id: string | null
          outcome_label: string | null
          started_at: string
          step_count: number
          summary_embedding: number[] | null
          summary_text: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          channel?: string | null
          completed_at?: string | null
          completion_reason?: string | null
          created_at?: string
          final_lead_status?: string | null
          id?: string
          lead_id?: string | null
          outcome_label?: string | null
          started_at?: string
          step_count?: number
          summary_embedding?: number[] | null
          summary_text?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          channel?: string | null
          completed_at?: string | null
          completion_reason?: string | null
          created_at?: string
          final_lead_status?: string | null
          id?: string
          lead_id?: string | null
          outcome_label?: string | null
          started_at?: string
          step_count?: number
          summary_embedding?: number[] | null
          summary_text?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_trajectories_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_trajectories_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_steps: {
        Row: {
          created_at: string
          deterministic_gate_auto_execute: boolean | null
          exit_reason: string | null
          gates_agreed: boolean | null
          harwick_ai_turn_id: string | null
          id: string
          input_embedding: number[] | null
          input_snapshot: Json
          iteration: number
          lead_id: string | null
          self_gate_auto_execute: boolean | null
          self_gate_reason: string | null
          tool_executions: Json
          trajectory_id: string
          turn_output: Json
          workspace_id: string
        }
        Insert: {
          created_at?: string
          deterministic_gate_auto_execute?: boolean | null
          exit_reason?: string | null
          gates_agreed?: boolean | null
          harwick_ai_turn_id?: string | null
          id?: string
          input_embedding?: number[] | null
          input_snapshot: Json
          iteration: number
          lead_id?: string | null
          self_gate_auto_execute?: boolean | null
          self_gate_reason?: string | null
          tool_executions?: Json
          trajectory_id: string
          turn_output: Json
          workspace_id: string
        }
        Update: {
          created_at?: string
          deterministic_gate_auto_execute?: boolean | null
          exit_reason?: string | null
          gates_agreed?: boolean | null
          harwick_ai_turn_id?: string | null
          id?: string
          input_embedding?: number[] | null
          input_snapshot?: Json
          iteration?: number
          lead_id?: string | null
          self_gate_auto_execute?: boolean | null
          self_gate_reason?: string | null
          tool_executions?: Json
          trajectory_id?: string
          turn_output?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_steps_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_steps_trajectory_id_fkey"
            columns: ["trajectory_id"]
            isOneToOne: false
            referencedRelation: "agent_trajectories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_steps_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_outcomes: {
        Row: {
          attributed_to_step_id: string | null
          id: string
          recorded_at: string
          signal_type: string
          signal_value: Json
          trajectory_id: string
          workspace_id: string
        }
        Insert: {
          attributed_to_step_id?: string | null
          id?: string
          recorded_at?: string
          signal_type: string
          signal_value?: Json
          trajectory_id: string
          workspace_id: string
        }
        Update: {
          attributed_to_step_id?: string | null
          id?: string
          recorded_at?: string
          signal_type?: string
          signal_value?: Json
          trajectory_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_outcomes_attributed_to_step_id_fkey"
            columns: ["attributed_to_step_id"]
            isOneToOne: false
            referencedRelation: "agent_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_outcomes_trajectory_id_fkey"
            columns: ["trajectory_id"]
            isOneToOne: false
            referencedRelation: "agent_trajectories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_outcomes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_webhook_events: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          processed_at: string | null
          processing_status: string
          provider: string
          provider_event_id: string
          provider_object_id: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          processed_at?: string | null
          processing_status: string
          provider: string
          provider_event_id: string
          provider_object_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          processed_at?: string | null
          processing_status?: string
          provider?: string
          provider_event_id?: string
          provider_object_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_webhook_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_activity_log: {
        Row: {
          actor_id: string | null
          actor_type: string
          conversation_id: string
          created_at: string
          data: Json | null
          event_type: string
          id: string
        }
        Insert: {
          actor_id?: string | null
          actor_type: string
          conversation_id: string
          created_at?: string
          data?: Json | null
          event_type: string
          id?: string
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          conversation_id?: string
          created_at?: string
          data?: Json | null
          event_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_activity_log_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_automation_states: {
        Row: {
          automation_mode: string
          automation_reason: string | null
          changed_at: string | null
          changed_by_member_id: string | null
          channel: string
          created_at: string
          id: string
          lead_id: string | null
          provider_account_id: string
          recipient_user_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          automation_mode?: string
          automation_reason?: string | null
          changed_at?: string | null
          changed_by_member_id?: string | null
          channel: string
          created_at?: string
          id?: string
          lead_id?: string | null
          provider_account_id: string
          recipient_user_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          automation_mode?: string
          automation_reason?: string | null
          changed_at?: string | null
          changed_by_member_id?: string | null
          channel?: string
          created_at?: string
          id?: string
          lead_id?: string | null
          provider_account_id?: string
          recipient_user_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_automation_states_changed_by_member_id_fkey"
            columns: ["changed_by_member_id"]
            isOneToOne: false
            referencedRelation: "workspace_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_automation_states_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_automation_states_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          automation_changed_at: string | null
          automation_changed_by_member_id: string | null
          automation_mode: string
          automation_reason: string | null
          channel: string
          created_at: string
          dismissal_reason: string | null
          id: string
          lead_id: string
          provider_account_id: string | null
          recipient_user_id: string | null
          source_comment_id: string | null
          source_post_id: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          automation_changed_at?: string | null
          automation_changed_by_member_id?: string | null
          automation_mode?: string
          automation_reason?: string | null
          channel: string
          created_at?: string
          dismissal_reason?: string | null
          id?: string
          lead_id: string
          provider_account_id?: string | null
          recipient_user_id?: string | null
          source_comment_id?: string | null
          source_post_id?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          automation_changed_at?: string | null
          automation_changed_by_member_id?: string | null
          automation_mode?: string
          automation_reason?: string | null
          channel?: string
          created_at?: string
          dismissal_reason?: string | null
          id?: string
          lead_id?: string
          provider_account_id?: string | null
          recipient_user_id?: string | null
          source_comment_id?: string | null
          source_post_id?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_automation_changed_by_member_id_fkey"
            columns: ["automation_changed_by_member_id"]
            isOneToOne: false
            referencedRelation: "workspace_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_messages: {
        Row: {
          agent_step_id: string | null
          agent_trajectory_id: string | null
          body: string
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          lead_id: string
          provider_message_id: string | null
          sender_id: string | null
          sender_type: string
          source_channel: string | null
          status: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          agent_step_id?: string | null
          agent_trajectory_id?: string | null
          body: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          lead_id: string
          provider_message_id?: string | null
          sender_id?: string | null
          sender_type: string
          source_channel?: string | null
          status?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          agent_step_id?: string | null
          agent_trajectory_id?: string | null
          body?: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          lead_id?: string
          provider_message_id?: string | null
          sender_id?: string | null
          sender_type?: string
          source_channel?: string | null
          status?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_agent_step_id_fkey"
            columns: ["agent_step_id"]
            isOneToOne: false
            referencedRelation: "agent_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_messages_agent_trajectory_id_fkey"
            columns: ["agent_trajectory_id"]
            isOneToOne: false
            referencedRelation: "agent_trajectories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_lead"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_workspace"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_backsync_events: {
        Row: {
          correlated_sync_log_id: string | null
          created_at: string
          event_created_at: string
          event_type: string
          id: string
          last_error_code: string | null
          last_error_message: string | null
          payload: Json
          processed_at: string | null
          provider: string
          provider_event_id: string
          resource_ids: number[]
          resource_uri: string | null
          status: string
          subscription_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          correlated_sync_log_id?: string | null
          created_at?: string
          event_created_at: string
          event_type: string
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          payload?: Json
          processed_at?: string | null
          provider: string
          provider_event_id: string
          resource_ids?: number[]
          resource_uri?: string | null
          status?: string
          subscription_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          correlated_sync_log_id?: string | null
          created_at?: string
          event_created_at?: string
          event_type?: string
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          payload?: Json
          processed_at?: string | null
          provider?: string
          provider_event_id?: string
          resource_ids?: number[]
          resource_uri?: string | null
          status?: string
          subscription_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_backsync_events_correlated_sync_log_id_fkey"
            columns: ["correlated_sync_log_id"]
            isOneToOne: false
            referencedRelation: "crm_sync_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_backsync_events_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "follow_up_boss_webhook_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_backsync_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_sync_logs: {
        Row: {
          attempt_count: number
          backsync_suppressed_until: string | null
          created_at: string
          id: string
          last_error_code: string | null
          last_error_message: string | null
          last_outbound_at: string | null
          lead_id: string
          next_retry_at: string | null
          provider: string
          provider_contact_id: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attempt_count?: number
          backsync_suppressed_until?: string | null
          created_at?: string
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          last_outbound_at?: string | null
          lead_id: string
          next_retry_at?: string | null
          provider: string
          provider_contact_id?: string | null
          status: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attempt_count?: number
          backsync_suppressed_until?: string | null
          created_at?: string
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          last_outbound_at?: string | null
          lead_id?: string
          next_retry_at?: string | null
          provider?: string
          provider_contact_id?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_sync_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_sync_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_up_boss_webhook_subscriptions: {
        Row: {
          callback_token: string
          created_at: string
          encrypted_system_key_ref: string
          event_type: string
          id: string
          integration_account_id: string
          last_error_code: string | null
          last_error_message: string | null
          last_registered_at: string | null
          provider_webhook_id: string | null
          status: string
          system_name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          callback_token: string
          created_at?: string
          encrypted_system_key_ref: string
          event_type: string
          id?: string
          integration_account_id: string
          last_error_code?: string | null
          last_error_message?: string | null
          last_registered_at?: string | null
          provider_webhook_id?: string | null
          status?: string
          system_name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          callback_token?: string
          created_at?: string
          encrypted_system_key_ref?: string
          event_type?: string
          id?: string
          integration_account_id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          last_registered_at?: string | null
          provider_webhook_id?: string | null
          status?: string
          system_name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_up_boss_webhook_subscription_integration_account_id_fkey"
            columns: ["integration_account_id"]
            isOneToOne: false
            referencedRelation: "integration_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_boss_webhook_subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      harwick_ai_automation_policies: {
        Row: {
          allowed_auto_actions: string[]
          allowed_auto_tools: string[]
          auto_send_enabled: boolean
          automation_mode: string
          blocked_safety_flags: string[]
          confidence_threshold: number
          created_at: string
          id: string
          lead_id: string | null
          member_id: string | null
          requires_approval_actions: string[]
          requires_approval_tools: string[]
          scope: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          allowed_auto_actions?: string[]
          allowed_auto_tools?: string[]
          auto_send_enabled?: boolean
          automation_mode?: string
          blocked_safety_flags?: string[]
          confidence_threshold?: number
          created_at?: string
          id?: string
          lead_id?: string | null
          member_id?: string | null
          requires_approval_actions?: string[]
          requires_approval_tools?: string[]
          scope?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          allowed_auto_actions?: string[]
          allowed_auto_tools?: string[]
          auto_send_enabled?: boolean
          automation_mode?: string
          blocked_safety_flags?: string[]
          confidence_threshold?: number
          created_at?: string
          id?: string
          lead_id?: string | null
          member_id?: string | null
          requires_approval_actions?: string[]
          requires_approval_tools?: string[]
          scope?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "harwick_ai_automation_policies_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harwick_ai_automation_policies_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "workspace_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harwick_ai_automation_policies_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      harwick_ai_tool_calls: {
        Row: {
          created_at: string
          error_code: string | null
          error_message: string | null
          executed_at: string | null
          execution_output: Json
          execution_status: string
          id: string
          lead_id: string | null
          payload: Json
          policy_status: string
          reason: string
          requires_approval: boolean
          tool: string
          turn_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          executed_at?: string | null
          execution_output?: Json
          execution_status?: string
          id?: string
          lead_id?: string | null
          payload?: Json
          policy_status?: string
          reason: string
          requires_approval?: boolean
          tool: string
          turn_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          executed_at?: string | null
          execution_output?: Json
          execution_status?: string
          id?: string
          lead_id?: string | null
          payload?: Json
          policy_status?: string
          reason?: string
          requires_approval?: boolean
          tool?: string
          turn_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "harwick_ai_tool_calls_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harwick_ai_tool_calls_turn_id_fkey"
            columns: ["turn_id"]
            isOneToOne: false
            referencedRelation: "harwick_ai_turns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harwick_ai_tool_calls_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      harwick_ai_turns: {
        Row: {
          automation_decision: Json
          automation_policy: Json
          channel: string
          confidence: number
          created_at: string
          handoff_brief: string | null
          id: string
          lead_id: string | null
          missing_fields: string[]
          next_action: string
          provider_thread_id: string | null
          reply: string
          runtime_input: Json
          safety_flags: string[]
          social_reply_review_id: string | null
          state_patch: Json
          status: string
          turn: Json
          workspace_id: string
        }
        Insert: {
          automation_decision?: Json
          automation_policy?: Json
          channel: string
          confidence?: number
          created_at?: string
          handoff_brief?: string | null
          id?: string
          lead_id?: string | null
          missing_fields?: string[]
          next_action: string
          provider_thread_id?: string | null
          reply: string
          runtime_input?: Json
          safety_flags?: string[]
          social_reply_review_id?: string | null
          state_patch?: Json
          status?: string
          turn: Json
          workspace_id: string
        }
        Update: {
          automation_decision?: Json
          automation_policy?: Json
          channel?: string
          confidence?: number
          created_at?: string
          handoff_brief?: string | null
          id?: string
          lead_id?: string | null
          missing_fields?: string[]
          next_action?: string
          provider_thread_id?: string | null
          reply?: string
          runtime_input?: Json
          safety_flags?: string[]
          social_reply_review_id?: string | null
          state_patch?: Json
          status?: string
          turn?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "harwick_ai_turns_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harwick_ai_turns_social_reply_review_id_fkey"
            columns: ["social_reply_review_id"]
            isOneToOne: false
            referencedRelation: "social_reply_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harwick_ai_turns_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      harwick_routing_decisions: {
        Row: {
          confidence: number | null
          created_at: string
          created_by_actor_type: string
          decided_at: string | null
          decided_by_member_id: string | null
          evidence: Json
          final_member_id: string | null
          id: string
          lead_id: string
          override_reason: string | null
          reason: string
          status: string
          step_id: string | null
          suggested_member_id: string | null
          trajectory_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          created_by_actor_type: string
          decided_at?: string | null
          decided_by_member_id?: string | null
          evidence?: Json
          final_member_id?: string | null
          id?: string
          lead_id: string
          override_reason?: string | null
          reason: string
          status?: string
          step_id?: string | null
          suggested_member_id?: string | null
          trajectory_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          created_by_actor_type?: string
          decided_at?: string | null
          decided_by_member_id?: string | null
          evidence?: Json
          final_member_id?: string | null
          id?: string
          lead_id?: string
          override_reason?: string | null
          reason?: string
          status?: string
          step_id?: string | null
          suggested_member_id?: string | null
          trajectory_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "harwick_routing_decisions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harwick_routing_decisions_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "agent_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harwick_routing_decisions_trajectory_id_fkey"
            columns: ["trajectory_id"]
            isOneToOne: false
            referencedRelation: "agent_trajectories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harwick_routing_decisions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      harwick_work_items: {
        Row: {
          completed_at: string | null
          created_at: string
          due_at: string | null
          id: string
          item_type: string
          lead_id: string | null
          payload: Json
          priority: string
          reason: string
          recommended_action: string
          routing_decision_id: string | null
          seen_at: string | null
          status: string
          step_id: string | null
          summary: string
          surfaced_at: string | null
          target_member_id: string | null
          target_role: string | null
          title: string
          trajectory_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          item_type: string
          lead_id?: string | null
          payload?: Json
          priority?: string
          reason: string
          recommended_action: string
          routing_decision_id?: string | null
          seen_at?: string | null
          status?: string
          step_id?: string | null
          summary: string
          surfaced_at?: string | null
          target_member_id?: string | null
          target_role?: string | null
          title: string
          trajectory_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          item_type?: string
          lead_id?: string | null
          payload?: Json
          priority?: string
          reason?: string
          recommended_action?: string
          routing_decision_id?: string | null
          seen_at?: string | null
          status?: string
          step_id?: string | null
          summary?: string
          surfaced_at?: string | null
          target_member_id?: string | null
          target_role?: string | null
          title?: string
          trajectory_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "harwick_work_items_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harwick_work_items_routing_decision_id_fkey"
            columns: ["routing_decision_id"]
            isOneToOne: false
            referencedRelation: "harwick_routing_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harwick_work_items_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "agent_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harwick_work_items_trajectory_id_fkey"
            columns: ["trajectory_id"]
            isOneToOne: false
            referencedRelation: "agent_trajectories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harwick_work_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      harwick_loops: {
        Row: {
          approval_mode: string
          created_at: string
          created_by_member_id: string | null
          event_type: string | null
          id: string
          instruction: string
          last_run_at: string | null
          last_run_status: string | null
          name: string
          next_run_at: string | null
          output_mode: string
          owner_member_id: string | null
          schedule_spec: string | null
          status: string
          tool_allowlist: string[]
          trigger_type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          approval_mode?: string
          created_at?: string
          created_by_member_id?: string | null
          event_type?: string | null
          id?: string
          instruction: string
          last_run_at?: string | null
          last_run_status?: string | null
          name: string
          next_run_at?: string | null
          output_mode?: string
          owner_member_id?: string | null
          schedule_spec?: string | null
          status?: string
          tool_allowlist?: string[]
          trigger_type?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          approval_mode?: string
          created_at?: string
          created_by_member_id?: string | null
          event_type?: string | null
          id?: string
          instruction?: string
          last_run_at?: string | null
          last_run_status?: string | null
          name?: string
          next_run_at?: string | null
          output_mode?: string
          owner_member_id?: string | null
          schedule_spec?: string | null
          status?: string
          tool_allowlist?: string[]
          trigger_type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "harwick_loops_created_by_member_id_fkey"
            columns: ["created_by_member_id"]
            isOneToOne: false
            referencedRelation: "workspace_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harwick_loops_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      harwick_loop_runs: {
        Row: {
          completed_at: string | null
          error_message: string | null
          id: string
          instruction_snapshot: string
          loop_id: string
          metadata: Json
          result_summary: string | null
          started_at: string
          status: string
          work_item_id: string | null
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          instruction_snapshot: string
          loop_id: string
          metadata?: Json
          result_summary?: string | null
          started_at?: string
          status: string
          work_item_id?: string | null
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          instruction_snapshot?: string
          loop_id?: string
          metadata?: Json
          result_summary?: string | null
          started_at?: string
          status?: string
          work_item_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "harwick_loop_runs_loop_id_fkey"
            columns: ["loop_id"]
            isOneToOne: false
            referencedRelation: "harwick_loops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harwick_loop_runs_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "harwick_work_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harwick_loop_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      harwick_chat_threads: {
        Row: {
          id: string
          workspace_id: string
          created_by_member_id: string | null
          title: string
          created_at: string
          updated_at: string
          last_message_at: string | null
          archived_at: string | null
        }
        Insert: {
          id?: string
          workspace_id: string
          created_by_member_id?: string | null
          title?: string
          created_at?: string
          updated_at?: string
          last_message_at?: string | null
          archived_at?: string | null
        }
        Update: {
          id?: string
          workspace_id?: string
          created_by_member_id?: string | null
          title?: string
          created_at?: string
          updated_at?: string
          last_message_at?: string | null
          archived_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "harwick_chat_threads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      harwick_channels: {
        Row: {
          id: string
          workspace_id: string
          kind: string
          name: string
          description: string | null
          created_by_member_id: string | null
          created_by_kind: string
          created_at: string
          updated_at: string
          last_message_at: string | null
          archived_at: string | null
        }
        Insert: {
          id?: string
          workspace_id: string
          kind: string
          name: string
          description?: string | null
          created_by_member_id?: string | null
          created_by_kind?: string
          created_at?: string
          updated_at?: string
          last_message_at?: string | null
          archived_at?: string | null
        }
        Update: {
          id?: string
          workspace_id?: string
          kind?: string
          name?: string
          description?: string | null
          created_by_member_id?: string | null
          created_by_kind?: string
          created_at?: string
          updated_at?: string
          last_message_at?: string | null
          archived_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "harwick_channels_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      harwick_channel_members: {
        Row: {
          channel_id: string
          member_id: string
          workspace_id: string
          joined_at: string
          last_read_at: string | null
          notification_pref: string
        }
        Insert: {
          channel_id: string
          member_id: string
          workspace_id: string
          joined_at?: string
          last_read_at?: string | null
          notification_pref?: string
        }
        Update: {
          channel_id?: string
          member_id?: string
          workspace_id?: string
          joined_at?: string
          last_read_at?: string | null
          notification_pref?: string
        }
        Relationships: [
          {
            foreignKeyName: "harwick_channel_members_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "harwick_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harwick_channel_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "workspace_members"
            referencedColumns: ["id"]
          },
        ]
      }
      harwick_channel_messages: {
        Row: {
          id: string
          channel_id: string
          workspace_id: string
          author_kind: string
          author_member_id: string | null
          body: string
          metadata: Json
          mentions_harwick: boolean
          created_at: string
          edited_at: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          channel_id: string
          workspace_id: string
          author_kind: string
          author_member_id?: string | null
          body: string
          metadata?: Json
          mentions_harwick?: boolean
          created_at?: string
          edited_at?: string | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          channel_id?: string
          workspace_id?: string
          author_kind?: string
          author_member_id?: string | null
          body?: string
          metadata?: Json
          mentions_harwick?: boolean
          created_at?: string
          edited_at?: string | null
          deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "harwick_channel_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "harwick_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      harwick_subagent_tasks: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          instructions: string
          lead_id: string | null
          payload: Json
          priority: string
          result: Json | null
          status: string
          step_id: string | null
          subagent_type: string
          title: string
          trajectory_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          instructions: string
          lead_id?: string | null
          payload?: Json
          priority?: string
          result?: Json | null
          status?: string
          step_id?: string | null
          subagent_type: string
          title: string
          trajectory_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          instructions?: string
          lead_id?: string | null
          payload?: Json
          priority?: string
          result?: Json | null
          status?: string
          step_id?: string | null
          subagent_type?: string
          title?: string
          trajectory_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "harwick_subagent_tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harwick_subagent_tasks_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "agent_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harwick_subagent_tasks_trajectory_id_fkey"
            columns: ["trajectory_id"]
            isOneToOne: false
            referencedRelation: "agent_trajectories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harwick_subagent_tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_accounts: {
        Row: {
          account_scope: string
          connected_at: string | null
          created_at: string
          encrypted_credential_ref: string | null
          id: string
          last_health_check_at: string | null
          oauth_state: string | null
          owner_member_id: string | null
          provider: string
          provider_account_id: string | null
          provider_account_ids: string[]
          provider_account_name: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          account_scope?: string
          connected_at?: string | null
          created_at?: string
          encrypted_credential_ref?: string | null
          id?: string
          last_health_check_at?: string | null
          oauth_state?: string | null
          owner_member_id?: string | null
          provider: string
          provider_account_id?: string | null
          provider_account_ids?: string[]
          provider_account_name?: string | null
          status: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          account_scope?: string
          connected_at?: string | null
          created_at?: string
          encrypted_credential_ref?: string | null
          id?: string
          last_health_check_at?: string | null
          oauth_state?: string | null
          owner_member_id?: string | null
          provider?: string
          provider_account_id?: string | null
          provider_account_ids?: string[]
          provider_account_name?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_accounts_owner_member_id_fkey"
            columns: ["owner_member_id"]
            isOneToOne: false
            referencedRelation: "workspace_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          lead_classification: string | null
          lead_classification_confidence: number | null
          lead_classification_hint: string | null
          lead_classification_reason: string | null
          lead_id: string | null
          occurred_at: string
          provider: string
          provider_account_id: string | null
          provider_event_id: string
          provider_user_id: string | null
          source_channel: string
          source_comment_id: string | null
          source_post_id: string | null
          text: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          lead_classification?: string | null
          lead_classification_confidence?: number | null
          lead_classification_hint?: string | null
          lead_classification_reason?: string | null
          lead_id?: string | null
          occurred_at: string
          provider: string
          provider_account_id?: string | null
          provider_event_id: string
          provider_user_id?: string | null
          source_channel: string
          source_comment_id?: string | null
          source_post_id?: string | null
          text?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          lead_classification?: string | null
          lead_classification_confidence?: number | null
          lead_classification_hint?: string | null
          lead_classification_reason?: string | null
          lead_id?: string | null
          occurred_at?: string
          provider?: string
          provider_account_id?: string | null
          provider_event_id?: string
          provider_user_id?: string | null
          source_channel?: string
          source_comment_id?: string | null
          source_post_id?: string | null
          text?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_tasks: {
        Row: {
          assigned_member_id: string | null
          approved_at: string | null
          approved_by_member_id: string | null
          calendar_event_id: string | null
          calendar_id: string | null
          calendar_provider: string | null
          created_at: string
          description: string | null
          due_at: string | null
          id: string
          lead_id: string | null
          listing_id: string | null
          priority: string
          requested_end_at: string | null
          requested_start_at: string | null
          status: string
          task_type: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assigned_member_id?: string | null
          approved_at?: string | null
          approved_by_member_id?: string | null
          calendar_event_id?: string | null
          calendar_id?: string | null
          calendar_provider?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          lead_id?: string | null
          listing_id?: string | null
          priority?: string
          requested_end_at?: string | null
          requested_start_at?: string | null
          status?: string
          task_type: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assigned_member_id?: string | null
          approved_at?: string | null
          approved_by_member_id?: string | null
          calendar_event_id?: string | null
          calendar_id?: string | null
          calendar_provider?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          lead_id?: string | null
          listing_id?: string | null
          priority?: string
          requested_end_at?: string | null
          requested_start_at?: string | null
          status?: string
          task_type?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_tasks_approved_by_member_id_fkey"
            columns: ["approved_by_member_id"]
            isOneToOne: false
            referencedRelation: "workspace_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_tasks_assigned_member_id_fkey"
            columns: ["assigned_member_id"]
            isOneToOne: false
            referencedRelation: "workspace_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_tasks_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_facts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_agent_id: string | null
          budget_max: number | null
          budget_min: number | null
          created_at: string
          email: string | null
          financing_status: string
          follow_up_boss_contact_id: string | null
          full_name: string | null
          id: string
          instagram_user_id: string | null
          instagram_username: string | null
          intent: string
          last_message_at: string | null
          lead_type: string
          next_followup_at: string | null
          phone: string | null
          qualification_summary: string | null
          score: number
          source_channel: string
          source_comment_id: string | null
          source_post_id: string | null
          source_provider_id: string | null
          status: string
          tags: string[]
          target_area: string | null
          timeline: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assigned_agent_id?: string | null
          budget_max?: number | null
          budget_min?: number | null
          created_at?: string
          email?: string | null
          financing_status: string
          follow_up_boss_contact_id?: string | null
          full_name?: string | null
          id?: string
          instagram_user_id?: string | null
          instagram_username?: string | null
          intent: string
          last_message_at?: string | null
          lead_type: string
          next_followup_at?: string | null
          phone?: string | null
          qualification_summary?: string | null
          score?: number
          source_channel: string
          source_comment_id?: string | null
          source_post_id?: string | null
          source_provider_id?: string | null
          status: string
          tags?: string[]
          target_area?: string | null
          timeline?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assigned_agent_id?: string | null
          budget_max?: number | null
          budget_min?: number | null
          created_at?: string
          email?: string | null
          financing_status?: string
          follow_up_boss_contact_id?: string | null
          full_name?: string | null
          id?: string
          instagram_user_id?: string | null
          instagram_username?: string | null
          intent?: string
          last_message_at?: string | null
          lead_type?: string
          next_followup_at?: string | null
          phone?: string | null
          qualification_summary?: string | null
          score?: number
          source_channel?: string
          source_comment_id?: string | null
          source_post_id?: string | null
          source_provider_id?: string | null
          status?: string
          tags?: string[]
          target_area?: string | null
          timeline?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "workspace_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_facts: {
        Row: {
          address: string
          baths: number | null
          beds: number | null
          created_at: string
          external_listing_id: string | null
          has_pool: boolean | null
          id: string
          embedded_at: string | null
          embedding: number[] | null
          embedding_text: string | null
          mls_number: string | null
          needs_recheck_at: string | null
          price: number | null
          raw_facts: Json
          source: string
          status: string | null
          updated_at: string
          verification_status: string
          verified_at: string | null
          verified_by_member_id: string | null
          workspace_id: string
        }
        Insert: {
          address: string
          baths?: number | null
          beds?: number | null
          created_at?: string
          external_listing_id?: string | null
          has_pool?: boolean | null
          id?: string
          embedded_at?: string | null
          embedding?: number[] | null
          embedding_text?: string | null
          mls_number?: string | null
          needs_recheck_at?: string | null
          price?: number | null
          raw_facts?: Json
          source: string
          status?: string | null
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          verified_by_member_id?: string | null
          workspace_id: string
        }
        Update: {
          address?: string
          baths?: number | null
          beds?: number | null
          created_at?: string
          external_listing_id?: string | null
          has_pool?: boolean | null
          id?: string
          embedded_at?: string | null
          embedding?: number[] | null
          embedding_text?: string | null
          mls_number?: string | null
          needs_recheck_at?: string | null
          price?: number | null
          raw_facts?: Json
          source?: string
          status?: string | null
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          verified_by_member_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_facts_verified_by_member_id_fkey"
            columns: ["verified_by_member_id"]
            isOneToOne: false
            referencedRelation: "workspace_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_facts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      member_routing_profiles: {
        Row: {
          accepts_new_leads: boolean
          areas: string[]
          budget_max: number | null
          budget_min: number | null
          created_at: string
          id: string
          lead_types: string[]
          max_active_leads: number
          member_id: string
          notification_preference: string
          property_types: string[]
          role_label: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          accepts_new_leads?: boolean
          areas: string[]
          budget_max?: number | null
          budget_min?: number | null
          created_at?: string
          id?: string
          lead_types: string[]
          max_active_leads: number
          member_id: string
          notification_preference?: string
          property_types: string[]
          role_label: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          accepts_new_leads?: boolean
          areas?: Json
          budget_max?: number | null
          budget_min?: number | null
          created_at?: string
          id?: string
          lead_types?: Json
          max_active_leads?: number
          member_id?: string
          notification_preference?: string
          property_types?: Json
          role_label?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_routing_profiles_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "workspace_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_routing_profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_account_foundations: {
        Row: {
          account_scope: string
          areas_mentioned: string[]
          biography: string | null
          created_at: string
          follower_count: number | null
          follows_count: number | null
          id: string
          instagram_business_account_id: string
          instagram_display_name: string | null
          instagram_username: string | null
          integration_account_id: string
          last_fetched_at: string
          listing_hints: string[]
          media_count: number | null
          owner_member_id: string | null
          page_category: string | null
          page_id: string
          page_link_url: string | null
          page_name: string
          profile_photo_url: string | null
          provider: string
          provider_account_id: string
          recent_posts: Json
          updated_at: string
          website_url: string | null
          workspace_id: string
        }
        Insert: {
          account_scope: string
          areas_mentioned?: string[]
          biography?: string | null
          created_at?: string
          follower_count?: number | null
          follows_count?: number | null
          id?: string
          instagram_business_account_id: string
          instagram_display_name?: string | null
          instagram_username?: string | null
          integration_account_id: string
          last_fetched_at: string
          listing_hints?: string[]
          media_count?: number | null
          owner_member_id?: string | null
          page_category?: string | null
          page_id: string
          page_link_url?: string | null
          page_name: string
          profile_photo_url?: string | null
          provider: string
          provider_account_id: string
          recent_posts?: Json
          updated_at?: string
          website_url?: string | null
          workspace_id: string
        }
        Update: {
          account_scope?: string
          areas_mentioned?: string[]
          biography?: string | null
          created_at?: string
          follower_count?: number | null
          follows_count?: number | null
          id?: string
          instagram_business_account_id?: string
          instagram_display_name?: string | null
          instagram_username?: string | null
          integration_account_id?: string
          last_fetched_at?: string
          listing_hints?: string[]
          media_count?: number | null
          owner_member_id?: string | null
          page_category?: string | null
          page_id?: string
          page_link_url?: string | null
          page_name?: string
          profile_photo_url?: string | null
          provider?: string
          provider_account_id?: string
          recent_posts?: Json
          updated_at?: string
          website_url?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_account_foundations_integration_account_id_fkey"
            columns: ["integration_account_id"]
            isOneToOne: false
            referencedRelation: "integration_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_account_foundations_owner_member_id_fkey"
            columns: ["owner_member_id"]
            isOneToOne: false
            referencedRelation: "workspace_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_account_foundations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      nurture_enrollments: {
        Row: {
          created_at: string
          id: string
          last_step_index: number
          lead_id: string
          next_action_at: string | null
          opt_out_reason: string | null
          opted_out_at: string | null
          quiet_hours_timezone: string
          sequence_key: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_step_index?: number
          lead_id: string
          next_action_at?: string | null
          opt_out_reason?: string | null
          opted_out_at?: string | null
          quiet_hours_timezone?: string
          sequence_key: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_step_index?: number
          lead_id?: string
          next_action_at?: string | null
          opt_out_reason?: string | null
          opted_out_at?: string | null
          quiet_hours_timezone?: string
          sequence_key?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nurture_enrollments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nurture_enrollments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      nurture_messages: {
        Row: {
          block_reason: string | null
          body: string | null
          channel: string
          created_at: string
          enrollment_id: string
          id: string
          last_error_code: string | null
          last_error_message: string | null
          lead_id: string
          provider_message_id: string | null
          scheduled_for: string | null
          sent_at: string | null
          status: string
          step_index: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          block_reason?: string | null
          body?: string | null
          channel: string
          created_at?: string
          enrollment_id: string
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          lead_id: string
          provider_message_id?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          step_index: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          block_reason?: string | null
          body?: string | null
          channel?: string
          created_at?: string
          enrollment_id?: string
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          lead_id?: string
          provider_message_id?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          step_index?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nurture_messages_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "nurture_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nurture_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nurture_messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_error_logs: {
        Row: {
          created_at: string
          error_code: string
          error_message: string | null
          id: string
          metadata: Json
          operation: string
          provider: string
          retryable: boolean
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          error_code: string
          error_message?: string | null
          id?: string
          metadata?: Json
          operation: string
          provider: string
          retryable?: boolean
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          error_code?: string
          error_message?: string | null
          id?: string
          metadata?: Json
          operation?: string
          provider?: string
          retryable?: boolean
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_error_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      social_posts: {
        Row: {
          areas_mentioned: string[]
          caption: string | null
          created_at: string
          cta_label: string | null
          fetched_at: string
          id: string
          listing_hints: string[]
          media_type: string | null
          permalink: string | null
          provider: string
          provider_account_id: string
          source_channel: string
          source_post_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          areas_mentioned?: string[]
          caption?: string | null
          created_at?: string
          cta_label?: string | null
          fetched_at: string
          id?: string
          listing_hints?: string[]
          media_type?: string | null
          permalink?: string | null
          provider: string
          provider_account_id: string
          source_channel: string
          source_post_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          areas_mentioned?: string[]
          caption?: string | null
          created_at?: string
          cta_label?: string | null
          fetched_at?: string
          id?: string
          listing_hints?: string[]
          media_type?: string | null
          permalink?: string | null
          provider?: string
          provider_account_id?: string
          source_channel?: string
          source_post_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_posts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      social_reply_reviews: {
        Row: {
          ai_decision: Json | null
          automation_changed_at: string | null
          automation_changed_by_member_id: string | null
          automation_mode: string
          automation_reason: string | null
          channel: string
          created_at: string
          dismissal_reason: string | null
          id: string
          inbound_text: string | null
          last_error_code: string | null
          last_error_message: string | null
          lead_event_id: string
          lead_id: string | null
          provider_account_id: string
          provider_event_id: string | null
          recipient_user_id: string | null
          reviewed_at: string | null
          reviewed_by_member_id: string | null
          source_comment_id: string | null
          source_post_id: string | null
          status: string
          suggested_reply: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          ai_decision?: Json | null
          automation_changed_at?: string | null
          automation_changed_by_member_id?: string | null
          automation_mode?: string
          automation_reason?: string | null
          channel: string
          created_at?: string
          dismissal_reason?: string | null
          id?: string
          inbound_text?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          lead_event_id: string
          lead_id?: string | null
          provider_account_id: string
          provider_event_id?: string | null
          recipient_user_id?: string | null
          reviewed_at?: string | null
          reviewed_by_member_id?: string | null
          source_comment_id?: string | null
          source_post_id?: string | null
          status?: string
          suggested_reply?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          ai_decision?: Json | null
          automation_changed_at?: string | null
          automation_changed_by_member_id?: string | null
          automation_mode?: string
          automation_reason?: string | null
          channel?: string
          created_at?: string
          dismissal_reason?: string | null
          id?: string
          inbound_text?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          lead_event_id?: string
          lead_id?: string | null
          provider_account_id?: string
          provider_event_id?: string | null
          recipient_user_id?: string | null
          reviewed_at?: string | null
          reviewed_by_member_id?: string | null
          source_comment_id?: string | null
          source_post_id?: string | null
          status?: string
          suggested_reply?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_reply_reviews_automation_changed_by_member_id_fkey"
            columns: ["automation_changed_by_member_id"]
            isOneToOne: false
            referencedRelation: "workspace_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_reply_reviews_lead_event_id_fkey"
            columns: ["lead_event_id"]
            isOneToOne: false
            referencedRelation: "lead_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_reply_reviews_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_reply_reviews_reviewed_by_member_id_fkey"
            columns: ["reviewed_by_member_id"]
            isOneToOne: false
            referencedRelation: "workspace_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_reply_reviews_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_lead_handoffs: {
        Row: {
          budget: string | null
          call_id: string | null
          callback_task_id: string | null
          caller_name: string | null
          created_at: string
          dismissal_reason: string | null
          financing_status: string
          id: string
          lead_id: string | null
          lead_type: string
          phone: string | null
          retell_agent_id: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by_member_id: string | null
          status: string
          summary: string
          target_area: string | null
          timeline: string | null
          updated_at: string
          urgency: string
          workspace_id: string
        }
        Insert: {
          budget?: string | null
          call_id?: string | null
          callback_task_id?: string | null
          caller_name?: string | null
          created_at?: string
          dismissal_reason?: string | null
          financing_status: string
          id?: string
          lead_id?: string | null
          lead_type: string
          phone?: string | null
          retell_agent_id?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by_member_id?: string | null
          status?: string
          summary: string
          target_area?: string | null
          timeline?: string | null
          updated_at?: string
          urgency: string
          workspace_id: string
        }
        Update: {
          budget?: string | null
          call_id?: string | null
          callback_task_id?: string | null
          caller_name?: string | null
          created_at?: string
          dismissal_reason?: string | null
          financing_status?: string
          id?: string
          lead_id?: string | null
          lead_type?: string
          phone?: string | null
          retell_agent_id?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by_member_id?: string | null
          status?: string
          summary?: string
          target_area?: string | null
          timeline?: string | null
          updated_at?: string
          urgency?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_lead_handoffs_callback_task_id_fkey"
            columns: ["callback_task_id"]
            isOneToOne: false
            referencedRelation: "lead_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_lead_handoffs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_lead_handoffs_reviewed_by_member_id_fkey"
            columns: ["reviewed_by_member_id"]
            isOneToOne: false
            referencedRelation: "workspace_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_lead_handoffs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_heartbeats: {
        Row: {
          app_env: string
          last_batch: Json
          last_seen_at: string
          updated_at: string
          worker_id: string
        }
        Insert: {
          app_env: string
          last_batch?: Json
          last_seen_at?: string
          updated_at?: string
          worker_id: string
        }
        Update: {
          app_env?: string
          last_batch?: Json
          last_seen_at?: string
          updated_at?: string
          worker_id?: string
        }
        Relationships: []
      }
      workflow_jobs: {
        Row: {
          attempt_count: number
          created_at: string
          id: string
          idempotency_key: string
          job_type: string
          last_error_code: string | null
          last_error_message: string | null
          lead_event_id: string | null
          lead_id: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          payload: Json
          run_after: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          id?: string
          idempotency_key: string
          job_type: string
          last_error_code?: string | null
          last_error_message?: string | null
          lead_event_id?: string | null
          lead_id?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          payload?: Json
          run_after?: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          id?: string
          idempotency_key?: string
          job_type?: string
          last_error_code?: string | null
          last_error_message?: string | null
          lead_event_id?: string | null
          lead_id?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          payload?: Json
          run_after?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_jobs_lead_event_id_fkey"
            columns: ["lead_event_id"]
            isOneToOne: false
            referencedRelation: "lead_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_jobs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          email: string | null
          id: string
          is_active: boolean
          presence_last_seen_at: string | null
          presence_status: string | null
          role: string
          role_label: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          email?: string | null
          id?: string
          is_active?: boolean
          presence_last_seen_at?: string | null
          presence_status?: string | null
          role: string
          role_label?: string | null
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          email?: string | null
          id?: string
          is_active?: boolean
          presence_last_seen_at?: string | null
          presence_status?: string | null
          role?: string
          role_label?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_member_calendar_connections: {
        Row: {
          calendar_id: string
          created_at: string
          encrypted_credential_ref: string
          id: string
          last_synced_at: string | null
          member_id: string
          provider: string
          provider_account_email: string | null
          showing_mode: string
          status: string
          timezone: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          calendar_id?: string
          created_at?: string
          encrypted_credential_ref: string
          id?: string
          last_synced_at?: string | null
          member_id: string
          provider?: string
          provider_account_email?: string | null
          showing_mode?: string
          status?: string
          timezone?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          calendar_id?: string
          created_at?: string
          encrypted_credential_ref?: string
          id?: string
          last_synced_at?: string | null
          member_id?: string
          provider?: string
          provider_account_email?: string | null
          showing_mode?: string
          status?: string
          timezone?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_member_calendar_connections_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "workspace_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_member_calendar_connections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_voice_agents: {
        Row: {
          account_scope: string
          created_at: string
          dynamic_variables_webhook_url: string | null
          id: string
          last_error_code: string | null
          last_error_message: string | null
          last_synced_at: string | null
          owner_member_id: string | null
          phone_number: string | null
          provider: string
          published_config_hash: string | null
          retell_agent_id: string | null
          retell_conversation_flow_id: string | null
          retell_phone_number_id: string | null
          service_areas: string[]
          status: string
          template_version: string
          transfer_number: string | null
          updated_at: string
          webhook_url: string | null
          workspace_id: string
        }
        Insert: {
          account_scope?: string
          created_at?: string
          dynamic_variables_webhook_url?: string | null
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          last_synced_at?: string | null
          owner_member_id?: string | null
          phone_number?: string | null
          provider: string
          published_config_hash?: string | null
          retell_agent_id?: string | null
          retell_conversation_flow_id?: string | null
          retell_phone_number_id?: string | null
          service_areas?: string[]
          status?: string
          template_version?: string
          transfer_number?: string | null
          updated_at?: string
          webhook_url?: string | null
          workspace_id: string
        }
        Update: {
          account_scope?: string
          created_at?: string
          dynamic_variables_webhook_url?: string | null
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          last_synced_at?: string | null
          owner_member_id?: string | null
          phone_number?: string | null
          provider?: string
          published_config_hash?: string | null
          retell_agent_id?: string | null
          retell_conversation_flow_id?: string | null
          retell_phone_number_id?: string | null
          service_areas?: string[]
          status?: string
          template_version?: string
          transfer_number?: string | null
          updated_at?: string
          webhook_url?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_voice_agents_owner_member_id_fkey"
            columns: ["owner_member_id"]
            isOneToOne: false
            referencedRelation: "workspace_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_voice_agents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_memory_documents: {
        Row: {
          body: string
          confidence: number
          created_at: string
          embedded_at: string | null
          embedding: number[] | null
          embedding_text: string | null
          evidence: Json
          id: string
          last_observed_at: string
          memory_type: string
          review_note: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by_member_id: string | null
          source: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          body: string
          confidence?: number
          created_at?: string
          embedded_at?: string | null
          embedding?: number[] | null
          embedding_text?: string | null
          evidence?: Json
          id?: string
          last_observed_at?: string
          memory_type: string
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by_member_id?: string | null
          source?: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          body?: string
          confidence?: number
          created_at?: string
          embedded_at?: string | null
          embedding?: number[] | null
          embedding_text?: string | null
          evidence?: Json
          id?: string
          last_observed_at?: string
          memory_type?: string
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by_member_id?: string | null
          source?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_memory_documents_reviewed_by_member_id_fkey"
            columns: ["reviewed_by_member_id"]
            isOneToOne: false
            referencedRelation: "workspace_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_memory_documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_events: {
        Row: {
          balance_after_cents: number
          cogs_cents: number
          created_at: string
          event_metadata: Json | null
          event_type: string
          id: string
          idempotency_key: string
          occurred_at: string
          retail_cents: number
          source_id: string | null
          unit_count: number
          workspace_id: string
        }
        Insert: {
          balance_after_cents: number
          cogs_cents?: number
          created_at?: string
          event_metadata?: Json | null
          event_type: string
          id?: string
          idempotency_key: string
          occurred_at?: string
          retail_cents?: number
          source_id?: string | null
          unit_count: number
          workspace_id: string
        }
        Update: {
          balance_after_cents?: number
          cogs_cents?: number
          created_at?: string
          event_metadata?: Json | null
          event_type?: string
          id?: string
          idempotency_key?: string
          occurred_at?: string
          retail_cents?: number
          source_id?: string | null
          unit_count?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
          policy_narrative: string | null
          policy_narrative_generated_at: string | null
          policy_narrative_source: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          policy_narrative?: string | null
          policy_narrative_generated_at?: string | null
          policy_narrative_source?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          policy_narrative?: string | null
          policy_narrative_generated_at?: string | null
          policy_narrative_source?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      workspace_subscriptions: {
        Row: {
          billing_interval: string
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          current_period_end: string
          current_period_start: string
          id: string
          plan_tier: string
          provider_customer_id: string | null
          provider_subscription_id: string | null
          status: string
          trial_end: string | null
          trial_start: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          billing_interval: string
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end: string
          current_period_start: string
          id?: string
          plan_tier: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status: string
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          billing_interval?: string
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          plan_tier?: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_usage_events: {
        Row: {
          billing_period_end: string
          billing_period_start: string
          created_at: string
          event_count: number
          event_metadata: Json | null
          event_type: string
          id: string
          resource_id: string | null
          workspace_id: string
        }
        Insert: {
          billing_period_end: string
          billing_period_start: string
          created_at?: string
          event_count: number
          event_metadata?: Json | null
          event_type: string
          id?: string
          resource_id?: string | null
          workspace_id: string
        }
        Update: {
          billing_period_end?: string
          billing_period_start?: string
          created_at?: string
          event_count?: number
          event_metadata?: Json | null
          event_type?: string
          id?: string
          resource_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_usage_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_usage_wallet: {
        Row: {
          auto_recharge_amount_cents: number
          auto_recharge_enabled: boolean
          auto_recharge_threshold_cents: number
          balance_cents: number
          last_recharge_at: string | null
          low_balance_notified_at: string | null
          stripe_payment_method_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          auto_recharge_amount_cents?: number
          auto_recharge_enabled?: boolean
          auto_recharge_threshold_cents?: number
          balance_cents?: number
          last_recharge_at?: string | null
          low_balance_notified_at?: string | null
          stripe_payment_method_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          auto_recharge_amount_cents?: number
          auto_recharge_enabled?: boolean
          auto_recharge_threshold_cents?: number
          balance_cents?: number
          last_recharge_at?: string | null
          low_balance_notified_at?: string | null
          stripe_payment_method_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_usage_wallet_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_usage_summaries: {
        Row: {
          active_integration_account_count: number
          active_seat_count: number
          ai_message_sent_count: number
          ai_turn_count: number
          billing_period_end: string
          billing_period_start: string
          created_at: string
          lead_event_count: number
          listing_count: number
          plan_tier: string
          social_message_sent_count: number
          updated_at: string
          voice_call_minutes: number
          workspace_id: string
        }
        Insert: {
          active_integration_account_count?: number
          active_seat_count?: number
          ai_message_sent_count?: number
          ai_turn_count?: number
          billing_period_end: string
          billing_period_start: string
          created_at?: string
          lead_event_count?: number
          listing_count?: number
          plan_tier: string
          social_message_sent_count?: number
          updated_at?: string
          voice_call_minutes?: number
          workspace_id: string
        }
        Update: {
          active_integration_account_count?: number
          active_seat_count?: number
          ai_message_sent_count?: number
          ai_turn_count?: number
          billing_period_end?: string
          billing_period_start?: string
          created_at?: string
          lead_event_count?: number
          listing_count?: number
          plan_tier?: string
          social_message_sent_count?: number
          updated_at?: string
          voice_call_minutes?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_usage_summaries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      monthly_usage_summary: {
        Row: {
          balance_after_cents: number | null
          cogs_cents: number | null
          memory_loops_used: number | null
          minutes_used: number | null
          month: string | null
          overage_listings: number | null
          overage_seats: number | null
          retail_cents: number | null
          turns_used: number | null
          workspace_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_manage_workspace_operations: {
        Args: { target_workspace_id: string }
        Returns: boolean
      }
      can_manage_workspace_routing: {
        Args: { target_workspace_id: string }
        Returns: boolean
      }
      claim_workflow_jobs: {
        Args: { batch_size?: number; lock_timeout?: string; worker_id: string }
        Returns: {
          attempt_count: number
          created_at: string
          id: string
          idempotency_key: string
          job_type: string
          last_error_code: string | null
          last_error_message: string | null
          lead_event_id: string | null
          lead_id: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          payload: Json
          run_after: string
          status: string
          updated_at: string
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "workflow_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      is_assigned_agent: {
        Args: { target_agent_id: string; target_workspace_id: string }
        Returns: boolean
      }
      is_workspace_admin: {
        Args: { target_workspace_id: string }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { target_workspace_id: string }
        Returns: boolean
      }
      match_agent_trajectories: {
        Args: {
          workspace: string
          query_embedding: number[]
          match_count?: number
          min_similarity?: number
          require_outcome?: string | null
        }
        Returns: {
          id: string
          workspace_id: string
          lead_id: string | null
          channel: string | null
          started_at: string
          completed_at: string | null
          completion_reason: string | null
          outcome_label: string | null
          step_count: number
          final_lead_status: string | null
          summary_text: string | null
          similarity: number
        }[]
      }
      match_listing_facts: {
        Args: {
          workspace: string
          query_embedding: number[]
          match_count?: number
          min_similarity?: number
        }
        Returns: {
          id: string
          workspace_id: string
          source: string
          external_listing_id: string | null
          mls_number: string | null
          address: string
          status: string | null
          price: number | null
          beds: number | null
          baths: number | null
          has_pool: boolean | null
          raw_facts: Json
          verification_status: string
          verified_by_member_id: string | null
          verified_at: string | null
          needs_recheck_at: string | null
          created_at: string
          updated_at: string
          embedding: number[] | null
          embedding_text: string | null
          embedded_at: string | null
          similarity: number
        }[]
      }
      match_workspace_memory_documents: {
        Args: {
          workspace: string
          query_embedding: number[]
          match_count?: number
          min_similarity?: number
        }
        Returns: {
          id: string
          workspace_id: string
          memory_type: string
          title: string
          body: string
          source: string
          confidence: number
          evidence: Json
          last_observed_at: string
          created_at: string
          updated_at: string
          embedding_text: string | null
          embedded_at: string | null
          similarity: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

// Type aliases for backward compatibility
export type RealtyOpsDatabase = Database;
export type WorkspaceMemberRow = Tables<"workspace_members">;
export type WorkspaceRow = Tables<"workspaces">;
export type LeadRow = Tables<"leads">;
export type LeadEventRow = Tables<"lead_events">;
export type SocialReplyReviewRow = Tables<"social_reply_reviews">;
export type ConversationAutomationStateRow = Tables<"conversation_automation_states">;
export type ConversationMessageRow = Tables<"conversation_messages">;
export type ConversationRow = Tables<"conversations">;
export type ConversationActivityLogRow = Tables<"conversation_activity_log">;
export type AgentTrajectoryRow = Tables<"agent_trajectories">;
export type AgentStepRow = Tables<"agent_steps">;
export type AgentOutcomeRow = Tables<"agent_outcomes">;
export type IntegrationAccountRow = Tables<"integration_accounts">;
export type CrmSyncLogRow = Tables<"crm_sync_logs">;
export type CrmBacksyncEventRow = Tables<"crm_backsync_events">;
export type FollowUpBossWebhookSubscriptionRow = Tables<"follow_up_boss_webhook_subscriptions">;
export type HarwickAiTurnInsertRow = TablesInsert<"harwick_ai_turns">;
export type HarwickAiToolCallInsertRow = TablesInsert<"harwick_ai_tool_calls">;
export type HarwickAiAutomationPolicyRow = Tables<"harwick_ai_automation_policies">;
export type HarwickWorkItemRow = Tables<"harwick_work_items">;
export type HarwickWorkItemInsertRow = TablesInsert<"harwick_work_items">;
export type HarwickRoutingDecisionRow = Tables<"harwick_routing_decisions">;
export type HarwickRoutingDecisionInsertRow = TablesInsert<"harwick_routing_decisions">;
export type HarwickLoopRow = Tables<"harwick_loops">;
export type HarwickLoopInsertRow = TablesInsert<"harwick_loops">;
export type HarwickLoopUpdateRow = TablesUpdate<"harwick_loops">;
export type HarwickLoopRunRow = Tables<"harwick_loop_runs">;
export type HarwickLoopRunInsertRow = TablesInsert<"harwick_loop_runs">;
export type HarwickLoopRunUpdateRow = TablesUpdate<"harwick_loop_runs">;
export type WorkspaceMemberCalendarConnectionRow = Tables<"workspace_member_calendar_connections">;
export type WorkspaceMemberCalendarConnectionInsertRow = TablesInsert<"workspace_member_calendar_connections">;
export type WorkspaceMemberCalendarConnectionUpdateRow = TablesUpdate<"workspace_member_calendar_connections">;
export type MemberRoutingProfileRow = Tables<"member_routing_profiles">;
export type MemberRoutingProfileInsertRow = TablesInsert<"member_routing_profiles">;
export type MemberRoutingProfileUpdateRow = TablesUpdate<"member_routing_profiles">;
export type LeadTaskRow = Tables<"lead_tasks">;
export type NurtureMessageRow = Tables<"nurture_messages">;
export type ProviderErrorLogRow = Tables<"provider_error_logs">;
export type BillingWebhookEventRow = Tables<"billing_webhook_events">;
export type BillingWebhookEventInsertRow = TablesInsert<"billing_webhook_events">;
export type BillingWebhookEventUpdateRow = TablesUpdate<"billing_webhook_events">;
export type BillingUsageEventRow = Tables<"usage_events">;
export type BillingUsageEventInsertRow = TablesInsert<"usage_events">;
export type WorkspaceSubscriptionRow = Tables<"workspace_subscriptions">;
export type WorkspaceUsageEventInsertRow = TablesInsert<"workspace_usage_events">;
export type WorkspaceUsageSummaryRow = Tables<"workspace_usage_summaries">;
export type WorkspaceUsageWalletRow = Tables<"workspace_usage_wallet">;
export type WorkspaceUsageWalletUpdateRow = TablesUpdate<"workspace_usage_wallet">;
export type WorkspaceMemoryDocumentRow = Tables<"workspace_memory_documents">;
export type WorkspaceMemoryDocumentInsertRow = TablesInsert<"workspace_memory_documents">;
export type WorkspaceMemoryDocumentUpdateRow = TablesUpdate<"workspace_memory_documents">;
export type WorkerHeartbeatRow = Tables<"worker_heartbeats">;
