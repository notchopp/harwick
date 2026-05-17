-- Add per-member scoping to harwick_loops. When owner_member_id is set, the
-- loop is "personal" — only the owner sees it on read, and only the owner (or
-- workspace admins/team_leads) can manage it. When null, the loop is workspace-
-- wide and visible to all members per the existing policy. This lets Harwick
-- create both personal lookout loops ("watch MY leads weekly") and shared ones
-- ("daily market research for the team") without inventing a separate table.

alter table public.harwick_loops
  add column if not exists owner_member_id uuid references public.workspace_members(id) on delete set null;

create index if not exists harwick_loops_owner_idx
  on public.harwick_loops (workspace_id, owner_member_id)
  where owner_member_id is not null;

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
      and (
        -- Workspace-scoped loops are visible to everyone
        harwick_loops.owner_member_id is null
        -- Personal loops are visible to the owner
        or harwick_loops.owner_member_id = wm.id
        -- Admins/owners/team_leads can see all loops for management
        or wm.role in ('owner', 'admin', 'team_lead')
      )
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
      and (
        -- Workspace admins manage everything
        wm.role in ('owner', 'admin', 'team_lead')
        -- Members manage their own personal loops
        or (harwick_loops.owner_member_id is not null and harwick_loops.owner_member_id = wm.id)
      )
  )
)
with check (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = harwick_loops.workspace_id
      and wm.user_id = auth.uid()
      and (
        wm.role in ('owner', 'admin', 'team_lead')
        or (harwick_loops.owner_member_id is not null and harwick_loops.owner_member_id = wm.id)
      )
  )
);

-- Loop runs visibility piggybacks on loop visibility.
drop policy if exists harwick_loop_runs_workspace_read on public.harwick_loop_runs;
create policy harwick_loop_runs_workspace_read
on public.harwick_loop_runs
for select
using (
  exists (
    select 1
    from public.workspace_members wm
    join public.harwick_loops hl on hl.id = harwick_loop_runs.loop_id
    where wm.workspace_id = harwick_loop_runs.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin', 'team_lead', 'lead_manager', 'operator', 'agent', 'viewer')
      and (
        hl.owner_member_id is null
        or hl.owner_member_id = wm.id
        or wm.role in ('owner', 'admin', 'team_lead')
      )
  )
);
