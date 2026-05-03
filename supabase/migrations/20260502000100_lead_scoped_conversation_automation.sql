alter table public.conversation_automation_states
  alter column provider_account_id drop not null,
  alter column channel drop not null;

alter table public.conversation_automation_states
  drop constraint if exists conversation_automation_states_scope_check;

alter table public.conversation_automation_states
  add constraint conversation_automation_states_scope_check
  check (
    lead_id is not null
    or (
      provider_account_id is not null
      and channel is not null
    )
  );
