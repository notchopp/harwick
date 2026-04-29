alter table public.listing_facts
add column if not exists verification_status text not null default 'unverified'
check (verification_status in ('unverified', 'verified', 'needs_recheck'));

alter table public.listing_facts
add column if not exists verified_by_member_id uuid references public.workspace_members(id) on delete set null;

alter table public.listing_facts
add column if not exists needs_recheck_at timestamptz;

update public.listing_facts
set verification_status = 'verified'
where verified_at is not null
  and verification_status = 'unverified';

create index if not exists listing_facts_workspace_verification_idx
on public.listing_facts (workspace_id, verification_status, needs_recheck_at);
