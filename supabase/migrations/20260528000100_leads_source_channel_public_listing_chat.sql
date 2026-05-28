-- Add 'public_listing_chat' to leads.source_channel allowed values.
--
-- Public listing chat (Harwick on a buyer-facing /[slug]/listings/[id]
-- surface) is now a first-class lead origin. Previously the chat-time
-- insertLead silently fell back to 'manual', which mislabels every
-- public-chat lead and routes them through manual-lead UI paths in the
-- operator surfaces. We want operators to see "Listing chat" with a
-- House icon, link directly into the chat transcript, and surface the
-- listing context end-to-end.

alter table public.leads
  drop constraint if exists leads_source_channel_check;

alter table public.leads
  add constraint leads_source_channel_check
  check (source_channel = any (array[
    'instagram_dm'::text,
    'instagram_comment'::text,
    'facebook_dm'::text,
    'facebook_comment'::text,
    'call'::text,
    'sms'::text,
    'manual'::text,
    'csv_import'::text,
    'public_listing_chat'::text
  ]));
