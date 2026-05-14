-- Two columns on the leads table that Harwick's new tools rely on:
--
--   tags                  Array of operator-/Harwick-set category tags
--                         ('first_time_buyer', 'cash_buyer', 'relocation', ...)
--                         Used by add_lead_tag, find_similar_leads.
--
--   qualification_summary 1-2 sentence rolling summary of where this lead is
--                         in qualification. Refreshed by Harwick after each
--                         meaningful turn; used as the embedding source for
--                         find_similar_leads + as a quick-read field for the UI.

alter table public.leads
  add column if not exists tags text[] not null default '{}'::text[];

alter table public.leads
  add column if not exists qualification_summary text;

create index if not exists leads_tags_idx
  on public.leads using gin (tags);
