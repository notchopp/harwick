alter table public.lead_tasks
add column if not exists requested_start_at timestamptz,
add column if not exists requested_end_at timestamptz,
add column if not exists calendar_provider text,
add column if not exists calendar_id text,
add column if not exists calendar_event_id text,
add column if not exists approved_by_member_id uuid references public.workspace_members(id),
add column if not exists approved_at timestamptz;

do $$
declare
  constraint_name text;
begin
  select conname
  into constraint_name
  from pg_constraint
  where conrelid = 'public.lead_tasks'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%task_type%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.lead_tasks drop constraint %I', constraint_name);
  end if;
end;
$$;

alter table public.lead_tasks
add constraint lead_tasks_task_type_check
check (task_type in (
  'call_back',
  'verify_listing',
  'assign_lead',
  'fub_retry',
  'nurture_review',
  'request_showing_approval',
  'showing_approval',
  'open_house_registration'
));

alter table public.lead_tasks
drop constraint if exists lead_tasks_calendar_provider_check;

alter table public.lead_tasks
add constraint lead_tasks_calendar_provider_check
check (calendar_provider is null or calendar_provider in ('google'));

create index if not exists lead_tasks_workspace_showings_idx
on public.lead_tasks (workspace_id, task_type, status, requested_start_at)
where task_type in ('request_showing_approval', 'showing_approval');

create unique index if not exists lead_tasks_workspace_calendar_event_uidx
on public.lead_tasks (workspace_id, calendar_provider, calendar_event_id)
where calendar_event_id is not null;
