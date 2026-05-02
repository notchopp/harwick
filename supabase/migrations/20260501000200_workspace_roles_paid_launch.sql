alter table public.workspace_members
drop constraint if exists workspace_members_role_check;

alter table public.workspace_members
add constraint workspace_members_role_check
check (role in ('owner', 'admin', 'team_lead', 'lead_manager', 'operator', 'agent', 'viewer'));

create or replace function public.is_workspace_admin(target_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = auth.uid()
      and is_active = true
      and role in ('owner', 'admin')
  );
$$;

create or replace function public.can_manage_workspace_operations(target_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = auth.uid()
      and is_active = true
      and role in ('owner', 'admin', 'team_lead', 'lead_manager', 'operator')
  );
$$;

create or replace function public.can_manage_workspace_routing(target_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = auth.uid()
      and is_active = true
      and role in ('owner', 'admin', 'team_lead', 'lead_manager')
  );
$$;
