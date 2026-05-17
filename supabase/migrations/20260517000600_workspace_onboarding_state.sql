-- Onboarding state for the conversational setup at /onboarding/setup.
-- Three tables:
--   workspace_onboarding_state — which beats this workspace has completed
--   workspace_reply_examples   — past message samples Harwick uses for voice matching
--   workspace_channel_intents  — which channels this workspace plans to use + the
--                                default automation mode the operator wants per channel

create table if not exists public.workspace_onboarding_state (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  identity_done boolean not null default false,
  reply_examples_done boolean not null default false,
  channel_intent_done boolean not null default false,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.workspace_onboarding_state enable row level security;

create policy "workspace_onboarding_state_member_select"
  on public.workspace_onboarding_state
  for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_onboarding_state.workspace_id
        and wm.user_id = auth.uid()
        and wm.is_active = true
    )
  );

-- Writes go through the service role from the onboarding tool handlers.

create table if not exists public.workspace_reply_examples (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  body text not null check (length(trim(body)) >= 8 and length(body) <= 8000),
  source text not null default 'onboarding_paste'
    check (source in ('onboarding_paste', 'onboarding_screenshot', 'onboarding_picked', 'imported')),
  captured_at timestamptz not null default now()
);

create index if not exists workspace_reply_examples_workspace_idx
  on public.workspace_reply_examples (workspace_id, captured_at desc);

alter table public.workspace_reply_examples enable row level security;

create policy "workspace_reply_examples_member_select"
  on public.workspace_reply_examples
  for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_reply_examples.workspace_id
        and wm.user_id = auth.uid()
        and wm.is_active = true
    )
  );

create table if not exists public.workspace_channel_intents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  channel text not null check (channel in ('instagram', 'facebook', 'sms', 'voice', 'website')),
  desired_mode text not null check (desired_mode in ('suggest_only', 'approval_first', 'auto_send')),
  notes text check (notes is null or length(notes) <= 500),
  created_at timestamptz not null default now(),
  unique (workspace_id, channel)
);

create index if not exists workspace_channel_intents_workspace_idx
  on public.workspace_channel_intents (workspace_id);

alter table public.workspace_channel_intents enable row level security;

create policy "workspace_channel_intents_member_select"
  on public.workspace_channel_intents
  for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_channel_intents.workspace_id
        and wm.user_id = auth.uid()
        and wm.is_active = true
    )
  );

-- Auto-create an onboarding state row when a workspace is created so the
-- /onboarding/setup landing read always finds a row.
create or replace function public.bootstrap_workspace_onboarding_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspace_onboarding_state (workspace_id)
  values (new.id)
  on conflict (workspace_id) do nothing;
  return new;
end;
$$;

drop trigger if exists workspaces_bootstrap_onboarding_state on public.workspaces;
create trigger workspaces_bootstrap_onboarding_state
  after insert on public.workspaces
  for each row
  execute function public.bootstrap_workspace_onboarding_state();
