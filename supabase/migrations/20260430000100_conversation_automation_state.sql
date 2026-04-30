alter table public.social_reply_reviews
add column if not exists automation_mode text not null default 'ai_on'
  check (automation_mode in ('ai_on', 'human_takeover', 'paused_by_rule')),
add column if not exists automation_reason text,
add column if not exists automation_changed_by_member_id uuid references public.workspace_members(id),
add column if not exists automation_changed_at timestamptz,
add column if not exists ai_decision jsonb;

create index if not exists social_reply_reviews_workspace_automation_idx
on public.social_reply_reviews (workspace_id, automation_mode, updated_at desc);
