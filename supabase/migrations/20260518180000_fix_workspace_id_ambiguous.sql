-- The previous version of create_workspace_for_current_user declared its
-- OUT columns as workspace_id / workspace_slug. In plpgsql those names
-- shadow real columns of the same name on workspace_members,
-- workspace_usage_wallet, and harwick_ai_automation_policies — which made
-- `on conflict (workspace_id)` and column-list inserts blow up with
-- "column reference workspace_id is ambiguous". Rename the OUT params
-- with the v_ prefix used by the locals so the column references in the
-- function body unambiguously refer to the tables.

drop function if exists public.create_workspace_for_current_user(text, text);

create or replace function public.create_workspace_for_current_user(
  p_name text,
  p_slug_base text
)
returns table(workspace_id uuid, workspace_slug text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user auth.users%rowtype;
  v_slug text;
  v_suffix integer := 0;
  v_member_name text;
  v_workspace_id uuid;
  v_workspace_slug text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'workspace_name_required';
  end if;

  select * into v_user
  from auth.users
  where id = auth.uid();

  if v_user.id is null then
    raise exception 'user_not_found';
  end if;

  v_slug := lower(regexp_replace(coalesce(nullif(trim(p_slug_base), ''), trim(p_name)), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if length(v_slug) < 2 then
    v_slug := 'workspace';
  end if;
  v_slug := left(v_slug, 72);

  while exists (select 1 from public.workspaces w where w.slug = case when v_suffix = 0 then v_slug else v_slug || '-' || v_suffix::text end) loop
    v_suffix := v_suffix + 1;
  end loop;
  if v_suffix > 0 then
    v_slug := v_slug || '-' || v_suffix::text;
  end if;

  insert into public.workspaces (name, slug)
  values (trim(p_name), v_slug)
  returning id, slug into v_workspace_id, v_workspace_slug;

  v_member_name := coalesce(
    nullif(v_user.raw_user_meta_data ->> 'full_name', ''),
    nullif(v_user.raw_user_meta_data ->> 'name', ''),
    split_part(coalesce(v_user.email, 'Owner'), '@', 1),
    'Owner'
  );

  insert into public.workspace_members (
    workspace_id,
    user_id,
    role,
    display_name,
    email,
    is_active
  )
  values (
    v_workspace_id,
    v_user.id,
    'owner',
    v_member_name,
    v_user.email,
    true
  );

  insert into public.workspace_usage_wallet (workspace_id, balance_cents)
  values (v_workspace_id, 0)
  on conflict (workspace_id) do nothing;

  insert into public.harwick_ai_automation_policies (
    workspace_id,
    scope,
    automation_mode,
    auto_send_enabled
  )
  values (
    v_workspace_id,
    'workspace',
    'ai_on',
    false
  )
  on conflict do nothing;

  workspace_id := v_workspace_id;
  workspace_slug := v_workspace_slug;
  return next;
end;
$$;

revoke all on function public.create_workspace_for_current_user(text, text) from public;
grant execute on function public.create_workspace_for_current_user(text, text) to authenticated;
