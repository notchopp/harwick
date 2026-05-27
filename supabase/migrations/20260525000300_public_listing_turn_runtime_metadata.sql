alter table public.public_listing_session_turns
  add column if not exists confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  add column if not exists missing_fields text[] not null default '{}'::text[],
  add column if not exists safety_flags text[] not null default '{}'::text[],
  add column if not exists handoff_brief text,
  add column if not exists document_update text,
  add column if not exists tool_calls jsonb not null default '[]'::jsonb;

comment on column public.public_listing_session_turns.confidence is
  'Harwick runtime confidence for the assistant turn, used by operator replay and debugging.';
comment on column public.public_listing_session_turns.tool_calls is
  'Listing-chat runtime tool activity emitted or inferred for the assistant turn.';
