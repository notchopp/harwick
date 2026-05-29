-- harwick_briefs: cache primitive that powers every brief surface across the
-- operator UI, CRM notes, share links, and downstream destinations.
--
-- One row per (workspace, entity_type, entity_id, audience_hash, destination).
-- The audience_hash + destination split lets the same entity have multiple
-- briefs: an agent-facing crm_note, a buyer-facing chat_context, an
-- owner-facing summary, all cached independently.
--
-- state_hash is the deterministic fingerprint of the entity state at
-- generation time. UI loads brief by key; if state_hash matches current
-- entity state -> render. Mismatch -> render last cached + queue regen.
-- Stale-while-revalidate.

CREATE TABLE IF NOT EXISTS public.harwick_briefs (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  audience_hash text NOT NULL,
  destination text NOT NULL,
  audience jsonb NOT NULL DEFAULT '{}'::jsonb,
  headline text NOT NULL,
  body text NOT NULL,
  suggested_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  state_hash text NOT NULL,
  model text NOT NULL,
  confidence numeric NOT NULL DEFAULT 0,
  rationale text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  PRIMARY KEY (workspace_id, entity_type, entity_id, audience_hash, destination)
);

CREATE INDEX IF NOT EXISTS idx_harwick_briefs_entity
  ON public.harwick_briefs (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_harwick_briefs_workspace_destination
  ON public.harwick_briefs (workspace_id, destination, generated_at DESC);

ALTER TABLE public.harwick_briefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS harwick_briefs_workspace_member_select ON public.harwick_briefs;
CREATE POLICY harwick_briefs_workspace_member_select
  ON public.harwick_briefs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members m
      WHERE m.workspace_id = harwick_briefs.workspace_id
        AND m.user_id = auth.uid()
        AND m.is_active = true
    )
  );

DROP POLICY IF EXISTS harwick_briefs_service_role_write ON public.harwick_briefs;
CREATE POLICY harwick_briefs_service_role_write
  ON public.harwick_briefs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.harwick_briefs IS
  'Cached LLM-generated briefs keyed by entity + audience + destination. Powers drawer reads, queue cards, routing rows, CRM notes, share-link copy, owner summaries, coaching reads. Regenerated on state_hash mismatch.';
