-- Workspace invitations — owner/admin invites a teammate by email, they receive
-- a shareable /invite/<token> URL, they sign up (or sign in) and the workspace
-- membership is created on accept. Plan seat limit enforced at create time.

create table if not exists public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invited_by_member_id uuid not null references public.workspace_members(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner', 'admin', 'member', 'viewer')),
  token text not null unique,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by_member_id uuid references public.workspace_members(id),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists workspace_invitations_workspace_idx
  on public.workspace_invitations (workspace_id, created_at desc);

create index if not exists workspace_invitations_email_idx
  on public.workspace_invitations (lower(email));

alter table public.workspace_invitations enable row level security;

-- Members of the workspace can read invitations for their workspace (so the
-- /team page can list pending invites). Writes go through service role from
-- the API routes, which check role permissions explicitly.
create policy "workspace_invitations_member_select"
  on public.workspace_invitations
  for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_invitations.workspace_id
        and wm.user_id = auth.uid()
        and wm.is_active = true
    )
  );

-- Lookup-by-token RPC. Returns minimal fields (workspace name + slug, role,
-- inviter display name, expiry, accepted status). Public — anyone with the
-- token can preview, but cannot accept without signing in.
create or replace function public.preview_workspace_invitation(p_token text)
returns table(
  workspace_id uuid,
  workspace_name text,
  workspace_slug text,
  invited_email text,
  role text,
  inviter_display_name text,
  expires_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    w.id,
    w.name,
    w.slug,
    inv.email,
    inv.role,
    coalesce(m.display_name, ''),
    inv.expires_at,
    inv.accepted_at,
    inv.revoked_at
  from public.workspace_invitations inv
    join public.workspaces w on w.id = inv.workspace_id
    left join public.workspace_members m on m.id = inv.invited_by_member_id
  where inv.token = p_token
  limit 1;
end;
$$;

grant execute on function public.preview_workspace_invitation(text) to anon, authenticated;

-- Accept RPC — must be invoked by an authenticated user. Validates the token,
-- creates a workspace_members row, marks the invitation accepted. Idempotent:
-- if a membership already exists, just stamps accepted_at.
create or replace function public.accept_workspace_invitation(p_token text)
returns table(workspace_id uuid, workspace_slug text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.workspace_invitations%rowtype;
  v_user auth.users%rowtype;
  v_member_id uuid;
  v_existing_member_id uuid;
  v_workspace_slug text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_inv
  from public.workspace_invitations
  where token = p_token
  limit 1;

  if v_inv.id is null then
    raise exception 'invitation_not_found';
  end if;
  if v_inv.revoked_at is not null then
    raise exception 'invitation_revoked';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'invitation_expired';
  end if;

  select * into v_user from auth.users where id = auth.uid();
  if v_user.id is null then
    raise exception 'user_not_found';
  end if;

  -- Strict email match — invitation is for a specific address, not generic.
  if lower(v_user.email) <> lower(v_inv.email) then
    raise exception 'invitation_email_mismatch';
  end if;

  select id into v_existing_member_id
  from public.workspace_members
  where workspace_id = v_inv.workspace_id
    and user_id = v_user.id;

  if v_existing_member_id is not null then
    update public.workspace_members
    set is_active = true, updated_at = now()
    where id = v_existing_member_id;
    v_member_id := v_existing_member_id;
  else
    insert into public.workspace_members (
      workspace_id,
      user_id,
      role,
      display_name,
      email,
      is_active
    )
    values (
      v_inv.workspace_id,
      v_user.id,
      v_inv.role,
      coalesce(
        nullif(v_user.raw_user_meta_data ->> 'full_name', ''),
        nullif(v_user.raw_user_meta_data ->> 'name', ''),
        split_part(coalesce(v_user.email, 'Member'), '@', 1),
        'Member'
      ),
      v_user.email,
      true
    )
    returning id into v_member_id;
  end if;

  update public.workspace_invitations
  set accepted_at = now(), accepted_by_member_id = v_member_id
  where id = v_inv.id and accepted_at is null;

  select slug into v_workspace_slug from public.workspaces where id = v_inv.workspace_id;

  workspace_id := v_inv.workspace_id;
  workspace_slug := v_workspace_slug;
  return next;
end;
$$;

revoke all on function public.accept_workspace_invitation(text) from public;
grant execute on function public.accept_workspace_invitation(text) to authenticated;
