-- Harwick work items are the durable dashboard feed: who should see what,
-- why it matters, what action is recommended, and which agent step produced
-- the recommendation. Routing decisions keep assignment explanations and
-- future approve/reassign/dismiss corrections as training signal.

create table if not exists public.harwick_routing_decisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  trajectory_id uuid references public.agent_trajectories(id) on delete set null,
  step_id uuid references public.agent_steps(id) on delete set null,
  suggested_member_id uuid references public.workspace_members(id) on delete set null,
  final_member_id uuid references public.workspace_members(id) on delete set null,
  status text not null default 'suggested' check (
    status in ('suggested', 'approved', 'overridden', 'assigned', 'dismissed')
  ),
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  reason text not null,
  evidence jsonb not null default '{}'::jsonb,
  created_by_actor_type text not null check (created_by_actor_type in ('ai', 'member', 'system')),
  decided_by_member_id uuid references public.workspace_members(id) on delete set null,
  decided_at timestamptz,
  override_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists harwick_routing_decisions_workspace_created_idx
  on public.harwick_routing_decisions (workspace_id, created_at desc);

create index if not exists harwick_routing_decisions_lead_idx
  on public.harwick_routing_decisions (lead_id, created_at desc);

create index if not exists harwick_routing_decisions_status_idx
  on public.harwick_routing_decisions (workspace_id, status, created_at desc);

create table if not exists public.harwick_work_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  routing_decision_id uuid references public.harwick_routing_decisions(id) on delete set null,
  trajectory_id uuid references public.agent_trajectories(id) on delete set null,
  step_id uuid references public.agent_steps(id) on delete set null,
  item_type text not null check (item_type in ('work_item', 'approval', 'alert', 'insight', 'status')),
  status text not null default 'pending' check (
    status in ('pending', 'surfaced', 'seen', 'approved', 'reassigned', 'dismissed', 'completed', 'expired')
  ),
  target_member_id uuid references public.workspace_members(id) on delete set null,
  target_role text check (
    target_role is null
    or target_role in ('owner', 'admin', 'team_lead', 'lead_manager', 'operator', 'agent', 'viewer')
  ),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  title text not null,
  summary text not null,
  recommended_action text not null,
  reason text not null,
  payload jsonb not null default '{}'::jsonb,
  due_at timestamptz,
  surfaced_at timestamptz,
  seen_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (target_member_id is not null or target_role is not null)
);

create index if not exists harwick_work_items_workspace_status_idx
  on public.harwick_work_items (workspace_id, status, priority, created_at desc);

create index if not exists harwick_work_items_target_member_idx
  on public.harwick_work_items (workspace_id, target_member_id, status, priority, created_at desc);

create index if not exists harwick_work_items_target_role_idx
  on public.harwick_work_items (workspace_id, target_role, status, priority, created_at desc);

create index if not exists harwick_work_items_lead_idx
  on public.harwick_work_items (lead_id, created_at desc);

alter table public.harwick_routing_decisions enable row level security;
alter table public.harwick_work_items enable row level security;

drop policy if exists harwick_routing_decisions_workspace_read on public.harwick_routing_decisions;
create policy harwick_routing_decisions_workspace_read
on public.harwick_routing_decisions
for select using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = harwick_routing_decisions.workspace_id
      and wm.user_id = auth.uid()
      and (
        wm.role in ('owner', 'admin', 'team_lead', 'lead_manager', 'operator', 'viewer')
        or wm.id = harwick_routing_decisions.suggested_member_id
        or wm.id = harwick_routing_decisions.final_member_id
        or exists (
          select 1
          from public.leads l
          where l.id = harwick_routing_decisions.lead_id
            and l.assigned_agent_id = wm.id
        )
      )
  )
);

drop policy if exists harwick_routing_decisions_workspace_manage on public.harwick_routing_decisions;
create policy harwick_routing_decisions_workspace_manage
on public.harwick_routing_decisions
for all using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = harwick_routing_decisions.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin', 'team_lead', 'lead_manager', 'operator')
  )
)
with check (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = harwick_routing_decisions.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin', 'team_lead', 'lead_manager', 'operator')
  )
);

drop policy if exists harwick_work_items_workspace_read on public.harwick_work_items;
create policy harwick_work_items_workspace_read
on public.harwick_work_items
for select using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = harwick_work_items.workspace_id
      and wm.user_id = auth.uid()
      and (
        wm.role in ('owner', 'admin', 'team_lead', 'lead_manager', 'operator', 'viewer')
        or wm.id = harwick_work_items.target_member_id
        or wm.role = harwick_work_items.target_role
        or exists (
          select 1
          from public.leads l
          where harwick_work_items.lead_id is not null
            and l.id = harwick_work_items.lead_id
            and l.assigned_agent_id = wm.id
        )
      )
  )
);

drop policy if exists harwick_work_items_workspace_manage on public.harwick_work_items;
create policy harwick_work_items_workspace_manage
on public.harwick_work_items
for all using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = harwick_work_items.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin', 'team_lead', 'lead_manager', 'operator')
  )
)
with check (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = harwick_work_items.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin', 'team_lead', 'lead_manager', 'operator')
  )
);
