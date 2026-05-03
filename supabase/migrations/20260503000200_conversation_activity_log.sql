-- Create immutable conversation activity log (audit trail for all state changes)
CREATE TABLE conversation_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  
  event_type TEXT NOT NULL CHECK (event_type IN (
    'created',                   -- New conversation started
    'customer_messaged',         -- Inbound message from customer
    'ai_suggested_reply',        -- AI generated suggestion
    'ai_reply_sent',             -- AI auto-sent message
    'ai_reply_failed',           -- AI tried to send but failed
    'operator_paused_ai',        -- Operator clicked "Pause AI"
    'operator_resumed_ai',       -- Operator clicked "Resume AI"
    'operator_replied',          -- Operator sent manual message
    'operator_claimed',          -- Operator claimed conversation
    'operator_released',         -- Operator released conversation
    'operator_dismissed',        -- Operator dismissed lead
    'handoff_prepared',          -- Handoff context prepared
    'handoff_sent',              -- Handoff to FUB completed
    'automation_disabled',       -- Automation rule paused
    'automation_enabled'         -- Automation rule resumed
  )),
  
  actor_type TEXT NOT NULL CHECK (actor_type IN ('system', 'operator', 'customer', 'ai')),
  actor_id UUID,  -- member_id for operators/ai, null for system events
  
  -- Rich context (stored as JSONB for flexibility)
  data JSONB,  -- {old_mode, new_mode, reason, message_id, error_code, rule_id, confidence, etc}
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_conversation_activity_log_conversation_id ON conversation_activity_log(conversation_id);
CREATE INDEX idx_conversation_activity_log_event_type ON conversation_activity_log(event_type);
CREATE INDEX idx_conversation_activity_log_actor_id ON conversation_activity_log(actor_id);
CREATE INDEX idx_conversation_activity_log_created_at ON conversation_activity_log(created_at DESC);
-- Workspace index done via conversation_id join, not stored directly

-- RLS Policy: Operators can only view activity logs for their workspace
ALTER TABLE conversation_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view activity logs in their workspace"
  ON conversation_activity_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
        JOIN conversations c ON c.workspace_id = wm.workspace_id
      WHERE c.id = conversation_activity_log.conversation_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert activity logs"
  ON conversation_activity_log FOR INSERT
  WITH CHECK (true);  -- Service role inserts audit events
