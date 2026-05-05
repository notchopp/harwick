-- AI-native shift 4: living lead document. The model reads this prose
-- briefing as primary context each turn and amends it via documentUpdate
-- output. Structured columns survive as derived extracts (FUB sync,
-- routing, filters) but the document is the source of truth the model
-- reasons over. See docs/paid-launch-map.md "AI-Native Migration Track"
-- step 4.
alter table public.leads
  add column if not exists lead_document text default '',
  add column if not exists lead_document_updated_at timestamptz;
