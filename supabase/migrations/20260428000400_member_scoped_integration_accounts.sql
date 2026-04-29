alter table public.integration_accounts
add column if not exists account_scope text not null default 'workspace'
check (account_scope in ('workspace', 'member'));

alter table public.integration_accounts
add column if not exists owner_member_id uuid references public.workspace_members(id) on delete set null;

alter table public.integration_accounts
drop constraint if exists integration_accounts_scope_owner_check;

alter table public.integration_accounts
add constraint integration_accounts_scope_owner_check
check (
  (account_scope = 'workspace' and owner_member_id is null)
  or (account_scope = 'member' and owner_member_id is not null)
);

create index if not exists integration_accounts_owner_member_idx
on public.integration_accounts (workspace_id, owner_member_id, provider);

create unique index if not exists integration_accounts_provider_account_unique_idx
on public.integration_accounts (workspace_id, provider, provider_account_id)
where provider_account_id is not null;

create policy "workspace members can read own integration accounts"
on public.integration_accounts
for select
to authenticated
using (
  account_scope = 'member'
  and owner_member_id is not null
  and public.is_assigned_agent(workspace_id, owner_member_id)
);

create policy "workspace members can manage own integration accounts"
on public.integration_accounts
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
