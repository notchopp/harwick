-- Create conversation_messages table for live thread persistence
CREATE TABLE IF NOT EXISTS public.conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'ai', 'operator')),
  sender_id TEXT, -- operator_id if sender_type='operator', or 'harwick_ai'
  body TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'in_progress', 'failed')),
  source_channel TEXT, -- 'instagram_dm', 'facebook_dm', 'sms', 'manual', etc.
  provider_message_id TEXT, -- for deduplication (e.g., Instagram comment_id)
  error_code TEXT,
  error_message TEXT,

  CONSTRAINT fk_lead FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE,
  CONSTRAINT fk_workspace FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;

-- RLS policy: operators can read messages for their workspace
CREATE POLICY "conversation_messages_read_workspace" ON public.conversation_messages
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- RLS policy: only workspace members can insert (via server-side jobs)
CREATE POLICY "conversation_messages_insert_workspace" ON public.conversation_messages
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- Enable realtime for subscriptions
ALTER TABLE public.conversation_messages REPLICA IDENTITY FULL;

-- Indexes for performance
CREATE INDEX idx_conversation_messages_lead_id ON public.conversation_messages(lead_id);
CREATE INDEX idx_conversation_messages_workspace_id ON public.conversation_messages(workspace_id);
CREATE INDEX idx_conversation_messages_created_at ON public.conversation_messages(created_at DESC);
CREATE INDEX idx_conversation_messages_provider_id ON public.conversation_messages(provider_message_id) WHERE provider_message_id IS NOT NULL;
