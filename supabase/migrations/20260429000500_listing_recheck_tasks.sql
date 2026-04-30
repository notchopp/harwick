alter table public.lead_tasks
alter column lead_id drop not null;

create index if not exists lead_tasks_workspace_recheck_idx
on public.lead_tasks (workspace_id, task_type, status, due_at)
where task_type = 'verify_listing';
