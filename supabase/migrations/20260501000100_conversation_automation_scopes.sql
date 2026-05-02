create table if not exists public.conversation_automation_states (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  provider_account_id text not null,
  recipient_user_id text,
  channel text not null check (channel in ('instagram_dm', 'instagram_comment', 'facebook_dm', 'facebook_comment')),
  automation_mode text not null default 'ai_on'
    check (automation_mode in ('ai_on', 'human_takeover', 'paused_by_rule')),
  automation_reason text,
  changed_by_member_id uuid references public.workspace_members(id),
  changed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists conversation_automation_states_workspace_lead_idx
on public.conversation_automation_states (workspace_id, lead_id)
where lead_id is not null;

create unique index if not exists conversation_automation_states_workspace_provider_thread_idx
on public.conversation_automation_states (
  workspace_id,
  provider_account_id,
  coalesce(recipient_user_id, ''),
  channel
)
where lead_id is null;

create index if not exists conversation_automation_states_workspace_mode_idx
on public.conversation_automation_states (workspace_id, automation_mode, updated_at desc);

alter table public.conversation_automation_states enable row level security;

create policy "workspace members can read conversation automation states"
on public.conversation_automation_states
for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "workspace members can manage conversation automation states"
on public.conversation_automation_states
for all
to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));
