alter table public.workspace_voice_agents
add column if not exists service_areas text[] not null default '{}',
add column if not exists transfer_number text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspace_voice_agents_transfer_number_format'
  ) then
    alter table public.workspace_voice_agents
    add constraint workspace_voice_agents_transfer_number_format
    check (transfer_number is null or transfer_number ~ '^\+[1-9][0-9]{7,14}$');
  end if;
end $$;
