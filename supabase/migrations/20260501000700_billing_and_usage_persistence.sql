-- Workspace subscriptions and billing persistence

create table if not exists public.workspace_subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  plan_tier text not null check (plan_tier in ('solo', 'team', 'brokerage')),
  billing_interval text not null check (billing_interval in ('month', 'year')),
  status text not null check (status in ('active', 'trialing', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused')),
  provider_subscription_id text check (length(trim(provider_subscription_id)) > 0),
  provider_customer_id text check (length(trim(provider_customer_id)) > 0),
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  canceled_at timestamptz,
  cancel_at_period_end boolean not null default false,
  trial_start timestamptz,
  trial_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_period check (current_period_end > current_period_start),
  constraint valid_trial check (
    (trial_start is null and trial_end is null) or
    (trial_start is not null and trial_end is not null and trial_end > trial_start)
  )
);

create table if not exists public.workspace_usage_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_type text not null check (event_type in ('lead_event', 'ai_turn', 'ai_message_sent', 'social_message_sent', 'voice_call_minute', 'listing_created')),
  event_count integer not null check (event_count >= 0),
  resource_id uuid,
  event_metadata jsonb,
  billing_period_start timestamptz not null,
  billing_period_end timestamptz not null,
  created_at timestamptz not null default now(),
  constraint valid_billing_period check (billing_period_end > billing_period_start)
);

create table if not exists public.workspace_usage_summaries (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  plan_tier text not null check (plan_tier in ('solo', 'team', 'brokerage')),
  billing_period_start timestamptz not null,
  billing_period_end timestamptz not null,
  lead_event_count integer not null default 0 check (lead_event_count >= 0),
  ai_turn_count integer not null default 0 check (ai_turn_count >= 0),
  ai_message_sent_count integer not null default 0 check (ai_message_sent_count >= 0),
  social_message_sent_count integer not null default 0 check (social_message_sent_count >= 0),
  voice_call_minutes numeric not null default 0 check (voice_call_minutes >= 0),
  listing_count integer not null default 0 check (listing_count >= 0),
  active_seat_count integer not null default 0 check (active_seat_count >= 0),
  active_integration_account_count integer not null default 0 check (active_integration_account_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, billing_period_start),
  constraint valid_billing_period check (billing_period_end > billing_period_start)
);

alter table public.workspace_subscriptions enable row level security;
alter table public.workspace_usage_events enable row level security;
alter table public.workspace_usage_summaries enable row level security;

create policy "workspace owners can read subscription"
on public.workspace_subscriptions
for select
to authenticated
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_subscriptions.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
      and wm.is_active = true
  )
);

create policy "workspace owners can manage subscription"
on public.workspace_subscriptions
for all
to authenticated
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_subscriptions.workspace_id
      and wm.user_id = auth.uid()
      and wm.role = 'owner'
      and wm.is_active = true
  )
)
with check (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_subscriptions.workspace_id
      and wm.user_id = auth.uid()
      and wm.role = 'owner'
      and wm.is_active = true
  )
);

create policy "workspace admins can read usage events"
on public.workspace_usage_events
for select
to authenticated
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_usage_events.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
      and wm.is_active = true
  )
);

create policy "workspace admins can read usage summaries"
on public.workspace_usage_summaries
for select
to authenticated
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_usage_summaries.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
      and wm.is_active = true
  )
);

create index if not exists workspace_subscriptions_workspace_idx
on public.workspace_subscriptions (workspace_id, status);

create index if not exists workspace_subscriptions_provider_idx
on public.workspace_subscriptions (provider_subscription_id)
where provider_subscription_id is not null;

create index if not exists workspace_usage_events_workspace_period_idx
on public.workspace_usage_events (workspace_id, billing_period_start, event_type);

create index if not exists workspace_usage_events_created_idx
on public.workspace_usage_events (created_at desc);

create index if not exists workspace_usage_summaries_workspace_period_idx
on public.workspace_usage_summaries (workspace_id, billing_period_start desc);

create or replace function public.upsert_usage_summary(
  p_workspace_id uuid,
  p_plan_tier text,
  p_billing_period_start timestamptz,
  p_billing_period_end timestamptz
)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.workspace_usage_summaries (
    workspace_id,
    plan_tier,
    billing_period_start,
    billing_period_end,
    lead_event_count,
    ai_turn_count,
    ai_message_sent_count,
    social_message_sent_count,
    voice_call_minutes,
    listing_count,
    active_seat_count,
    active_integration_account_count,
    created_at,
    updated_at
  )
  select
    p_workspace_id,
    p_plan_tier,
    p_billing_period_start,
    p_billing_period_end,
    coalesce(sum(case when event_type = 'lead_event' then event_count else 0 end), 0) as lead_event_count,
    coalesce(sum(case when event_type = 'ai_turn' then event_count else 0 end), 0) as ai_turn_count,
    coalesce(sum(case when event_type = 'ai_message_sent' then event_count else 0 end), 0) as ai_message_sent_count,
    coalesce(sum(case when event_type = 'social_message_sent' then event_count else 0 end), 0) as social_message_sent_count,
    coalesce(sum(case when event_type = 'voice_call_minute' then event_count else 0 end), 0) as voice_call_minutes,
    (select count(*) from public.listings where workspace_id = p_workspace_id and status != 'archived') as listing_count,
    (select count(*) from public.workspace_members where workspace_id = p_workspace_id and is_active = true) as active_seat_count,
    (select count(*) from public.integration_accounts where workspace_id = p_workspace_id and status in ('connected', 'pending')) as active_integration_account_count,
    now(),
    now()
  from public.workspace_usage_events
  where workspace_id = p_workspace_id
    and billing_period_start = p_billing_period_start
  on conflict (workspace_id, billing_period_start)
  do update set
    lead_event_count = excluded.lead_event_count,
    ai_turn_count = excluded.ai_turn_count,
    ai_message_sent_count = excluded.ai_message_sent_count,
    social_message_sent_count = excluded.social_message_sent_count,
    voice_call_minutes = excluded.voice_call_minutes,
    listing_count = excluded.listing_count,
    active_seat_count = excluded.active_seat_count,
    active_integration_account_count = excluded.active_integration_account_count,
    updated_at = now();
end;
$$;
