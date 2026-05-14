-- Real persistence for the Harwick rail chat + workspace channels.
-- Replaces the localStorage chat/channels facade.
--
-- harwick_chat_threads: one row per rail chat. Stores title + activity timestamps.
--   The existing agent_trajectories.thread_id (text) keys against this table's id.
--
-- harwick_channels / harwick_channel_members / harwick_channel_messages:
--   Real collaborative workspace rooms. Members of a channel see its messages.
--   Harwick can author messages (author_kind='harwick'). System events for joins/leaves
--   use author_kind='system'. Real-time follow-up will use Supabase Realtime on
--   harwick_channel_messages once we move past polling.

create table if not exists public.harwick_chat_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by_member_id uuid references public.workspace_members(id) on delete set null,
  title text not null default 'New chat' check (length(trim(title)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz,
  archived_at timestamptz
);

create index if not exists harwick_chat_threads_workspace_idx
  on public.harwick_chat_threads (workspace_id, archived_at, updated_at desc);

alter table public.harwick_chat_threads enable row level security;

create policy "workspace members can read chat threads"
  on public.harwick_chat_threads
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "workspace members can create chat threads"
  on public.harwick_chat_threads
  for insert
  to authenticated
  with check (public.is_workspace_member(workspace_id));

create policy "workspace members can update chat threads"
  on public.harwick_chat_threads
  for update
  to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create table if not exists public.harwick_channels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('channel', 'dm', 'group')),
  name text not null check (length(trim(name)) > 0),
  description text,
  created_by_member_id uuid references public.workspace_members(id) on delete set null,
  created_by_kind text not null default 'member' check (created_by_kind in ('member', 'harwick')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz,
  archived_at timestamptz
);

create index if not exists harwick_channels_workspace_idx
  on public.harwick_channels (workspace_id, archived_at, last_message_at desc nulls last);

alter table public.harwick_channels enable row level security;

create table if not exists public.harwick_channel_members (
  channel_id uuid not null references public.harwick_channels(id) on delete cascade,
  member_id uuid not null references public.workspace_members(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  notification_pref text not null default 'all' check (notification_pref in ('all', 'mentions', 'none')),
  primary key (channel_id, member_id)
);

create index if not exists harwick_channel_members_member_idx
  on public.harwick_channel_members (member_id, channel_id);

alter table public.harwick_channel_members enable row level security;

create table if not exists public.harwick_channel_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.harwick_channels(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  author_kind text not null check (author_kind in ('member', 'harwick', 'system')),
  author_member_id uuid references public.workspace_members(id) on delete set null,
  body text not null check (length(trim(body)) > 0),
  metadata jsonb not null default '{}'::jsonb,
  mentions_harwick boolean not null default false,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

create index if not exists harwick_channel_messages_channel_idx
  on public.harwick_channel_messages (channel_id, created_at desc);

create index if not exists harwick_channel_messages_harwick_mentions_idx
  on public.harwick_channel_messages (workspace_id, created_at desc)
  where mentions_harwick = true and deleted_at is null;

alter table public.harwick_channel_messages enable row level security;

-- Helper: am I a member of this channel? (mirrors is_workspace_member pattern.)
create or replace function public.is_channel_member(target_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.harwick_channel_members cm
    join public.workspace_members wm on wm.id = cm.member_id
    where cm.channel_id = target_channel_id
      and wm.user_id = auth.uid()
      and wm.is_active = true
  );
$$;

create policy "channel members can read channels"
  on public.harwick_channels
  for select
  to authenticated
  using (public.is_channel_member(id));

create policy "workspace members can create channels"
  on public.harwick_channels
  for insert
  to authenticated
  with check (public.is_workspace_member(workspace_id));

create policy "channel members can update channels"
  on public.harwick_channels
  for update
  to authenticated
  using (public.is_channel_member(id))
  with check (public.is_channel_member(id));

create policy "channel members can read membership"
  on public.harwick_channel_members
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "channel members can manage membership"
  on public.harwick_channel_members
  for all
  to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy "channel members can read messages"
  on public.harwick_channel_messages
  for select
  to authenticated
  using (public.is_channel_member(channel_id));

create policy "channel members can post messages"
  on public.harwick_channel_messages
  for insert
  to authenticated
  with check (
    public.is_channel_member(channel_id)
    and (author_kind = 'member' or author_kind = 'system')
  );

-- Realtime: opt the messages table into supabase_realtime publication so clients
-- can subscribe to channel rooms.
alter publication supabase_realtime add table public.harwick_channel_messages;
alter publication supabase_realtime add table public.harwick_channels;
