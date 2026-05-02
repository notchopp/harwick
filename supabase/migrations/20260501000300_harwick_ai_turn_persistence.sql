create table if not exists public.harwick_ai_turns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  social_reply_review_id uuid references public.social_reply_reviews(id) on delete set null,
  provider_thread_id text,
  channel text not null,
  runtime_input jsonb not null default '{}'::jsonb,
  turn jsonb not null,
  automation_policy jsonb not null default '{}'::jsonb,
  automation_decision jsonb not null default '{}'::jsonb,
  status text not null default 'drafted' check (status in ('drafted', 'auto_executed', 'queued_for_approval', 'blocked', 'failed')),
  confidence numeric not null default 0,
  next_action text not null,
  reply text not null,
  safety_flags text[] not null default '{}',
  missing_fields text[] not null default '{}',
  state_patch jsonb not null default '{}'::jsonb,
  handoff_brief text,
  created_at timestamptz not null default now()
);

create table if not exists public.harwick_ai_tool_calls (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  turn_id uuid not null references public.harwick_ai_turns(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  tool text not null,
  requires_approval boolean not null default false,
  reason text not null,
  payload jsonb not null default '{}'::jsonb,
  policy_status text not null default 'blocked' check (policy_status in ('approved', 'approval_required', 'blocked')),
  execution_status text not null default 'pending' check (execution_status in ('pending', 'executed', 'queued_for_approval', 'missing_handler', 'failed', 'blocked')),
  execution_output jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  executed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists harwick_ai_turns_workspace_created_idx
on public.harwick_ai_turns (workspace_id, created_at desc);

create index if not exists harwick_ai_turns_lead_created_idx
on public.harwick_ai_turns (workspace_id, lead_id, created_at desc)
where lead_id is not null;

create index if not exists harwick_ai_tool_calls_turn_idx
on public.harwick_ai_tool_calls (turn_id, created_at);

alter table public.harwick_ai_turns enable row level security;
alter table public.harwick_ai_tool_calls enable row level security;

drop policy if exists "workspace operators can read harwick ai turns" on public.harwick_ai_turns;
create policy "workspace operators can read harwick ai turns"
on public.harwick_ai_turns
for select
to authenticated
using (
  public.can_manage_workspace_operations(workspace_id)
  or exists (
    select 1
    from public.leads
    where leads.id = harwick_ai_turns.lead_id
      and public.is_assigned_agent(leads.workspace_id, leads.assigned_agent_id)
  )
);

drop policy if exists "workspace operators can manage harwick ai turns" on public.harwick_ai_turns;
create policy "workspace operators can manage harwick ai turns"
on public.harwick_ai_turns
for all
to authenticated
using (public.can_manage_workspace_operations(workspace_id))
with check (public.can_manage_workspace_operations(workspace_id));

drop policy if exists "workspace operators can read harwick ai tool calls" on public.harwick_ai_tool_calls;
create policy "workspace operators can read harwick ai tool calls"
on public.harwick_ai_tool_calls
for select
to authenticated
using (
  public.can_manage_workspace_operations(workspace_id)
  or exists (
    select 1
    from public.harwick_ai_turns
    where harwick_ai_turns.id = harwick_ai_tool_calls.turn_id
      and exists (
        select 1
        from public.leads
        where leads.id = harwick_ai_turns.lead_id
          and public.is_assigned_agent(leads.workspace_id, leads.assigned_agent_id)
      )
  )
);

drop policy if exists "workspace operators can manage harwick ai tool calls" on public.harwick_ai_tool_calls;
create policy "workspace operators can manage harwick ai tool calls"
on public.harwick_ai_tool_calls
for all
to authenticated
using (public.can_manage_workspace_operations(workspace_id))
with check (public.can_manage_workspace_operations(workspace_id));
