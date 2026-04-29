create table if not exists public.voice_lead_handoffs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  call_id text,
  retell_agent_id text,
  phone text,
  caller_name text,
  lead_type text not null check (lead_type in ('buyer', 'seller', 'renter', 'investor', 'unknown')),
  target_area text,
  timeline text,
  budget text,
  financing_status text not null check (financing_status in ('preapproved', 'cash', 'needs_lender', 'unknown')),
  urgency text not null check (urgency in ('routine', 'hot', 'needs_handoff')),
  summary text not null check (length(trim(summary)) > 0),
  status text not null default 'captured' check (status in ('captured', 'queued', 'synced', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.voice_lead_handoffs enable row level security;

create policy "workspace admins can read voice lead handoffs"
on public.voice_lead_handoffs
for select
to authenticated
using (public.is_workspace_admin(workspace_id));

create policy "workspace admins can manage voice lead handoffs"
on public.voice_lead_handoffs
for all
to authenticated
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

create index if not exists voice_lead_handoffs_workspace_status_idx
on public.voice_lead_handoffs (workspace_id, status);

create index if not exists voice_lead_handoffs_lead_id_idx
on public.voice_lead_handoffs (lead_id);
