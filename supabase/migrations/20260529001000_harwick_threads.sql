-- THREADS-1: extend the existing harwick_channels + harwick_channel_messages
-- system (from 20260514000100) with the new capabilities Threads needs:
--   - lead/listing/brokerage-anchored channel kinds
--   - typed-card payloads on messages (10 card kinds per THREADS-2)
--   - parent threading for message replies
--   - mentioned_member_ids for typed @mentions
--   - separate harwick_message_reads table for typed-card "did the operator
--     act on this" analytics
--
-- The previous attempt at this migration created parallel `harwick_threads` /
-- `harwick_messages` tables that duplicated the existing system. Rolled back
-- in favor of additive ALTER TABLEs that keep the /channels page + rail
-- rooms + @harwick handler working without code changes.

-- 1. Extend harwick_channels.kind to include the new variants
ALTER TABLE public.harwick_channels
  DROP CONSTRAINT IF EXISTS harwick_channels_kind_check;
ALTER TABLE public.harwick_channels
  ADD CONSTRAINT harwick_channels_kind_check
    CHECK (kind IN ('channel', 'dm', 'group', 'lead_thread', 'listing_thread', 'brokerage_channel'));

-- 2. Add polymorphic anchor for lead/listing-anchored channels
ALTER TABLE public.harwick_channels
  ADD COLUMN IF NOT EXISTS anchor_entity_type text,
  ADD COLUMN IF NOT EXISTS anchor_entity_id uuid,
  ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_harwick_channels_anchor
  ON public.harwick_channels (anchor_entity_type, anchor_entity_id)
  WHERE anchor_entity_id IS NOT NULL;

-- 3. Extend harwick_channel_messages with typed-card payload + reply threading
ALTER TABLE public.harwick_channel_messages
  ADD COLUMN IF NOT EXISTS card_kind text,
  ADD COLUMN IF NOT EXISTS card_payload jsonb,
  ADD COLUMN IF NOT EXISTS parent_message_id uuid REFERENCES public.harwick_channel_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mentioned_member_ids uuid[] NOT NULL DEFAULT '{}';

-- Relax the body NOT NULL — typed-card messages may carry only a card_payload
-- with no text body.
ALTER TABLE public.harwick_channel_messages
  ALTER COLUMN body DROP NOT NULL;
ALTER TABLE public.harwick_channel_messages
  DROP CONSTRAINT IF EXISTS harwick_channel_messages_body_check;
ALTER TABLE public.harwick_channel_messages
  ADD CONSTRAINT harwick_channel_messages_body_or_card_check
    CHECK (
      (body IS NOT NULL AND length(trim(body)) > 0)
      OR (card_kind IS NOT NULL AND card_payload IS NOT NULL)
    );

CREATE INDEX IF NOT EXISTS idx_harwick_channel_messages_typed_cards
  ON public.harwick_channel_messages (workspace_id, card_kind, created_at DESC)
  WHERE card_kind IS NOT NULL AND deleted_at IS NULL;

-- 4. Per-message read receipts for typed-card analytics (separate from
-- harwick_channel_members.last_read_at, which tracks the last-read timestamp
-- per channel). This table answers "did the operator click/act on THIS
-- specific typed-card message" rather than "what was the last thing I read."
CREATE TABLE IF NOT EXISTS public.harwick_message_reads (
  message_id uuid NOT NULL REFERENCES public.harwick_channel_messages(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.workspace_members(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  acted_on boolean NOT NULL DEFAULT false,
  PRIMARY KEY (message_id, member_id)
);

ALTER TABLE public.harwick_message_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS harwick_message_reads_self ON public.harwick_message_reads;
CREATE POLICY harwick_message_reads_self ON public.harwick_message_reads
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members m
      WHERE m.id = harwick_message_reads.member_id
        AND m.user_id = auth.uid() AND m.is_active = true
    )
  );

COMMENT ON COLUMN public.harwick_channels.anchor_entity_type IS
  'Polymorphic anchor — "lead" or "listing" when channel.kind is lead_thread or listing_thread.';
COMMENT ON COLUMN public.harwick_channel_messages.card_kind IS
  'One of 10 typed-card kinds (THREADS-2): lead_capture, showing_request, callback_request, lender_intro, listing_share, referral_handoff, persona_shift_alert, routing_recommendation, sync_conflict, brokerage_announcement.';
