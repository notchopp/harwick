alter table public.workspace_members
add column if not exists avatar_url text,
add column if not exists role_label text,
add column if not exists presence_status text check (presence_status in ('online', 'in_call', 'away')),
add column if not exists presence_last_seen_at timestamptz;

create index if not exists workspace_members_presence_idx
on public.workspace_members (workspace_id, is_active, presence_last_seen_at desc);
