-- public_listing_sessions: server-side persistence of anonymous chat
-- sessions on public listing pages, BEFORE they're promoted to leads.
--
-- Why this exists (the chat endpoint at /[slug]/api/listings/chat shipped
-- without it): until promotion, the chat handler was trusting whatever
-- conversation[] the client posted. Three problems with that:
--
--   1. Operator visibility — when a session DOES promote to a lead, the
--      pre-lead transcript is the most valuable context the operator has
--      ("here's the 6 turns of conversation that earned the showing"). If
--      it lives only in browser state, it's gone the moment the lead
--      lands.
--   2. Refresh resilience — visitor refreshes the page, loses the thread,
--      Harwick starts over without remembering what they already
--      qualified on. Bad UX.
--   3. Audit + abuse — rate-limiting purely by IP misses abusive sessions
--      that span IPs (mobile networks); per-session counters give us a
--      cleaner signal.
--
-- The session_token is set by the API in an httpOnly cookie. The visitor
-- never sees it. Cookie expires when the session expires (30 days).

create table if not exists public.public_listing_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  session_token text not null unique,
  -- Accumulating qualification state, shape mirrors HarwickAiQualification.
  -- Updated turn-by-turn by the runtime statePatch.
  qualification jsonb not null default '{}'::jsonb,
  -- Once the session crosses the promotion threshold (phone captured +
  -- non-spam intent), promoted_lead_id pins to the resulting lead row
  -- and promoted_at fixes the moment. After that, the session is still
  -- writable (visitor can keep talking) but every new turn is also
  -- mirrored onto the lead's conversation thread.
  promoted_lead_id uuid references public.leads(id) on delete set null,
  promoted_at timestamptz,
  last_active_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  -- ip_hash is sha-256 truncated to 16 chars — enough to correlate
  -- without storing the raw IP (Sentry-style PII guard).
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists public_listing_sessions_token_idx
  on public.public_listing_sessions (session_token);

create index if not exists public_listing_sessions_listing_active_idx
  on public.public_listing_sessions (listing_id, last_active_at desc);

create index if not exists public_listing_sessions_workspace_active_idx
  on public.public_listing_sessions (workspace_id, last_active_at desc);

create index if not exists public_listing_sessions_promoted_lead_idx
  on public.public_listing_sessions (promoted_lead_id)
  where promoted_lead_id is not null;

create table if not exists public.public_listing_session_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.public_listing_sessions(id) on delete cascade,
  actor text not null check (actor in ('visitor', 'harwick_ai')),
  body text not null,
  -- statePatch + nextAction are only meaningful for assistant turns. We
  -- store them so the operator review surface can show "here's what
  -- Harwick learned at each step" without re-running the model.
  state_patch jsonb,
  next_action text,
  occurred_at timestamptz not null default now()
);

create index if not exists public_listing_session_turns_session_idx
  on public.public_listing_session_turns (session_id, occurred_at);

alter table public.public_listing_sessions enable row level security;
alter table public.public_listing_session_turns enable row level security;

-- Operator read access on sessions: so /home queue items + /leads detail
-- can show the pre-promotion transcript for the lead they're looking at.
drop policy if exists "public_listing_sessions_member_select" on public.public_listing_sessions;
create policy "public_listing_sessions_member_select"
  on public.public_listing_sessions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = public_listing_sessions.workspace_id
        and wm.user_id = auth.uid()
        and wm.is_active = true
    )
  );

drop policy if exists "public_listing_session_turns_member_select" on public.public_listing_session_turns;
create policy "public_listing_session_turns_member_select"
  on public.public_listing_session_turns
  for select
  to authenticated
  using (
    exists (
      select 1 from public.public_listing_sessions s
      join public.workspace_members wm on wm.workspace_id = s.workspace_id
      where s.id = public_listing_session_turns.session_id
        and wm.user_id = auth.uid()
        and wm.is_active = true
    )
  );

-- Note: no anon policies. The chat endpoint runs as service-role from the
-- Next.js API route after validating the session cookie at the app layer.
-- The cookie IS the auth, RLS isn't where the public surface checks.
