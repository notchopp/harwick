-- Workspace-boundary verification for production readiness.
-- Run against a staging database after migrations and seed data are present.

begin;

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'workspaces',
    'workspace_members',
    'integration_accounts',
    'leads',
    'lead_events',
    'lead_tasks',
    'workflow_jobs',
    'crm_sync_logs',
    'crm_backsync_events',
    'nurture_enrollments',
    'nurture_messages',
    'social_reply_reviews',
    'provider_error_logs',
    'voice_lead_handoffs',
    'workspace_voice_agents'
  )
except
select relname
from pg_class
where relnamespace = 'public'::regnamespace
  and relrowsecurity = true;

select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'workspaces',
    'workspace_members',
    'integration_accounts',
    'leads',
    'lead_events',
    'lead_tasks',
    'workflow_jobs',
    'crm_sync_logs',
    'crm_backsync_events',
    'nurture_enrollments',
    'nurture_messages',
    'social_reply_reviews',
    'provider_error_logs',
    'voice_lead_handoffs',
    'workspace_voice_agents'
  )
order by tablename, policyname;

rollback;
