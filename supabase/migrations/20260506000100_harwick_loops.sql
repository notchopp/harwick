-- Harwick loops are recurring cognitive jobs: prose instructions plus a
-- schedule/event trigger. Runs are durable training/audit signal, while v1
-- output is reviewable work surfaced through harwick_work_items.

create table if not exists public.harwick_loops (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by_member_id uuid references public.workspace_members(id) on delete set null,
  name text not null,
  instruction text not null,
  trigger_type text not null default 'schedule' check (trigger_type in ('schedule', 'event')),
  schedule_spec text,
  event_type text,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  approval_mode text not null default 'approval_required' check (
    approval_mode in ('suggest_only', 'approval_required', 'auto_execute')
  ),
  output_mode text not null default 'work_item' check (
    output_mode in ('work_item', 'draft', 'agent_loop')
  ),
  tool_allowlist text[] not null default '{}',
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_run_status text check (
    last_run_status is null or last_run_status in ('running', 'completed', 'failed')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (trigger_type = 'schedule' and schedule_spec is not null)
    or (trigger_type = 'event' and event_type is not null)
  )
);

create table if not exists public.harwick_loop_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  loop_id uuid not null references public.harwick_loops(id) on delete cascade,
  status text not null check (status in ('running', 'completed', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  instruction_snapshot text not null,
  result_summary text,
  error_message text,
  work_item_id uuid references public.harwick_work_items(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists harwick_loops_due_idx
  on public.harwick_loops (status, trigger_type, next_run_at)
  where trigger_type = 'schedule';

create index if not exists harwick_loops_workspace_status_idx
  on public.harwick_loops (workspace_id, status, updated_at desc);

create index if not exists harwick_loop_runs_workspace_loop_idx
  on public.harwick_loop_runs (workspace_id, loop_id, started_at desc);

alter table public.harwick_loops enable row level security;
alter table public.harwick_loop_runs enable row level security;

drop policy if exists harwick_loops_workspace_read on public.harwick_loops;
create policy harwick_loops_workspace_read
on public.harwick_loops
for select
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = harwick_loops.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin', 'team_lead', 'lead_manager', 'operator', 'agent', 'viewer')
  )
);

drop policy if exists harwick_loops_workspace_manage on public.harwick_loops;
create policy harwick_loops_workspace_manage
on public.harwick_loops
for all
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = harwick_loops.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin', 'team_lead')
  )
)
with check (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = harwick_loops.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin', 'team_lead')
  )
);

drop policy if exists harwick_loop_runs_workspace_read on public.harwick_loop_runs;
create policy harwick_loop_runs_workspace_read
on public.harwick_loop_runs
for select
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = harwick_loop_runs.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin', 'team_lead', 'lead_manager', 'operator', 'agent', 'viewer')
  )
);

drop policy if exists harwick_loop_runs_workspace_manage on public.harwick_loop_runs;
create policy harwick_loop_runs_workspace_manage
on public.harwick_loop_runs
for all
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = harwick_loop_runs.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin', 'team_lead', 'operator')
  )
)
with check (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = harwick_loop_runs.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin', 'team_lead', 'operator')
  )
);
