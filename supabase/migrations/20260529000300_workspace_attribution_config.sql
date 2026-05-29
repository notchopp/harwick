-- attribution_config on workspaces: per-workspace control of how
-- "via Harwick" appears in CRM artifacts. Free tier locked to via_harwick;
-- paid tiers customize; enterprise can white-label.
--
-- Drives the acquisition viral surface — every Harwick-authored note in
-- every connected CRM carries an attribution by default, which is how
-- brokerage owners discover Harwick from their agents' usage.

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS attribution_config jsonb NOT NULL DEFAULT '{"style":"via_harwick","customText":null,"workspaceLabel":null}'::jsonb;

COMMENT ON COLUMN public.workspaces.attribution_config IS
  'AttributionConfig for CRM-destined briefs. Free: via_harwick (locked). Mid paid: co_brand. Upper paid: minimal. Enterprise: custom or removed.';
