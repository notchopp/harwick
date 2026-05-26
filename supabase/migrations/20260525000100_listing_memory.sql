-- listing_memory: per-listing operator-authored knowledge that powers
--
-- 1. Smart prompts on the public listing page ("Most buyers ask about
--    schools near this one") — visibility = 'public' rows surface as
--    visitor-facing chips above the chat composer.
-- 2. Harwick's reasoning context during the listing chat — every row
--    (public + internal) is included in the runtime input so the model
--    can answer specifically instead of inventing.
--
-- This is intentionally a sibling of `listings.raw_facts`, not a column
-- on it. raw_facts is the structured spec (price, beds, sqft, address);
-- listing_memory is the narrative an operator would tell a buyer who
-- walks in the door. Different shape, different ownership, different
-- update cadence.

create type public.listing_memory_kind as enum (
  'common_question',
  'common_objection',
  'context_note',
  'incentive',
  'sales_angle'
);

create type public.listing_memory_visibility as enum (
  'public',
  'internal'
);

create type public.listing_memory_source as enum (
  'operator',
  'harwick_inferred',
  'system_seed'
);

create table if not exists public.listing_memory (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  listing_id uuid not null references public.listing_facts(id) on delete cascade,
  kind public.listing_memory_kind not null,
  visibility public.listing_memory_visibility not null default 'internal',
  -- The visitor-facing prompt chip text. Only required when visibility =
  -- 'public'; for internal notes this stays null and `content` is the
  -- entire payload.
  prompt text,
  content text not null,
  source public.listing_memory_source not null default 'operator',
  display_order int not null default 0,
  created_by_member_id uuid references public.workspace_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists listing_memory_listing_order_idx
  on public.listing_memory (listing_id, display_order, created_at);

create index if not exists listing_memory_workspace_kind_idx
  on public.listing_memory (workspace_id, kind);

create index if not exists listing_memory_public_idx
  on public.listing_memory (listing_id, display_order)
  where visibility = 'public';

alter table public.listing_memory enable row level security;

-- Members of the workspace can read every row for any listing they own.
drop policy if exists "listing_memory_member_select" on public.listing_memory;
create policy "listing_memory_member_select"
  on public.listing_memory
  for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = listing_memory.workspace_id
        and wm.user_id = auth.uid()
        and wm.is_active = true
    )
  );

-- Active members with write access can mutate. Viewers cannot.
drop policy if exists "listing_memory_member_write" on public.listing_memory;
create policy "listing_memory_member_write"
  on public.listing_memory
  for all
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = listing_memory.workspace_id
        and wm.user_id = auth.uid()
        and wm.is_active = true
        and wm.role in ('owner', 'admin', 'member')
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = listing_memory.workspace_id
        and wm.user_id = auth.uid()
        and wm.is_active = true
        and wm.role in ('owner', 'admin', 'member')
    )
  );

-- Public surface: anonymous visitors can read only the rows the operator
-- explicitly marked as visibility = 'public'. Smart-prompt chips on the
-- listing page are server-rendered from this slice, and the public chat
-- runtime also reads it (anonymous reads) when shaping its system prompt
-- so the model can answer the question behind the chip.
drop policy if exists "listing_memory_public_select" on public.listing_memory;
create policy "listing_memory_public_select"
  on public.listing_memory
  for select
  to anon
  using (visibility = 'public');

-- updated_at trigger so operator edits keep an honest timestamp.
create or replace function public.set_listing_memory_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists listing_memory_set_updated_at on public.listing_memory;
create trigger listing_memory_set_updated_at
  before update on public.listing_memory
  for each row execute function public.set_listing_memory_updated_at();
