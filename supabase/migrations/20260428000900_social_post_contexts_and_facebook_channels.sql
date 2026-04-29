alter table public.leads
  drop constraint if exists leads_source_channel_check,
  add constraint leads_source_channel_check
    check (source_channel in ('instagram_dm', 'instagram_comment', 'facebook_dm', 'facebook_comment', 'call', 'sms', 'manual', 'csv_import'));

alter table public.integration_accounts
  add column if not exists provider_account_ids text[] not null default '{}';

create table public.social_posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null check (provider = 'meta'),
  provider_account_id text not null,
  source_post_id text not null,
  source_channel text not null check (source_channel in ('instagram_comment', 'facebook_comment')),
  caption text,
  permalink text,
  media_type text,
  cta_label text,
  areas_mentioned text[] not null default '{}',
  listing_hints text[] not null default '{}',
  fetched_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider, source_post_id)
);

alter table public.social_posts enable row level security;

create policy "workspace members can read social posts"
on public.social_posts
for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "workspace admins can manage social posts"
on public.social_posts
for all
to authenticated
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

create index social_posts_workspace_provider_idx
on public.social_posts (workspace_id, provider, source_post_id);
