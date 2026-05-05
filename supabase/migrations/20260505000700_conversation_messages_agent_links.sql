-- Two purposes: (1) ensure conversation_messages exists in prod since the
-- earlier migration 20260502000200 was authored but never applied to the
-- ocuaacjexbnjukzkjnpl project; (2) link every conversation_message to the
-- agent step that produced it so inline operator tags point at the exact
-- (state, action) pair the model emitted.

create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sender_type text not null check (sender_type in ('customer', 'ai', 'operator')),
  sender_id text,
  body text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  status text default 'sent' check (status in ('sent', 'in_progress', 'failed')),
  source_channel text,
  provider_message_id text,
  error_code text,
  error_message text,
  agent_trajectory_id uuid references public.agent_trajectories(id) on delete set null,
  agent_step_id uuid references public.agent_steps(id) on delete set null
);

alter table public.conversation_messages enable row level security;

drop policy if exists conversation_messages_read_workspace on public.conversation_messages;
create policy conversation_messages_read_workspace on public.conversation_messages
  for select using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );

drop policy if exists conversation_messages_insert_workspace on public.conversation_messages;
create policy conversation_messages_insert_workspace on public.conversation_messages
  for insert with check (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );

alter table public.conversation_messages replica identity full;

create index if not exists idx_conversation_messages_lead_id on public.conversation_messages(lead_id);
create index if not exists idx_conversation_messages_workspace_id on public.conversation_messages(workspace_id);
create index if not exists idx_conversation_messages_created_at on public.conversation_messages(created_at desc);
create index if not exists idx_conversation_messages_provider_id on public.conversation_messages(provider_message_id) where provider_message_id is not null;
create index if not exists idx_conversation_messages_agent_step on public.conversation_messages(agent_step_id) where agent_step_id is not null;

-- For projects that already have the table, add the agent-link columns idempotently.
alter table public.conversation_messages
  add column if not exists agent_trajectory_id uuid references public.agent_trajectories(id) on delete set null,
  add column if not exists agent_step_id uuid references public.agent_steps(id) on delete set null;
