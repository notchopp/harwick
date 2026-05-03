-- Create unified conversations table (single source of truth for automation state)
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Channel/Provider context
  channel TEXT NOT NULL CHECK (channel IN ('instagram_dm', 'facebook_dm', 'instagram_comment', 'facebook_comment', 'sms', 'call')),
  provider_account_id TEXT,
  recipient_user_id TEXT,
  source_post_id TEXT,
  source_comment_id TEXT,
  
  -- Automation Control (SINGLE SOURCE OF TRUTH)
  automation_mode TEXT NOT NULL DEFAULT 'ai_on' 
    CHECK (automation_mode IN ('ai_on', 'human_takeover', 'paused_by_rule')),
  automation_changed_by_member_id UUID REFERENCES workspace_members(id),
  automation_changed_at TIMESTAMPTZ,
  automation_reason TEXT,
  
  -- Conversation Status
  status TEXT NOT NULL DEFAULT 'active' 
    CHECK (status IN ('active', 'paused', 'resolved', 'archived', 'dismissed')),
  dismissal_reason TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Constraints
  UNIQUE(workspace_id, lead_id)
);

-- Indexes for performance
CREATE INDEX idx_conversations_workspace_id ON conversations(workspace_id);
CREATE INDEX idx_conversations_lead_id ON conversations(lead_id);
CREATE INDEX idx_conversations_workspace_lead ON conversations(workspace_id, lead_id);
CREATE INDEX idx_conversations_automation_mode ON conversations(workspace_id, automation_mode);
CREATE INDEX idx_conversations_channel ON conversations(workspace_id, channel);
CREATE INDEX idx_conversations_updated_at ON conversations(workspace_id, updated_at DESC);

-- RLS Policy: Operators can only view/manage conversations in their workspace
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view their conversations"
  ON conversations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = conversations.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Workspace members can update their conversations"
  ON conversations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = conversations.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Workspace members can insert conversations"
  ON conversations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = conversations.workspace_id
        AND wm.user_id = auth.uid()
    )
  );
