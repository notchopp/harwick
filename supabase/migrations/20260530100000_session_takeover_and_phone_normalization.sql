-- /convos take-over: operator can flag a public_listing_chat session as
-- "I'm handling this now" so the chat route's onFinish knows to skip
-- the Harwick AI response on the next turn. Phase 1 surfaces the state
-- in the operator UI; phase 2 wires the runtime pause + operator-message
-- injection back into the buyer's chat.

ALTER TABLE public.public_listing_sessions
  ADD COLUMN IF NOT EXISTS taken_over_by_member_id uuid REFERENCES public.workspace_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS taken_over_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_public_listing_sessions_takeover
  ON public.public_listing_sessions (workspace_id, taken_over_by_member_id)
  WHERE taken_over_by_member_id IS NOT NULL;

COMMENT ON COLUMN public.public_listing_sessions.taken_over_by_member_id IS
  'When set, the named operator has taken over this buyer chat from Harwick. The chat route should suppress AI responses for this session until cleared. Phase 2 work: operator-message injection.';

-- Phone normalization backfill — collapse the existing leads.phone column
-- to digits-only canonical form so the new phone-as-canonical-ID lookups
-- find existing records consistently with new writes. Safe: drops
-- formatting only; never invents digits.
UPDATE public.leads
SET phone = (
  CASE
    WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^1[0-9]{10}$'
      THEN substring(regexp_replace(phone, '[^0-9]', '', 'g') FROM 2)
    WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^[0-9]{7,15}$'
      THEN regexp_replace(phone, '[^0-9]', '', 'g')
    ELSE phone
  END
)
WHERE phone IS NOT NULL AND phone <> regexp_replace(phone, '[^0-9]', '', 'g');

-- Index on workspace + phone for the new canonical lookup path. The
-- existing schema probably has an index on (workspace_id, instagram_user_id)
-- but not on (workspace_id, phone); this adds it idempotently.
CREATE INDEX IF NOT EXISTS idx_leads_workspace_phone
  ON public.leads (workspace_id, phone)
  WHERE phone IS NOT NULL;

-- training_signals lifecycle hook: index on the related lead id for fast
-- "find the signals for this lead so we can label them" queries when a
-- closed_won/closed_lost outcome lands. The base index by artifact already
-- exists; this adds the lead-centric path.
CREATE INDEX IF NOT EXISTS idx_training_signals_related_lead
  ON public.training_signals (workspace_id, related_entity_id)
  WHERE related_entity_type = 'lead';
