create table if not exists public.social_reply_reviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  lead_event_id uuid not null references public.lead_events(id) on delete cascade,
  provider_account_id text not null,
  recipient_user_id text,
  channel text not null check (channel in ('instagram_dm', 'instagram_comment', 'facebook_dm', 'facebook_comment')),
  source_post_id text,
  source_comment_id text,
  inbound_text text,
  suggested_reply text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'sent', 'dismissed', 'failed')),
  reviewed_by_member_id uuid references public.workspace_members(id),
  reviewed_at timestamptz,
  provider_event_id text,
  dismissal_reason text,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, lead_event_id)
);

alter table public.social_reply_reviews enable row level security;

create policy "workspace members can read social reply reviews"
on public.social_reply_reviews
for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "workspace admins can manage social reply reviews"
on public.social_reply_reviews
for all
to authenticated
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

create index if not exists social_reply_reviews_workspace_status_idx
on public.social_reply_reviews (workspace_id, status, updated_at desc);

alter table public.voice_lead_handoffs
add column if not exists review_status text not null default 'pending' check (review_status in ('pending', 'callback_created', 'reviewed', 'dismissed')),
add column if not exists reviewed_by_member_id uuid references public.workspace_members(id),
add column if not exists reviewed_at timestamptz,
add column if not exists callback_task_id uuid references public.lead_tasks(id) on delete set null,
add column if not exists dismissal_reason text;

create index if not exists voice_lead_handoffs_workspace_review_idx
on public.voice_lead_handoffs (workspace_id, review_status, created_at desc);
