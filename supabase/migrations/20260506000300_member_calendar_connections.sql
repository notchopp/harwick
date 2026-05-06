create table if not exists public.workspace_member_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  member_id uuid not null references public.workspace_members(id) on delete cascade,
  provider text not null check (provider in ('google')),
  provider_account_email text,
  calendar_id text not null default 'primary' check (length(trim(calendar_id)) > 0),
  status text not null default 'connected' check (status in ('connected', 'error', 'revoked')),
  showing_mode text not null default 'request_approve' check (showing_mode in ('collect_only', 'request_approve', 'auto_book')),
  timezone text not null default 'America/New_York' check (length(trim(timezone)) > 0),
  encrypted_credential_ref text not null check (length(trim(encrypted_credential_ref)) > 0),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, member_id, provider, calendar_id)
);

alter table public.workspace_member_calendar_connections enable row level security;

drop policy if exists "workspace members can read permitted calendar connections"
on public.workspace_member_calendar_connections;

create policy "workspace members can read permitted calendar connections"
on public.workspace_member_calendar_connections
for select
to authenticated
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_member_calendar_connections.workspace_id
      and wm.user_id = auth.uid()
      and wm.is_active = true
      and (
        wm.role in ('owner', 'admin', 'team_lead', 'operator', 'lead_manager')
        or wm.id = workspace_member_calendar_connections.member_id
      )
  )
);

drop policy if exists "workspace admins and connection owners can manage calendar conn"
on public.workspace_member_calendar_connections;

drop policy if exists "calendar connections manage"
on public.workspace_member_calendar_connections;

create policy "calendar connections manage"
on public.workspace_member_calendar_connections
for all
to authenticated
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_member_calendar_connections.workspace_id
      and wm.user_id = auth.uid()
      and wm.is_active = true
      and (wm.role in ('owner', 'admin') or wm.id = workspace_member_calendar_connections.member_id)
  )
)
with check (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_member_calendar_connections.workspace_id
      and wm.user_id = auth.uid()
      and wm.is_active = true
      and (wm.role in ('owner', 'admin') or wm.id = workspace_member_calendar_connections.member_id)
  )
);

create index if not exists member_calendar_connections_member_idx
on public.workspace_member_calendar_connections (workspace_id, member_id, status);
