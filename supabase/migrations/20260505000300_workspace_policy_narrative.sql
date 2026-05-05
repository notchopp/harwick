-- AI-native shift 3: policy narrative replaces evaluateHarwickAiAutomation.
-- Brokers configure preferences in the UI exactly as today; a generator
-- renders those settings as plain English into policy_narrative, which the
-- system prompt injects on every turn. Source is `generated` while the
-- structured policy is the source of truth, `manual` once a broker edits
-- the prose directly.
alter table public.workspaces
  add column if not exists policy_narrative text,
  add column if not exists policy_narrative_generated_at timestamptz,
  add column if not exists policy_narrative_source text default 'generated';

do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'workspaces' and constraint_name = 'workspaces_policy_narrative_source_check'
  ) then
    alter table public.workspaces
      add constraint workspaces_policy_narrative_source_check
      check (policy_narrative_source in ('generated', 'manual'));
  end if;
end$$;
