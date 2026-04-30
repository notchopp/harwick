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
  'listing_recheck'
));

alter table public.lead_tasks
add column if not exists listing_id uuid references public.listing_facts(id) on delete set null;

create index if not exists lead_tasks_workspace_listing_idx
on public.lead_tasks (workspace_id, listing_id, status)
where listing_id is not null;

create index if not exists listing_facts_recheck_due_idx
on public.listing_facts (workspace_id, needs_recheck_at)
where needs_recheck_at is not null;

