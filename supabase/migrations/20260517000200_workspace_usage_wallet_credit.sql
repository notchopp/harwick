create or replace function public.credit_workspace_usage_wallet(
  p_workspace_id uuid,
  p_amount_cents integer,
  p_stripe_payment_method_id text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_amount_cents <= 0 then
    raise exception 'amount_cents_must_be_positive';
  end if;

  insert into public.workspace_usage_wallet (
    workspace_id,
    balance_cents,
    stripe_payment_method_id,
    last_recharge_at,
    updated_at
  )
  values (
    p_workspace_id,
    p_amount_cents,
    p_stripe_payment_method_id,
    now(),
    now()
  )
  on conflict (workspace_id) do update
  set
    balance_cents = public.workspace_usage_wallet.balance_cents + excluded.balance_cents,
    stripe_payment_method_id = coalesce(excluded.stripe_payment_method_id, public.workspace_usage_wallet.stripe_payment_method_id),
    last_recharge_at = now(),
    updated_at = now()
  returning balance_cents into v_balance;

  return v_balance;
end;
$$;

revoke all on function public.credit_workspace_usage_wallet(uuid, integer, text) from public;
grant execute on function public.credit_workspace_usage_wallet(uuid, integer, text) to service_role;
