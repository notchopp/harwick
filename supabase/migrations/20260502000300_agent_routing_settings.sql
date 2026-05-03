-- Create agent_routing_settings table for operator preferences
CREATE TABLE IF NOT EXISTS public.agent_routing_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  member_id UUID NOT NULL,
  
  -- Territory (array of zip codes or regions)
  territories TEXT[] DEFAULT '{}',
  
  -- Specialization (buyer, seller, investor, etc.)
  specializations TEXT[] DEFAULT '{}',
  
  -- Budget range
  min_budget NUMERIC(15, 2),
  max_budget NUMERIC(15, 2),
  
  -- Lead management
  max_active_leads INT DEFAULT 20,
  auto_assign_enabled BOOLEAN DEFAULT true,
  auto_reply_enabled BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  CONSTRAINT fk_workspace FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_member FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE,
  CONSTRAINT unique_member_workspace UNIQUE(workspace_id, member_id)
);

-- Enable RLS
ALTER TABLE public.agent_routing_settings ENABLE ROW LEVEL SECURITY;

-- RLS policy: operators can read their own settings
CREATE POLICY "agent_routing_settings_read" ON public.agent_routing_settings
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- RLS policy: operators can update their own settings
CREATE POLICY "agent_routing_settings_update" ON public.agent_routing_settings
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- RLS policy: operators can insert their own settings
CREATE POLICY "agent_routing_settings_insert" ON public.agent_routing_settings
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- Indexes
CREATE INDEX idx_agent_routing_settings_workspace_id ON public.agent_routing_settings(workspace_id);
CREATE INDEX idx_agent_routing_settings_member_id ON public.agent_routing_settings(member_id);
