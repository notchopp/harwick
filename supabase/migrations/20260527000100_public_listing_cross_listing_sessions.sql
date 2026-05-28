-- Let one anonymous buyer identity span many listing-specific chat threads.
--
-- The original public_listing_sessions.session_token unique constraint made
-- the browser cookie identify exactly one listing session. When a returning
-- visitor opened another listing and started a chat, the API had to mint a new
-- cookie token, which erased the buyer profile chip and cross-listing memory.
--
-- Keep each thread scoped to a listing, but make the token a visitor identity
-- within a workspace.

alter table public.public_listing_sessions
  drop constraint if exists public_listing_sessions_session_token_key;

create unique index if not exists public_listing_sessions_workspace_listing_token_key
  on public.public_listing_sessions (workspace_id, listing_id, session_token);

drop index if exists public_listing_sessions_token_idx;

create index if not exists public_listing_sessions_workspace_token_active_idx
  on public.public_listing_sessions (workspace_id, session_token, last_active_at desc);
