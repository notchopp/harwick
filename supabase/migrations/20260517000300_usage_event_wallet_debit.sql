create or replace function public.record_billing_usage_event(
  p_workspace_id uuid,
  p_event_type text,
  p_unit_count numeric default 1,
  p_retail_cents integer default 0,
  p_cogs_cents integer default 0,
  p_source_id text default null,
  p_idempotency_key text default null,
  p_event_metadata jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_existing uuid;
begin
  if p_unit_count <= 0 then
    raise exception 'unit_count_must_be_positive';
  end if;

  if p_retail_cents < 0 or p_cogs_cents < 0 then
    raise exception 'usage_cents_must_be_nonnegative';
  end if;

  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    raise exception 'idempotency_key_required';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_workspace_id::text || ':' || p_idempotency_key));

  select id into v_existing
  from public.usage_events
  where workspace_id = p_workspace_id
    and idempotency_key = p_idempotency_key
  limit 1;

  if v_existing is not null then
    return false;
  end if;

  insert into public.workspace_usage_wallet (workspace_id)
  values (p_workspace_id)
  on conflict (workspace_id) do nothing;

  if p_retail_cents > 0 then
    update public.workspace_usage_wallet
    set
      balance_cents = balance_cents - p_retail_cents,
      updated_at = now()
    where workspace_id = p_workspace_id
      and balance_cents >= p_retail_cents
    returning balance_cents into v_balance;

    if v_balance is null then
      raise exception 'wallet_insufficient_funds';
    end if;
  else
    select balance_cents into v_balance
    from public.workspace_usage_wallet
    where workspace_id = p_workspace_id;
  end if;

  insert into public.usage_events (
    workspace_id,
    event_type,
    unit_count,
    retail_cents,
    cogs_cents,
    balance_after_cents,
    source_id,
    idempotency_key,
    event_metadata
  )
  values (
    p_workspace_id,
    p_event_type,
    p_unit_count,
    p_retail_cents,
    p_cogs_cents,
    v_balance,
    p_source_id,
    p_idempotency_key,
    p_event_metadata
  );

  return true;
end;
$$;

revoke all on function public.record_billing_usage_event(uuid, text, numeric, integer, integer, text, text, jsonb) from public;
grant execute on function public.record_billing_usage_event(uuid, text, numeric, integer, integer, text, text, jsonb) to service_role;
