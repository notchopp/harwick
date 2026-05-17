-- Auto-recharge wiring. Adds a single "pending" timestamp to the wallet that
-- the debit RPC sets when the balance crosses below the threshold. A cron
-- route polls pending wallets every minute, fires the Stripe PaymentIntent,
-- and clears the flag. Webhook credit lands asynchronously and bumps balance
-- back above threshold so the next debit won't re-arm.

alter table public.workspace_usage_wallet
  add column if not exists auto_recharge_pending_at timestamptz;

create index if not exists workspace_usage_wallet_auto_recharge_pending_idx
  on public.workspace_usage_wallet (auto_recharge_pending_at)
  where auto_recharge_pending_at is not null;

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
  v_auto_enabled boolean;
  v_threshold integer;
  v_pending_at timestamptz;
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

    -- Arm auto-recharge if the new balance crossed below the threshold and
    -- we haven't recently flagged one. The cron clears the flag once the
    -- PaymentIntent is created (webhook credit happens later, idempotently).
    select auto_recharge_enabled, auto_recharge_threshold_cents, auto_recharge_pending_at
    into v_auto_enabled, v_threshold, v_pending_at
    from public.workspace_usage_wallet
    where workspace_id = p_workspace_id;

    if coalesce(v_auto_enabled, false)
      and v_balance < coalesce(v_threshold, 0)
      and (v_pending_at is null or v_pending_at < now() - interval '15 minutes')
    then
      update public.workspace_usage_wallet
      set auto_recharge_pending_at = now()
      where workspace_id = p_workspace_id;
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

-- Re-apply credit RPC with auto_recharge_pending_at clear on successful
-- credit so a future below-threshold event can re-arm cleanly. Behaviour
-- otherwise matches the original migration (see 20260517000200) — keeps
-- the error message and upsert semantics identical.
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
    auto_recharge_pending_at = null,
    updated_at = now()
  returning balance_cents into v_balance;

  return v_balance;
end;
$$;
