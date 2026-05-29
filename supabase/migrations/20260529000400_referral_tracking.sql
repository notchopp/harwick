-- Referral tracking for the brokerage-acquisition flow.
-- When a team_lead/agent's CRM-side Harwick attribution leads to a brokerage
-- owner discovering Harwick and signing up, the original referrer gets
-- credit. Free seats, wallet credit, or rev-share — driven by the
-- referral_credit_kind enum.

CREATE TYPE referral_credit_kind AS ENUM ('seats', 'wallet_credit', 'rev_share');
CREATE TYPE referral_status AS ENUM ('pending', 'awarded', 'rejected', 'expired');

CREATE TABLE IF NOT EXISTS public.workspace_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  referrer_workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  referrer_member_id uuid REFERENCES public.workspace_members(id) ON DELETE SET NULL,

  referred_workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,

  source_kind text NOT NULL DEFAULT 'crm_note_attribution',
  source_url text,
  utm_source text,
  utm_campaign text,

  status referral_status NOT NULL DEFAULT 'pending',
  credit_kind referral_credit_kind,
  credit_amount_usd numeric,
  awarded_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_referrals_referrer
  ON public.workspace_referrals (referrer_workspace_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workspace_referrals_referred
  ON public.workspace_referrals (referred_workspace_id);

ALTER TABLE public.workspace_referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_referrals_referrer_read ON public.workspace_referrals;
CREATE POLICY workspace_referrals_referrer_read
  ON public.workspace_referrals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members m
      WHERE m.workspace_id = workspace_referrals.referrer_workspace_id
        AND m.user_id = auth.uid()
        AND m.is_active = true
        AND m.role IN ('owner', 'admin', 'team_lead', 'lead_manager')
    )
  );

DROP POLICY IF EXISTS workspace_referrals_service_role_write ON public.workspace_referrals;
CREATE POLICY workspace_referrals_service_role_write
  ON public.workspace_referrals
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.workspace_referrals IS
  'Brokerage-acquisition tracking. CRM-side attribution (via Harwick) links a referred sign-up back to the workspace whose agent originally exposed it.';
