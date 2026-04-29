alter table public.integration_accounts
drop constraint if exists integration_accounts_provider_check;

alter table public.integration_accounts
add constraint integration_accounts_provider_check
check (provider in ('meta', 'twilio', 'retell', 'follow_up_boss', 'repliers'));
