create table public.workspace_voice_agents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null check (provider = 'retell'),
  status text not null default 'draft' check (status in ('draft', 'provisioning', 'active', 'needs_sync', 'error', 'disabled')),
  retell_agent_id text,
  retell_conversation_flow_id text,
  retell_phone_number_id text,
  phone_number text,
  template_version text not null default 'realty_voice_v1',
  published_config_hash text,
  webhook_url text,
  dynamic_variables_webhook_url text,
  last_synced_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider),
  unique (retell_agent_id)
);

alter table public.workspace_voice_agents enable row level security;

create policy "workspace admins can read voice agents"
on public.workspace_voice_agents
for select
to authenticated
using (public.is_workspace_admin(workspace_id));

create policy "workspace admins can manage voice agents"
on public.workspace_voice_agents
for all
to authenticated
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

create index workspace_voice_agents_workspace_status_idx
on public.workspace_voice_agents (workspace_id, status);

create index workspace_voice_agents_retell_agent_idx
on public.workspace_voice_agents (retell_agent_id)
where retell_agent_id is not null;
