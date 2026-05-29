-- training_signals: input/output of every judgment-tool emission.
-- training_corpus: derived labeled examples ready for fine-tuning.
--
-- The whole point: every Harwick decision becomes a delayed labeled training
-- example. Brief generation, routing recommendation, reconciliation, draft
-- write -> training_signals row at emit-time. When the CRM webhook fires
-- the outcome (closed_won, marked_spam, reassigned, task_completed)
-- weeks/months later, the row gets its label. The labeler worker then
-- distills training_signals into training_corpus entries shaped for
-- supervised fine-tuning or DPO.
--
-- Start writing rows from day one — even before any tool is rewritten,
-- existing FUB pushes / public-chat captures / voice events should
-- populate this table so the corpus accumulates while the architecture
-- catches up.

CREATE TABLE IF NOT EXISTS public.training_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  signal_type text NOT NULL,
  harwick_artifact_id text,
  harwick_artifact_type text NOT NULL,
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  outputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  model_id text NOT NULL,
  confidence numeric DEFAULT 0,
  input_tokens integer DEFAULT 0,
  output_tokens integer DEFAULT 0,

  related_entity_type text,
  related_entity_id uuid,

  crm_provider text,
  crm_contact_id text,
  crm_outcome text,
  crm_outcome_at timestamptz,
  time_to_outcome_seconds bigint,

  operator_feedback text,
  human_edit_diff jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  labeled_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_training_signals_workspace_created
  ON public.training_signals (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_training_signals_unlabeled
  ON public.training_signals (workspace_id, created_at DESC)
  WHERE labeled_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_training_signals_artifact
  ON public.training_signals (harwick_artifact_type, harwick_artifact_id);

CREATE INDEX IF NOT EXISTS idx_training_signals_related_entity
  ON public.training_signals (related_entity_type, related_entity_id);

ALTER TABLE public.training_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS training_signals_service_role_only ON public.training_signals;
CREATE POLICY training_signals_service_role_only
  ON public.training_signals
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.training_signals IS
  'Every judgment-tool emission writes one row here. Outcome label backfills when the CRM webhook reports closed/reassigned/spam/task_completed. Three months of accumulation = fine-tune-grade corpus.';

CREATE TABLE IF NOT EXISTS public.training_corpus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,

  source_signal_id uuid REFERENCES public.training_signals(id) ON DELETE CASCADE,
  tool_name text NOT NULL,
  shape text NOT NULL,

  prompt_input jsonb NOT NULL,
  ideal_output jsonb NOT NULL,
  outcome_class text NOT NULL,
  reward_signal numeric,

  dispreferred_output jsonb,

  source_model_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_training_corpus_tool_outcome
  ON public.training_corpus (tool_name, outcome_class);

CREATE INDEX IF NOT EXISTS idx_training_corpus_workspace
  ON public.training_corpus (workspace_id, created_at DESC);

ALTER TABLE public.training_corpus ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS training_corpus_service_role_only ON public.training_corpus;
CREATE POLICY training_corpus_service_role_only
  ON public.training_corpus
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.training_corpus IS
  'Labeled training examples derived from training_signals once outcomes land. Shape column: "sft" (prompt + ideal_output) or "dpo" (prompt + ideal + dispreferred). Consumed by distillation trainer on the Mac Studio.';
