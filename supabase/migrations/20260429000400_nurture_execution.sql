do $$
declare
  constraint_name text;
begin
  select conname
  into constraint_name
  from pg_constraint
  where conrelid = 'public.workflow_jobs'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%job_type%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.workflow_jobs drop constraint %I', constraint_name);
  end if;
end;
$$;

alter table public.workflow_jobs
add constraint workflow_jobs_job_type_check
check (job_type in (
  'lead_intake',
  'lead_qualification',
  'lead_assignment',
  'fub_sync',
  'fub_backsync_reconcile',
  'handoff_task',
  'listing_recheck',
  'nurture_delivery'
));

alter table public.nurture_enrollments
add column if not exists last_step_index integer not null default 0 check (last_step_index >= 0),
add column if not exists opted_out_at timestamptz,
add column if not exists opt_out_reason text;

create table if not exists public.nurture_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  enrollment_id uuid not null references public.nurture_enrollments(id) on delete cascade,
  channel text not null check (channel in ('sms', 'instagram_dm', 'facebook_dm')),
  status text not null default 'queued' check (status in ('queued', 'blocked', 'drafted', 'sent', 'failed')),
  step_index integer not null check (step_index >= 0),
  body text,
  block_reason text check (block_reason is null or block_reason in ('opted_out', 'quiet_hours', 'missing_contact', 'sequence_complete')),
  provider_message_id text,
  scheduled_for timestamptz,
  sent_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.nurture_messages enable row level security;

create policy "workspace members can read nurture messages"
on public.nurture_messages
for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "workspace admins can manage nurture messages"
on public.nurture_messages
for all
to authenticated
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

create index if not exists nurture_messages_workspace_lead_idx
on public.nurture_messages (workspace_id, lead_id, created_at desc);

create index if not exists nurture_messages_workspace_status_idx
on public.nurture_messages (workspace_id, status, created_at desc);
