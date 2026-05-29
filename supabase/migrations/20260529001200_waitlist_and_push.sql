-- LAUNCH-11: Instagram "coming soon" waitlist signups.
-- Buyers who land on a workspace's listings during the Meta-paused window can
-- opt-in to be notified when IG/FB DM channels go live.

CREATE TABLE IF NOT EXISTS public.instagram_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email text,
  phone text,
  instagram_username text,
  source_url text,
  user_agent text,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_instagram_waitlist_workspace
  ON public.instagram_waitlist (workspace_id, created_at DESC);

ALTER TABLE public.instagram_waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS instagram_waitlist_admin_read ON public.instagram_waitlist;
CREATE POLICY instagram_waitlist_admin_read ON public.instagram_waitlist
  FOR SELECT USING (
    auth.role() = 'service_role' OR EXISTS (
      SELECT 1 FROM public.workspace_members m
      WHERE m.workspace_id = instagram_waitlist.workspace_id
        AND m.user_id = auth.uid() AND m.is_active = true
        AND m.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS instagram_waitlist_service_write ON public.instagram_waitlist;
CREATE POLICY instagram_waitlist_service_write ON public.instagram_waitlist
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- GTM-24: Web-push subscriptions. One row per (member, browser endpoint).
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.workspace_members(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh_key text NOT NULL,
  auth_key text NOT NULL,
  user_agent text,
  last_used_at timestamptz,
  failure_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_member
  ON public.push_subscriptions (member_id) WHERE failure_count < 5;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_self ON public.push_subscriptions;
CREATE POLICY push_subscriptions_self ON public.push_subscriptions
  FOR ALL USING (
    auth.role() = 'service_role' OR EXISTS (
      SELECT 1 FROM public.workspace_members m
      WHERE m.id = push_subscriptions.member_id
        AND m.user_id = auth.uid() AND m.is_active = true
    )
  );

COMMENT ON TABLE public.instagram_waitlist IS 'Buyers waiting for IG/FB DM acquisition channel to go live post-Meta-verification.';
COMMENT ON TABLE public.push_subscriptions IS 'Web-push subscriptions per workspace member browser endpoint. Used for new-lead / unread-thread notifications.';
