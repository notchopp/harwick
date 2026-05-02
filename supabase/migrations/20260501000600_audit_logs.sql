create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  actor_type text not null check (actor_type in ('user', 'ai', 'system')),
  action text not null,
  resource_type text not null,
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_workspace_created_idx
on public.audit_logs (workspace_id, created_at desc);

create index if not exists audit_logs_action_idx
on public.audit_logs (action, created_at desc);

create index if not exists audit_logs_resource_idx
on public.audit_logs (resource_type, resource_id, created_at desc)
where resource_id is not null;

create index if not exists audit_logs_user_idx
on public.audit_logs (workspace_id, user_id, created_at desc)
where user_id is not null;

alter table public.audit_logs enable row level security;

create policy "workspace admins can read audit logs"
on public.audit_logs
for select
to authenticated
using (public.is_workspace_admin(workspace_id));

create policy "workspace admins can insert audit logs"
on public.audit_logs
for insert
to authenticated
with check (public.is_workspace_admin(workspace_id));
