create table if not exists public.workflow_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  lead_event_id uuid references public.lead_events(id) on delete set null,
  job_type text not null check (job_type in ('lead_intake', 'lead_qualification', 'lead_assignment', 'fub_sync', 'handoff_task')),
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed', 'skipped')),
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, idempotency_key)
);

alter table public.workflow_jobs enable row level security;

create policy "workspace admins can read workflow jobs"
on public.workflow_jobs
for select
to authenticated
using (public.is_workspace_admin(workspace_id));

create policy "workspace admins can manage workflow jobs"
on public.workflow_jobs
for all
to authenticated
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

create index if not exists workflow_jobs_claim_idx
on public.workflow_jobs (status, run_after, created_at)
where status in ('queued', 'failed');

create index if not exists workflow_jobs_workspace_status_idx
on public.workflow_jobs (workspace_id, status, created_at desc);

create or replace function public.claim_workflow_jobs(
  worker_id text,
  batch_size integer default 10,
  lock_timeout interval default interval '5 minutes'
)
returns setof public.workflow_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with claimable as (
    select id
    from public.workflow_jobs
    where (
        status = 'queued'
        or (
          status = 'failed'
          and attempt_count < max_attempts
        )
        or (
          status = 'processing'
          and locked_at < now() - lock_timeout
          and attempt_count < max_attempts
        )
      )
      and run_after <= now()
    order by run_after asc, created_at asc
    limit greatest(batch_size, 1)
    for update skip locked
  )
  update public.workflow_jobs jobs
  set
    status = 'processing',
    attempt_count = jobs.attempt_count + 1,
    locked_at = now(),
    locked_by = worker_id,
    updated_at = now()
  from claimable
  where jobs.id = claimable.id
  returning jobs.*;
end;
$$;
