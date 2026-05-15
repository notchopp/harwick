create table public.member_routing_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  member_id uuid not null references public.workspace_members(id) on delete cascade,
  role_label text not null check (length(trim(role_label)) between 1 and 80),
  areas jsonb not null check (jsonb_typeof(areas) = 'array'),
  property_types jsonb not null check (jsonb_typeof(property_types) = 'array'),
  lead_types jsonb not null check (jsonb_typeof(lead_types) = 'array'),
  budget_min integer check (budget_min is null or budget_min >= 0),
  budget_max integer check (budget_max is null or budget_max >= 0),
  max_active_leads integer not null check (max_active_leads > 0),
  accepts_new_leads boolean not null default true,
  notification_preference text not null check (notification_preference in ('sms', 'email', 'app')) default 'app',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, member_id)
);

create index idx_member_routing_profiles_workspace_id on public.member_routing_profiles (workspace_id);
create index idx_member_routing_profiles_member_id on public.member_routing_profiles (member_id);
create index idx_member_routing_profiles_accepts_new_leads on public.member_routing_profiles (workspace_id, accepts_new_leads) where accepts_new_leads = true;

alter table public.member_routing_profiles enable row level security;

create policy "workspace members can read routing profiles in their workspace"
  on public.member_routing_profiles
  for select
  using (public.is_workspace_member(workspace_id));

create policy "routing managers can insert routing profiles"
  on public.member_routing_profiles
  for insert
  with check (public.can_manage_workspace_routing(workspace_id));

create policy "routing managers can update routing profiles"
  on public.member_routing_profiles
  for update
  using (public.can_manage_workspace_routing(workspace_id))
  with check (public.can_manage_workspace_routing(workspace_id));

create policy "routing managers can delete routing profiles"
  on public.member_routing_profiles
  for delete
  using (public.can_manage_workspace_routing(workspace_id));

comment on table public.member_routing_profiles is 'Agent routing profiles for lead assignment. Each workspace member can have one profile defining their area coverage, property types, lead types, capacity, and preferences.';
comment on column public.member_routing_profiles.areas is 'Array of area names the agent covers. Routing matches against target_area from leads.';
comment on column public.member_routing_profiles.property_types is 'Array of property types/specialties: single_family, condo, townhome, new_construction, luxury, investment, lease, land.';
comment on column public.member_routing_profiles.lead_types is 'Array of lead types: buyer, seller, renter, investor (not unknown).';
comment on column public.member_routing_profiles.budget_min is 'Minimum budget the agent handles. Null means no minimum.';
comment on column public.member_routing_profiles.budget_max is 'Maximum budget the agent handles. Null means no maximum.';
comment on column public.member_routing_profiles.max_active_leads is 'Maximum number of active leads the agent can handle at once.';
comment on column public.member_routing_profiles.accepts_new_leads is 'Whether the agent is currently accepting new lead assignments.';
comment on column public.member_routing_profiles.notification_preference is 'How the agent prefers to receive notifications: sms, email, or app.';
