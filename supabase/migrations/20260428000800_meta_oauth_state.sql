alter table public.integration_accounts
add column if not exists oauth_state text;

create index if not exists integration_accounts_oauth_state_idx
on public.integration_accounts (oauth_state)
where oauth_state is not null;
