create table if not exists public.lead_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  task_type text not null check (task_type in ('call_back', 'verify_listing', 'assign_lead', 'fub_retry', 'nurture_review')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'completed', 'dismissed')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  title text not null check (length(trim(title)) > 0),
  description text,
  due_at timestamptz,
  assigned_member_id uuid references public.workspace_members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nurture_enrollments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'opted_out')),
  sequence_key text not null,
  next_action_at timestamptz,
  quiet_hours_timezone text not null default 'America/New_York',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, lead_id, sequence_key)
);

create table if not exists public.listing_facts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source text not null check (source in ('manual', 'idx', 'repliers', 'mls_grid', 'fub', 'website')),
  external_listing_id text,
  mls_number text,
  address text not null check (length(trim(address)) > 0),
  status text,
  price integer check (price is null or price >= 0),
  beds numeric,
  baths numeric,
  has_pool boolean,
  raw_facts jsonb not null default '{}'::jsonb,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.provider_error_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  provider text not null check (provider in ('meta', 'twilio', 'retell', 'follow_up_boss', 'worker')),
  operation text not null check (length(trim(operation)) > 0),
  error_code text not null check (length(trim(error_code)) > 0),
  error_message text,
  retryable boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.worker_heartbeats (
  worker_id text primary key,
  app_env text not null,
  last_seen_at timestamptz not null default now(),
  last_batch jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.lead_tasks enable row level security;
alter table public.nurture_enrollments enable row level security;
alter table public.listing_facts enable row level security;
alter table public.provider_error_logs enable row level security;
alter table public.worker_heartbeats enable row level security;

create policy "workspace members can read lead tasks"
on public.lead_tasks
for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "workspace admins can manage lead tasks"
on public.lead_tasks
for all
to authenticated
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

create policy "workspace admins can read nurture enrollments"
on public.nurture_enrollments
for select
to authenticated
using (public.is_workspace_admin(workspace_id));

create policy "workspace admins can manage nurture enrollments"
on public.nurture_enrollments
for all
to authenticated
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

create policy "workspace members can read listing facts"
on public.listing_facts
for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "workspace admins can manage listing facts"
on public.listing_facts
for all
to authenticated
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

create policy "workspace admins can read provider error logs"
on public.provider_error_logs
for select
to authenticated
using (workspace_id is null or public.is_workspace_admin(workspace_id));

create policy "workspace admins can read worker heartbeats"
on public.worker_heartbeats
for select
to authenticated
using (true);

create index if not exists lead_tasks_workspace_status_idx
on public.lead_tasks (workspace_id, status, priority, created_at desc);

create index if not exists nurture_enrollments_due_idx
on public.nurture_enrollments (status, next_action_at)
where status = 'active';

create index if not exists listing_facts_workspace_lookup_idx
on public.listing_facts (workspace_id, mls_number, address);
