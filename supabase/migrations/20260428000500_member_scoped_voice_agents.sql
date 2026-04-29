alter table public.workspace_voice_agents
add column if not exists account_scope text not null default 'workspace'
check (account_scope in ('workspace', 'member'));

alter table public.workspace_voice_agents
add column if not exists owner_member_id uuid references public.workspace_members(id) on delete set null;

alter table public.workspace_voice_agents
drop constraint if exists workspace_voice_agents_scope_owner_check;

alter table public.workspace_voice_agents
add constraint workspace_voice_agents_scope_owner_check
check (
  (account_scope = 'workspace' and owner_member_id is null)
  or (account_scope = 'member' and owner_member_id is not null)
);

alter table public.workspace_voice_agents
drop constraint if exists workspace_voice_agents_workspace_id_provider_key;

create unique index if not exists workspace_voice_agents_workspace_scope_unique_idx
on public.workspace_voice_agents (workspace_id, provider)
where account_scope = 'workspace' and owner_member_id is null;

create unique index if not exists workspace_voice_agents_member_scope_unique_idx
on public.workspace_voice_agents (workspace_id, provider, owner_member_id)
where account_scope = 'member' and owner_member_id is not null;

create index if not exists workspace_voice_agents_owner_member_idx
on public.workspace_voice_agents (workspace_id, owner_member_id, status);

create policy "workspace members can read own voice agents"
on public.workspace_voice_agents
for select
to authenticated
using (
  account_scope = 'member'
  and owner_member_id is not null
  and public.is_assigned_agent(workspace_id, owner_member_id)
);

create policy "workspace members can manage own voice agents"
on public.workspace_voice_agents
for all
to authenticated
using (
  account_scope = 'member'
  and owner_member_id is not null
  and public.is_assigned_agent(workspace_id, owner_member_id)
)
with check (
  account_scope = 'member'
  and owner_member_id is not null
  and public.is_assigned_agent(workspace_id, owner_member_id)
);
