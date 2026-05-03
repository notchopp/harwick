-- Backfill conversations table from split state tables
-- Source 1: conversation_automation_states (lead-scoped automation mode)
-- Source 2: social_reply_reviews (pending reply context + automation mode)

-- First pass: backfill from conversation_automation_states
INSERT INTO conversations (
  id,
  workspace_id,
  lead_id,
  channel,
  provider_account_id,
  recipient_user_id,
  source_post_id,
  source_comment_id,
  automation_mode,
  automation_changed_by_member_id,
  automation_changed_at,
  automation_reason,
  status,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  cas.workspace_id,
  cas.lead_id,
  cas.channel,
  cas.provider_account_id,
  cas.recipient_user_id,
  NULL,
  NULL,
  cas.automation_mode,
  cas.changed_by_member_id,
  cas.changed_at,
  cas.automation_reason,
  'active',
  cas.created_at,
  cas.updated_at
FROM conversation_automation_states cas
WHERE cas.lead_id IS NOT NULL
ON CONFLICT (workspace_id, lead_id) DO NOTHING;

-- Second pass: backfill from social_reply_reviews (only if no conversation exists yet)
INSERT INTO conversations (
  id,
  workspace_id,
  lead_id,
  channel,
  provider_account_id,
  recipient_user_id,
  source_post_id,
  source_comment_id,
  automation_mode,
  automation_changed_by_member_id,
  automation_changed_at,
  automation_reason,
  status,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  srr.workspace_id,
  srr.lead_id,
  srr.channel,
  srr.provider_account_id,
  srr.recipient_user_id,
  srr.source_post_id,
  srr.source_comment_id,
  COALESCE(srr.automation_mode, 'ai_on'),
  srr.automation_changed_by_member_id,
  srr.automation_changed_at,
  srr.automation_reason,
  CASE 
    WHEN srr.status = 'dismissed' THEN 'dismissed'
    WHEN srr.status = 'sent' THEN 'resolved'
    ELSE 'active'
  END,
  srr.created_at,
  COALESCE(srr.updated_at, srr.created_at)
FROM social_reply_reviews srr
WHERE srr.lead_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.workspace_id = srr.workspace_id
      AND c.lead_id = srr.lead_id
  )
ON CONFLICT (workspace_id, lead_id) DO NOTHING;
