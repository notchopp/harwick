create table if not exists public.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  provider text not null check (provider in ('stripe')),
  provider_event_id text not null check (length(trim(provider_event_id)) > 0),
  event_type text not null check (length(trim(event_type)) > 0),
  provider_object_id text check (provider_object_id is null or length(trim(provider_object_id)) > 0),
  processing_status text not null check (processing_status in ('processing', 'processed', 'ignored', 'failed')),
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

alter table public.billing_webhook_events enable row level security;

create policy "workspace owners can read billing webhook events"
on public.billing_webhook_events
for select
to authenticated
using (
  workspace_id is not null
  and exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = billing_webhook_events.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
      and wm.is_active = true
  )
);

create index if not exists billing_webhook_events_workspace_idx
on public.billing_webhook_events (workspace_id, created_at desc);

create index if not exists billing_webhook_events_provider_object_idx
on public.billing_webhook_events (provider, provider_object_id)
where provider_object_id is not null;
