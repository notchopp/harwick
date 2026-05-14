-- Extend workspace_memory_documents to cover interactive Harwick memory:
--   operator_note   — facts Harwick captured during a rail/channel conversation
--                     ("Sarah only takes calls after 4pm", "Oak Ave deal closes 6/3")
--   operator_pref   — preferences about how the operator wants Harwick to behave
--                     ("don't enumerate, just call it", "always draft, never send")
--   lead_fact       — long-lived facts about a specific lead that survive thread expiry
--                     ("John is the husband; Mary actually makes the buying decision")
--
-- The original distillation-worker types (pattern / routing / objection / market /
-- policy_signal) stay valid — Harwick's interactive writes just join the union.

alter table public.workspace_memory_documents
  drop constraint if exists workspace_memory_documents_memory_type_check;

alter table public.workspace_memory_documents
  add constraint workspace_memory_documents_memory_type_check
  check (memory_type in (
    'pattern', 'routing', 'objection', 'market', 'policy_signal',
    'operator_note', 'operator_pref', 'lead_fact'
  ));
