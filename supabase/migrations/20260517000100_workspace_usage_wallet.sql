-- Wallet-backed usage metering for plan overages.

alter table public.workspace_usage_summaries
drop constraint if exists workspace_usage_summaries_plan_tier_check;

alter table public.workspace_usage_summaries
add constraint workspace_usage_summaries_plan_tier_check
check (plan_tier in ('free', 'solo', 'team', 'brokerage'));

create table if not exists public.workspace_usage_wallet (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  balance_cents integer not null default 0 check (balance_cents >= 0),
  auto_recharge_enabled boolean not null default false,
  auto_recharge_threshold_cents integer not null default 1000 check (auto_recharge_threshold_cents >= 0),
  auto_recharge_amount_cents integer not null default 5000 check (auto_recharge_amount_cents >= 0),
  stripe_payment_method_id text check (stripe_payment_method_id is null or length(trim(stripe_payment_method_id)) > 0),
  last_recharge_at timestamptz,
  low_balance_notified_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  event_type text not null check (
    event_type in ('social_turn', 'voice_minute', 'memory_loop', 'overage_listing', 'overage_seat')
  ),
  unit_count numeric not null check (unit_count > 0),
  retail_cents integer not null default 0 check (retail_cents >= 0),
  cogs_cents integer not null default 0 check (cogs_cents >= 0),
  balance_after_cents integer not null check (balance_after_cents >= 0),
  source_id text check (source_id is null or length(trim(source_id)) > 0),
  idempotency_key text not null check (length(trim(idempotency_key)) > 0),
  event_metadata jsonb,
  created_at timestamptz not null default now(),
  unique (workspace_id, idempotency_key)
);

alter table public.workspace_usage_wallet enable row level security;
alter table public.usage_events enable row level security;

create policy "workspace members can read usage wallet"
on public.workspace_usage_wallet
for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "workspace admins can read usage events"
on public.usage_events
for select
to authenticated
using (public.is_workspace_admin(workspace_id));

create index if not exists usage_events_workspace_occurred_idx
on public.usage_events (workspace_id, occurred_at desc, event_type);

create index if not exists usage_events_workspace_source_idx
on public.usage_events (workspace_id, source_id)
where source_id is not null;

insert into public.workspace_usage_wallet (workspace_id)
select id
from public.workspaces
on conflict (workspace_id) do nothing;

create or replace function public.ensure_workspace_usage_wallet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspace_usage_wallet (workspace_id)
  values (new.id)
  on conflict (workspace_id) do nothing;

  return new;
end;
$$;

drop trigger if exists ensure_workspace_usage_wallet_on_workspace on public.workspaces;

create trigger ensure_workspace_usage_wallet_on_workspace
after insert on public.workspaces
for each row
execute function public.ensure_workspace_usage_wallet();

create or replace view public.monthly_usage_summary
with (security_invoker = true)
as
select
  workspace_id,
  date_trunc('month', occurred_at)::date as month,
  coalesce(sum(unit_count) filter (where event_type = 'social_turn'), 0)::numeric as turns_used,
  coalesce(sum(unit_count) filter (where event_type = 'voice_minute'), 0)::numeric as minutes_used,
  coalesce(sum(unit_count) filter (where event_type = 'memory_loop'), 0)::numeric as memory_loops_used,
  coalesce(sum(unit_count) filter (where event_type = 'overage_listing'), 0)::numeric as overage_listings,
  coalesce(sum(unit_count) filter (where event_type = 'overage_seat'), 0)::numeric as overage_seats,
  coalesce(sum(retail_cents), 0)::integer as retail_cents,
  coalesce(sum(cogs_cents), 0)::integer as cogs_cents,
  (
    array_agg(balance_after_cents order by occurred_at desc, created_at desc)
    filter (where balance_after_cents is not null)
  )[1] as balance_after_cents
from public.usage_events
group by workspace_id, date_trunc('month', occurred_at)::date;
