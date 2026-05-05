create table if not exists public.harwick_subagent_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  trajectory_id uuid references public.agent_trajectories(id) on delete set null,
  step_id uuid references public.agent_steps(id) on delete set null,
  subagent_type text not null check (subagent_type in ('research', 'writer', 'calendar', 'routing')),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  title text not null,
  instructions text not null,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists harwick_subagent_tasks_workspace_status_idx
  on public.harwick_subagent_tasks (workspace_id, status, created_at desc);

create index if not exists harwick_subagent_tasks_lead_idx
  on public.harwick_subagent_tasks (lead_id, created_at desc);

alter table public.harwick_subagent_tasks enable row level security;

drop policy if exists harwick_subagent_tasks_workspace_read on public.harwick_subagent_tasks;
create policy harwick_subagent_tasks_workspace_read
on public.harwick_subagent_tasks
for select
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = harwick_subagent_tasks.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists harwick_subagent_tasks_workspace_manage on public.harwick_subagent_tasks;
create policy harwick_subagent_tasks_workspace_manage
on public.harwick_subagent_tasks
for all
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = harwick_subagent_tasks.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin', 'team_lead', 'lead_manager', 'operator')
  )
)
with check (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = harwick_subagent_tasks.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin', 'team_lead', 'lead_manager', 'operator')
  )
);
