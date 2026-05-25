create unique index if not exists voice_lead_handoffs_workspace_call_uidx
on public.voice_lead_handoffs (workspace_id, call_id)
where call_id is not null;
