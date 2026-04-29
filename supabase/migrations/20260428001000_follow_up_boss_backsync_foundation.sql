create table if not exists public.follow_up_boss_webhook_subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  integration_account_id uuid not null references public.integration_accounts(id) on delete cascade,
  event_type text not null check (event_type in ('peopleUpdated', 'peopleStageUpdated', 'notesCreated', 'tasksCreated', 'textMessagesCreated', 'callsCreated')),
  status text not null default 'pending' check (status in ('pending', 'active', 'error', 'disabled')),
  provider_webhook_id text,
  callback_token text not null unique check (length(trim(callback_token)) >= 16),
  system_name text not null check (length(trim(system_name)) > 0),
  encrypted_system_key_ref text not null check (length(trim(encrypted_system_key_ref)) > 0),
  last_registered_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, integration_account_id, event_type)
);

create table if not exists public.crm_backsync_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null check (provider = 'follow_up_boss'),
  subscription_id uuid not null references public.follow_up_boss_webhook_subscriptions(id) on delete cascade,
  provider_event_id text not null check (length(trim(provider_event_id)) > 0),
  event_type text not null check (event_type in ('peopleUpdated', 'peopleStageUpdated', 'notesCreated', 'tasksCreated', 'textMessagesCreated', 'callsCreated')),
  resource_ids bigint[] not null default '{}'::bigint[],
  resource_uri text,
  event_created_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed', 'ignored')),
  correlated_sync_log_id uuid references public.crm_sync_logs(id) on delete set null,
  processed_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider, provider_event_id)
);

alter table public.crm_sync_logs
add column if not exists last_outbound_at timestamptz;

alter table public.crm_sync_logs
add column if not exists backsync_suppressed_until timestamptz;

alter table public.follow_up_boss_webhook_subscriptions enable row level security;
alter table public.crm_backsync_events enable row level security;

create policy "workspace admins can read fub webhook subscriptions"
on public.follow_up_boss_webhook_subscriptions
for select
to authenticated
using (public.is_workspace_admin(workspace_id));

create policy "workspace admins can manage fub webhook subscriptions"
on public.follow_up_boss_webhook_subscriptions
for all
to authenticated
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

create policy "workspace admins can read crm backsync events"
on public.crm_backsync_events
for select
to authenticated
using (public.is_workspace_admin(workspace_id));

create policy "workspace admins can manage crm backsync events"
on public.crm_backsync_events
for all
to authenticated
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

create index if not exists fub_webhook_subscriptions_workspace_event_idx
on public.follow_up_boss_webhook_subscriptions (workspace_id, event_type, status);

create index if not exists fub_webhook_subscriptions_callback_token_idx
on public.follow_up_boss_webhook_subscriptions (callback_token);

create index if not exists crm_backsync_events_workspace_status_idx
on public.crm_backsync_events (workspace_id, status, created_at desc);

create index if not exists crm_backsync_events_subscription_idx
on public.crm_backsync_events (subscription_id, event_created_at desc);

create index if not exists crm_sync_logs_provider_contact_suppression_idx
on public.crm_sync_logs (workspace_id, provider, provider_contact_id, backsync_suppressed_until desc);
