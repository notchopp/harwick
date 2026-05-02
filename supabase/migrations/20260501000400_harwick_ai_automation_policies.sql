create table if not exists public.harwick_ai_automation_policies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  member_id uuid references public.workspace_members(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  scope text not null default 'workspace'
    check (scope in ('workspace', 'member', 'conversation')),
  automation_mode text not null default 'ai_on'
    check (automation_mode in ('ai_on', 'human_takeover', 'paused_by_rule')),
  auto_send_enabled boolean not null default true,
  confidence_threshold numeric not null default 0.78
    check (confidence_threshold >= 0 and confidence_threshold <= 1),
  allowed_auto_actions text[] not null default array['send_reply', 'ask_qualification', 'move_comment_to_dm', 'send_buyer_blueprint'],
  allowed_auto_tools text[] not null default array['send_meta_reply', 'send_meta_dm'],
  requires_approval_actions text[] not null default array['offer_showing', 'request_showing_approval', 'register_open_house', 'route_lead', 'handoff_to_agent', 'pause_for_owner', 'do_not_reply'],
  requires_approval_tools text[] not null default array['check_calendar', 'request_showing_approval', 'register_open_house', 'route_lead', 'sync_follow_up_boss', 'pause_automation'],
  blocked_safety_flags text[] not null default array['needs_human_review', 'human_takeover', 'legal_advice', 'lending_advice', 'contract_advice', 'valuation_claim', 'claims_listing_availability', 'claims_financing_certainty', 'low_confidence'],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (scope = 'workspace' and member_id is null and lead_id is null)
    or (scope = 'member' and member_id is not null and lead_id is null)
    or (scope = 'conversation' and lead_id is not null)
  )
);

create unique index if not exists harwick_ai_automation_policies_workspace_idx
on public.harwick_ai_automation_policies (workspace_id)
where scope = 'workspace';

create unique index if not exists harwick_ai_automation_policies_member_idx
on public.harwick_ai_automation_policies (workspace_id, member_id)
where scope = 'member';

create unique index if not exists harwick_ai_automation_policies_conversation_idx
on public.harwick_ai_automation_policies (workspace_id, lead_id)
where scope = 'conversation';

alter table public.harwick_ai_automation_policies enable row level security;

drop policy if exists "workspace members can read harwick ai automation policies" on public.harwick_ai_automation_policies;
create policy "workspace members can read harwick ai automation policies"
on public.harwick_ai_automation_policies
for select
to authenticated
using (
  public.can_manage_workspace_operations(workspace_id)
  or exists (
    select 1
    from public.workspace_members
    where workspace_members.id = harwick_ai_automation_policies.member_id
      and workspace_members.workspace_id = harwick_ai_automation_policies.workspace_id
      and workspace_members.user_id = auth.uid()
      and workspace_members.is_active = true
  )
  or exists (
    select 1
    from public.leads
    join public.workspace_members on workspace_members.id = leads.assigned_agent_id
    where leads.id = harwick_ai_automation_policies.lead_id
      and leads.workspace_id = harwick_ai_automation_policies.workspace_id
      and workspace_members.user_id = auth.uid()
      and workspace_members.is_active = true
  )
);

drop policy if exists "workspace operators can manage harwick ai automation policies" on public.harwick_ai_automation_policies;
create policy "workspace operators can manage harwick ai automation policies"
on public.harwick_ai_automation_policies
for all
to authenticated
using (public.can_manage_workspace_operations(workspace_id))
with check (public.can_manage_workspace_operations(workspace_id));
