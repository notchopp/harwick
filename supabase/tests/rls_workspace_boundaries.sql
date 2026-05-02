-- Fail-fast workspace-boundary verification for production readiness.
-- Run against a migrated database after seed fixtures are present.
-- This script raises when critical tenant tables are missing RLS or
-- when required named policies disappear or lose WITH CHECK protection.

begin;

create temp table expected_rls_tables (
  table_name text primary key
) on commit drop;

insert into expected_rls_tables (table_name)
values
  ('workspaces'),
  ('workspace_members'),
  ('integration_accounts'),
  ('leads'),
  ('lead_events'),
  ('lead_tasks'),
  ('listing_facts'),
  ('workflow_jobs'),
  ('crm_sync_logs'),
  ('follow_up_boss_webhook_subscriptions'),
  ('crm_backsync_events'),
  ('nurture_enrollments'),
  ('nurture_messages'),
  ('social_posts'),
  ('social_reply_reviews'),
  ('provider_error_logs'),
  ('worker_heartbeats'),
  ('voice_lead_handoffs'),
  ('workspace_voice_agents'),
  ('meta_account_foundations'),
  ('conversation_automation_states'),
  ('harwick_ai_turns'),
  ('harwick_ai_tool_calls'),
  ('harwick_ai_automation_policies');

create temp table expected_policies (
  table_name text not null,
  policy_name text not null,
  requires_with_check boolean not null default false,
  primary key (table_name, policy_name)
) on commit drop;

insert into expected_policies (table_name, policy_name, requires_with_check)
values
  ('workspaces', 'workspace members can read workspaces', false),
  ('workspaces', 'workspace admins can update workspaces', true),
  ('workspace_members', 'workspace members can read membership', false),
  ('workspace_members', 'workspace admins can manage members', true),
  ('integration_accounts', 'workspace admins can read integration accounts', false),
  ('integration_accounts', 'workspace admins can manage integration accounts', true),
  ('integration_accounts', 'workspace members can read own integration accounts', false),
  ('integration_accounts', 'workspace members can manage own integration accounts', true),
  ('leads', 'workspace members can read visible leads', false),
  ('leads', 'workspace admins can manage leads', true),
  ('leads', 'assigned agents can update assigned leads', true),
  ('lead_events', 'workspace members can read visible lead events', false),
  ('lead_events', 'workspace admins can manage lead events', true),
  ('lead_tasks', 'workspace members can read lead tasks', false),
  ('lead_tasks', 'workspace admins can manage lead tasks', true),
  ('listing_facts', 'workspace members can read listing facts', false),
  ('listing_facts', 'workspace admins can manage listing facts', true),
  ('workflow_jobs', 'workspace admins can read workflow jobs', false),
  ('workflow_jobs', 'workspace admins can manage workflow jobs', true),
  ('crm_sync_logs', 'workspace admins can read crm sync logs', false),
  ('crm_sync_logs', 'workspace admins can manage crm sync logs', true),
  ('follow_up_boss_webhook_subscriptions', 'workspace admins can read fub webhook subscriptions', false),
  ('follow_up_boss_webhook_subscriptions', 'workspace admins can manage fub webhook subscriptions', true),
  ('crm_backsync_events', 'workspace admins can read crm backsync events', false),
  ('crm_backsync_events', 'workspace admins can manage crm backsync events', true),
  ('nurture_enrollments', 'workspace admins can read nurture enrollments', false),
  ('nurture_enrollments', 'workspace admins can manage nurture enrollments', true),
  ('nurture_messages', 'workspace members can read nurture messages', false),
  ('nurture_messages', 'workspace admins can manage nurture messages', true),
  ('social_posts', 'workspace members can read social posts', false),
  ('social_posts', 'workspace admins can manage social posts', true),
  ('social_reply_reviews', 'workspace members can read social reply reviews', false),
  ('social_reply_reviews', 'workspace admins can manage social reply reviews', true),
  ('provider_error_logs', 'workspace admins can read provider error logs', false),
  ('worker_heartbeats', 'workspace admins can read worker heartbeats', false),
  ('voice_lead_handoffs', 'workspace admins can read voice lead handoffs', false),
  ('voice_lead_handoffs', 'workspace admins can manage voice lead handoffs', true),
  ('workspace_voice_agents', 'workspace admins can read voice agents', false),
  ('workspace_voice_agents', 'workspace admins can manage voice agents', true),
  ('workspace_voice_agents', 'workspace members can read own voice agents', false),
  ('workspace_voice_agents', 'workspace members can manage own voice agents', true),
  ('meta_account_foundations', 'workspace members can read meta account foundations', false),
  ('meta_account_foundations', 'workspace admins can manage meta account foundations', true),
  ('conversation_automation_states', 'workspace members can read conversation automation states', false),
  ('conversation_automation_states', 'workspace members can manage conversation automation states', true),
  ('harwick_ai_turns', 'workspace operators can read harwick ai turns', false),
  ('harwick_ai_turns', 'workspace operators can manage harwick ai turns', true),
  ('harwick_ai_tool_calls', 'workspace operators can read harwick ai tool calls', false),
  ('harwick_ai_tool_calls', 'workspace operators can manage harwick ai tool calls', true),
  ('harwick_ai_automation_policies', 'workspace members can read harwick ai automation policies', false),
  ('harwick_ai_automation_policies', 'workspace operators can manage harwick ai automation policies', true);

do $$
declare
  missing_tables text;
begin
  select string_agg(expected.table_name, ', ' order by expected.table_name)
  into missing_tables
  from expected_rls_tables expected
  left join information_schema.tables actual
    on actual.table_schema = 'public'
   and actual.table_name = expected.table_name
  where actual.table_name is null;

  if missing_tables is not null then
    raise exception 'Missing expected public tables: %', missing_tables;
  end if;
end $$;

do $$
declare
  tables_without_rls text;
begin
  select string_agg(expected.table_name, ', ' order by expected.table_name)
  into tables_without_rls
  from expected_rls_tables expected
  join pg_class class_rel
    on class_rel.relname = expected.table_name
   and class_rel.relnamespace = 'public'::regnamespace
  where class_rel.relrowsecurity is distinct from true;

  if tables_without_rls is not null then
    raise exception 'Expected RLS enabled on: %', tables_without_rls;
  end if;
end $$;

do $$
declare
  missing_policies text;
begin
  select string_agg(format('%s.%s', expected.table_name, expected.policy_name), ', ' order by expected.table_name, expected.policy_name)
  into missing_policies
  from expected_policies expected
  left join pg_policies policies
    on policies.schemaname = 'public'
   and policies.tablename = expected.table_name
   and policies.policyname = expected.policy_name
  where policies.policyname is null;

  if missing_policies is not null then
    raise exception 'Missing expected RLS policies: %', missing_policies;
  end if;
end $$;

do $$
declare
  write_policies_without_check text;
begin
  select string_agg(format('%s.%s', expected.table_name, expected.policy_name), ', ' order by expected.table_name, expected.policy_name)
  into write_policies_without_check
  from expected_policies expected
  join pg_policies policies
    on policies.schemaname = 'public'
   and policies.tablename = expected.table_name
   and policies.policyname = expected.policy_name
  where expected.requires_with_check = true
    and policies.with_check is null;

  if write_policies_without_check is not null then
    raise exception 'Expected WITH CHECK on write policies: %', write_policies_without_check;
  end if;
end $$;

select 'workspace-boundary-rls-verification-passed' as status;

rollback;
