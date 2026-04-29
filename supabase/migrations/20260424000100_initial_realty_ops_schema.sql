create extension if not exists "pgcrypto";

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'lead_manager', 'agent')),
  display_name text not null check (length(trim(display_name)) > 0),
  email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table public.integration_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null check (provider in ('meta', 'twilio', 'retell', 'follow_up_boss')),
  status text not null check (status in ('pending', 'connected', 'needs_reauth', 'disabled', 'error')),
  provider_account_id text,
  provider_account_name text,
  encrypted_credential_ref text,
  connected_at timestamptz,
  last_health_check_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  status text not null check (status in ('new', 'engaged', 'qualified', 'hot', 'assigned', 'nurture', 'appointment_booked', 'active_client', 'closed_won', 'closed_lost', 'archived')),
  source_channel text not null check (source_channel in ('instagram_dm', 'instagram_comment', 'call', 'sms', 'manual', 'csv_import')),
  source_provider_id text,
  source_post_id text,
  source_comment_id text,
  instagram_user_id text,
  instagram_username text,
  full_name text,
  phone text,
  email text,
  lead_type text not null check (lead_type in ('buyer', 'seller', 'renter', 'investor', 'unknown')),
  intent text not null check (intent in ('high', 'medium', 'low', 'spam', 'unknown')),
  timeline text,
  budget_min integer check (budget_min is null or budget_min >= 0),
  budget_max integer check (budget_max is null or budget_max >= 0),
  target_area text,
  financing_status text not null check (financing_status in ('preapproved', 'cash', 'needs_lender', 'unknown')),
  score integer not null default 0 check (score >= 0 and score <= 100),
  assigned_agent_id uuid references public.workspace_members(id),
  follow_up_boss_contact_id text,
  last_message_at timestamptz,
  next_followup_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lead_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  provider text not null check (provider in ('meta', 'twilio', 'retell', 'follow_up_boss', 'manual')),
  event_type text not null,
  source_channel text not null,
  provider_event_id text not null,
  provider_account_id text,
  provider_user_id text,
  source_post_id text,
  source_comment_id text,
  text text,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, provider, provider_event_id)
);

create table public.crm_sync_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  provider text not null check (provider = 'follow_up_boss'),
  status text not null check (status in ('queued', 'synced', 'failed', 'skipped')),
  provider_contact_id text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error_code text,
  last_error_message text,
  next_retry_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.integration_accounts enable row level security;
alter table public.leads enable row level security;
alter table public.lead_events enable row level security;
alter table public.crm_sync_logs enable row level security;

create function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = auth.uid()
      and is_active = true
  );
$$;

create function public.is_workspace_admin(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = auth.uid()
      and is_active = true
      and role in ('owner', 'admin', 'lead_manager')
  );
$$;

create function public.is_assigned_agent(target_workspace_id uuid, target_agent_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members
    where id = target_agent_id
      and workspace_id = target_workspace_id
      and user_id = auth.uid()
      and is_active = true
  );
$$;

create policy "workspace members can read workspaces"
on public.workspaces
for select
to authenticated
using (public.is_workspace_member(id));

create policy "workspace admins can update workspaces"
on public.workspaces
for update
to authenticated
using (public.is_workspace_admin(id))
with check (public.is_workspace_admin(id));

create policy "workspace members can read membership"
on public.workspace_members
for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "workspace admins can manage members"
on public.workspace_members
for all
to authenticated
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

create policy "workspace admins can read integration accounts"
on public.integration_accounts
for select
to authenticated
using (public.is_workspace_admin(workspace_id));

create policy "workspace admins can manage integration accounts"
on public.integration_accounts
for all
to authenticated
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

create policy "workspace members can read visible leads"
on public.leads
for select
to authenticated
using (
  public.is_workspace_admin(workspace_id)
  or public.is_assigned_agent(workspace_id, assigned_agent_id)
);

create policy "workspace admins can manage leads"
on public.leads
for all
to authenticated
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

create policy "assigned agents can update assigned leads"
on public.leads
for update
to authenticated
using (public.is_assigned_agent(workspace_id, assigned_agent_id))
with check (public.is_assigned_agent(workspace_id, assigned_agent_id));

create policy "workspace members can read visible lead events"
on public.lead_events
for select
to authenticated
using (
  public.is_workspace_admin(workspace_id)
  or exists (
    select 1
    from public.leads
    where leads.id = lead_events.lead_id
      and public.is_assigned_agent(leads.workspace_id, leads.assigned_agent_id)
  )
);

create policy "workspace admins can manage lead events"
on public.lead_events
for all
to authenticated
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

create policy "workspace admins can read crm sync logs"
on public.crm_sync_logs
for select
to authenticated
using (public.is_workspace_admin(workspace_id));

create policy "workspace admins can manage crm sync logs"
on public.crm_sync_logs
for all
to authenticated
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

create index leads_workspace_status_idx on public.leads (workspace_id, status);
create index lead_events_workspace_provider_idx on public.lead_events (workspace_id, provider, provider_event_id);
create index crm_sync_logs_workspace_status_idx on public.crm_sync_logs (workspace_id, status);
