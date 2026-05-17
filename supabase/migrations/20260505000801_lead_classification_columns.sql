-- Cap #8: lead-or-not classification gate. Every inbound runs through a
-- cheap small-model classifier before the full agent loop fires. The
-- classification + reason + confidence + lead hint are persisted on the
-- lead_events row so we can audit decisions, reconcile against operator
-- corrections, and eventually train a tighter classifier on the labeled
-- corpus.
alter table public.lead_events
  add column if not exists lead_classification text,
  add column if not exists lead_classification_reason text,
  add column if not exists lead_classification_confidence numeric(3,2),
  add column if not exists lead_classification_hint text;

do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'lead_events' and constraint_name = 'lead_events_classification_check'
  ) then
    alter table public.lead_events
      add constraint lead_events_classification_check
      check (lead_classification is null or lead_classification in ('lead', 'not_lead', 'needs_review'));
  end if;
end$$;

create index if not exists lead_events_classification_idx
  on public.lead_events (workspace_id, lead_classification, occurred_at desc);
