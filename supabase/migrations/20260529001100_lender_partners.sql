-- GTM-22: lender-partner schema + workspace settings.
-- The lender_intro tool surfaces a real lender to the buyer; this table is the
-- source of truth. Workspaces can configure their preferred lender(s); buyer
-- chat tool reads from here when it fires the lender intro action.

CREATE TABLE IF NOT EXISTS public.lender_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  company_name text,
  phone text,
  email text,
  nmls_id text,
  intro_blurb text,
  -- Specialties drive which leads they're best-fit for.
  specialties text[] DEFAULT '{}',
  -- "preferred" / "active" / "paused" / "archived"
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('preferred', 'active', 'paused', 'archived')),
  -- When multiple lenders are configured, this drives round-robin or preferred selection.
  selection_weight integer NOT NULL DEFAULT 1,
  intros_sent_total integer NOT NULL DEFAULT 0,
  last_intro_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lender_partners_workspace_status
  ON public.lender_partners (workspace_id, status, selection_weight DESC);

ALTER TABLE public.lender_partners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lender_partners_member_read ON public.lender_partners;
CREATE POLICY lender_partners_member_read ON public.lender_partners
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members m
      WHERE m.workspace_id = lender_partners.workspace_id
        AND m.user_id = auth.uid() AND m.is_active = true
    )
  );

DROP POLICY IF EXISTS lender_partners_admin_write ON public.lender_partners;
CREATE POLICY lender_partners_admin_write ON public.lender_partners
  FOR ALL USING (
    auth.role() = 'service_role' OR EXISTS (
      SELECT 1 FROM public.workspace_members m
      WHERE m.workspace_id = lender_partners.workspace_id
        AND m.user_id = auth.uid() AND m.is_active = true
        AND m.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    auth.role() = 'service_role' OR EXISTS (
      SELECT 1 FROM public.workspace_members m
      WHERE m.workspace_id = lender_partners.workspace_id
        AND m.user_id = auth.uid() AND m.is_active = true
        AND m.role IN ('owner', 'admin')
    )
  );

COMMENT ON TABLE public.lender_partners IS
  'Workspace-configured lender contacts. Read by the lender_intro Harwick tool when surfacing an intro to a buyer.';
