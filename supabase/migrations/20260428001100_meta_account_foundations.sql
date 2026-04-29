create table if not exists public.meta_account_foundations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  integration_account_id uuid not null references public.integration_accounts(id) on delete cascade,
  account_scope text not null check (account_scope in ('workspace', 'member')),
  owner_member_id uuid references public.workspace_members(id) on delete set null,
  provider text not null check (provider = 'meta'),
  provider_account_id text not null,
  page_id text not null,
  page_name text not null check (length(trim(page_name)) > 0),
  page_category text,
  page_link_url text,
  instagram_business_account_id text not null,
  instagram_username text,
  instagram_display_name text,
  biography text,
  website_url text,
  profile_photo_url text,
  follower_count integer check (follower_count is null or follower_count >= 0),
  follows_count integer check (follows_count is null or follows_count >= 0),
  media_count integer check (media_count is null or media_count >= 0),
  areas_mentioned text[] not null default '{}',
  listing_hints text[] not null default '{}',
  recent_posts jsonb not null default '[]'::jsonb,
  last_fetched_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, integration_account_id),
  unique (workspace_id, instagram_business_account_id)
);

alter table public.meta_account_foundations enable row level security;

create policy "workspace members can read meta account foundations"
on public.meta_account_foundations
for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "workspace admins can manage meta account foundations"
on public.meta_account_foundations
for all
to authenticated
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

create index meta_account_foundations_workspace_owner_idx
on public.meta_account_foundations (workspace_id, owner_member_id, integration_account_id);
