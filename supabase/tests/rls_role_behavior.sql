-- Role-behavior verification for workspace tenant boundaries.
-- Run against a migrated database with test fixtures.
-- Tests owner, assigned agent, unassigned member, and outsider access patterns.

begin;

-- Create test users in auth.users table
insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role)
values
  ('11111111-1111-1111-1111-111111111111', 'workspace-a-owner@test.local', crypt('password', gen_salt('bf')), now(), now(), now(), 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'workspace-a-assigned@test.local', crypt('password', gen_salt('bf')), now(), now(), now(), 'authenticated', 'authenticated'),
  ('33333333-3333-3333-3333-333333333333', 'workspace-a-unassigned@test.local', crypt('password', gen_salt('bf')), now(), now(), now(), 'authenticated', 'authenticated'),
  ('44444444-4444-4444-4444-444444444444', 'workspace-b-owner@test.local', crypt('password', gen_salt('bf')), now(), now(), now(), 'authenticated', 'authenticated'),
  ('55555555-5555-5555-5555-555555555555', 'outsider@test.local', crypt('password', gen_salt('bf')), now(), now(), now(), 'authenticated', 'authenticated'),
  ('66666666-6666-6666-6666-666666666666', 'new-agent@test.local', crypt('password', gen_salt('bf')), now(), now(), now(), 'authenticated', 'authenticated'),
  ('77777777-7777-7777-7777-777777777777', 'unauthorized-agent@test.local', crypt('password', gen_salt('bf')), now(), now(), now(), 'authenticated', 'authenticated');

-- Create test fixtures: two workspaces with members and leads
create temp table test_users (
  user_id uuid primary key,
  role_label text not null unique
) on commit drop;

insert into test_users (user_id, role_label)
values
  ('11111111-1111-1111-1111-111111111111', 'workspace_a_owner'),
  ('22222222-2222-2222-2222-222222222222', 'workspace_a_assigned_agent'),
  ('33333333-3333-3333-3333-333333333333', 'workspace_a_unassigned_agent'),
  ('44444444-4444-4444-4444-444444444444', 'workspace_b_owner'),
  ('55555555-5555-5555-5555-555555555555', 'outsider');

grant select on test_users to authenticated;

create temp table test_workspaces (
  workspace_id uuid primary key,
  workspace_label text not null unique
) on commit drop;

insert into test_workspaces (workspace_id, workspace_label)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'workspace-a'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'workspace-b');

grant select on test_workspaces to authenticated;

-- Insert workspace A: owner and two agents
insert into public.workspaces (id, name, slug)
select workspace_id, workspace_label, workspace_label
from test_workspaces
where workspace_label = 'workspace-a';

insert into public.workspace_members (id, workspace_id, user_id, role, display_name, is_active)
select
  gen_random_uuid(),
  (select workspace_id from test_workspaces where workspace_label = 'workspace-a'),
  user_id,
  case
    when role_label = 'workspace_a_owner' then 'owner'
    when role_label = 'workspace_a_assigned_agent' then 'agent'
    when role_label = 'workspace_a_unassigned_agent' then 'agent'
  end,
  role_label,
  true
from test_users
where role_label in ('workspace_a_owner', 'workspace_a_assigned_agent', 'workspace_a_unassigned_agent');

-- Insert workspace B: owner only
insert into public.workspaces (id, name, slug)
select workspace_id, workspace_label, workspace_label
from test_workspaces
where workspace_label = 'workspace-b';

insert into public.workspace_members (id, workspace_id, user_id, role, display_name, is_active)
select
  gen_random_uuid(),
  (select workspace_id from test_workspaces where workspace_label = 'workspace-b'),
  user_id,
  'owner',
  role_label,
  true
from test_users
where role_label = 'workspace_b_owner';

-- Insert test leads for workspace A
create temp table test_leads (
  lead_id uuid primary key,
  workspace_id uuid not null,
  assigned_agent_user_id uuid
) on commit drop;

insert into test_leads (lead_id, workspace_id, assigned_agent_user_id)
values
  (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    (select workspace_id from test_workspaces where workspace_label = 'workspace-a'),
    (select user_id from test_users where role_label = 'workspace_a_assigned_agent')
  ),
  (
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    (select workspace_id from test_workspaces where workspace_label = 'workspace-a'),
    null
  );

grant select on test_leads to authenticated;

insert into public.leads (
  id,
  workspace_id,
  status,
  source_channel,
  lead_type,
  intent,
  financing_status,
  assigned_agent_id
)
select
  tl.lead_id,
  tl.workspace_id,
  'new',
  'instagram_dm',
  'buyer',
  'medium',
  'unknown',
  wm.id
from test_leads tl
left join public.workspace_members wm
  on wm.workspace_id = tl.workspace_id
 and wm.user_id = tl.assigned_agent_user_id;

-- Test 1: Owner can read all workspace leads
do $$
declare
  visible_lead_count integer;
  owner_user_id uuid := (select user_id from test_users where role_label = 'workspace_a_owner');
begin
  set local role authenticated;
  execute format('set local request.jwt.claims to %L', json_build_object('sub', owner_user_id)::text);

  select count(*) into visible_lead_count
  from public.leads
  where workspace_id = (select workspace_id from test_workspaces where workspace_label = 'workspace-a');

  if visible_lead_count != 2 then
    raise exception 'Owner should see 2 workspace leads, saw %', visible_lead_count;
  end if;
end $$;

-- Test 2: Assigned agent can read only their assigned lead
do $$
declare
  visible_lead_count integer;
  assigned_agent_user_id uuid := (select user_id from test_users where role_label = 'workspace_a_assigned_agent');
begin
  set local role authenticated;
  execute format('set local request.jwt.claims to %L', json_build_object('sub', assigned_agent_user_id)::text);

  select count(*) into visible_lead_count
  from public.leads
  where workspace_id = (select workspace_id from test_workspaces where workspace_label = 'workspace-a');

  if visible_lead_count != 1 then
    raise exception 'Assigned agent should see 1 assigned lead, saw %', visible_lead_count;
  end if;
end $$;

-- Test 3: Unassigned workspace member cannot read any leads
do $$
declare
  visible_lead_count integer;
  unassigned_agent_user_id uuid := (select user_id from test_users where role_label = 'workspace_a_unassigned_agent');
begin
  set local role authenticated;
  execute format('set local request.jwt.claims to %L', json_build_object('sub', unassigned_agent_user_id)::text);

  select count(*) into visible_lead_count
  from public.leads
  where workspace_id = (select workspace_id from test_workspaces where workspace_label = 'workspace-a');

  if visible_lead_count != 0 then
    raise exception 'Unassigned agent should see 0 leads, saw %', visible_lead_count;
  end if;
end $$;

-- Test 4: Outsider cannot read workspace A leads
do $$
declare
  visible_lead_count integer;
  outsider_user_id uuid := (select user_id from test_users where role_label = 'outsider');
begin
  set local role authenticated;
  execute format('set local request.jwt.claims to %L', json_build_object('sub', outsider_user_id)::text);

  select count(*) into visible_lead_count
  from public.leads
  where workspace_id = (select workspace_id from test_workspaces where workspace_label = 'workspace-a');

  if visible_lead_count != 0 then
    raise exception 'Outsider should see 0 workspace A leads, saw %', visible_lead_count;
  end if;
end $$;

-- Test 5: Owner can update workspace settings
do $$
declare
  update_succeeded boolean := false;
  owner_user_id uuid := (select user_id from test_users where role_label = 'workspace_a_owner');
begin
  set local role authenticated;
  execute format('set local request.jwt.claims to %L', json_build_object('sub', owner_user_id)::text);

  update public.workspaces
  set name = 'Updated Workspace A'
  where id = (select workspace_id from test_workspaces where workspace_label = 'workspace-a');

  if found then
    update_succeeded := true;
  end if;

  if not update_succeeded then
    raise exception 'Owner should be able to update workspace settings';
  end if;
end $$;

-- Test 6: Agent cannot update workspace settings
do $$
declare
  update_succeeded boolean := false;
  agent_user_id uuid := (select user_id from test_users where role_label = 'workspace_a_assigned_agent');
begin
  set local role authenticated;
  execute format('set local request.jwt.claims to %L', json_build_object('sub', agent_user_id)::text);

  update public.workspaces
  set name = 'Attempted Agent Update'
  where id = (select workspace_id from test_workspaces where workspace_label = 'workspace-a');

  if found then
    update_succeeded := true;
  end if;

  if update_succeeded then
    raise exception 'Agent should not be able to update workspace settings';
  end if;
end $$;

-- Test 7: Owner can manage workspace members
do $$
declare
  insert_succeeded boolean := false;
  owner_user_id uuid := (select user_id from test_users where role_label = 'workspace_a_owner');
begin
  set local role authenticated;
  execute format('set local request.jwt.claims to %L', json_build_object('sub', owner_user_id)::text);

  insert into public.workspace_members (workspace_id, user_id, role, display_name, is_active)
  values (
    (select workspace_id from test_workspaces where workspace_label = 'workspace-a'),
    '66666666-6666-6666-6666-666666666666',
    'agent',
    'New Test Agent',
    true
  );

  insert_succeeded := true;

  if not insert_succeeded then
    raise exception 'Owner should be able to add workspace members';
  end if;
end $$;

-- Test 8: Agent cannot add new workspace members
do $$
declare
  insert_succeeded boolean := false;
  agent_user_id uuid := (select user_id from test_users where role_label = 'workspace_a_assigned_agent');
begin
  set local role authenticated;
  execute format('set local request.jwt.claims to %L', json_build_object('sub', agent_user_id)::text);

  begin
    insert into public.workspace_members (workspace_id, user_id, role, display_name, is_active)
    values (
      (select workspace_id from test_workspaces where workspace_label = 'workspace-a'),
      '77777777-7777-7777-7777-777777777777',
      'agent',
      'Unauthorized Agent',
      true
    );
    insert_succeeded := true;
  exception
    when insufficient_privilege or check_violation then
      insert_succeeded := false;
  end;

  if insert_succeeded then
    raise exception 'Agent should not be able to add workspace members';
  end if;
end $$;

-- Test 9: Assigned agent can update their assigned lead
do $$
declare
  update_succeeded boolean := false;
  agent_user_id uuid := (select user_id from test_users where role_label = 'workspace_a_assigned_agent');
  assigned_lead_id uuid := (
    select lead_id from test_leads
    where assigned_agent_user_id = agent_user_id
  );
begin
  set local role authenticated;
  execute format('set local request.jwt.claims to %L', json_build_object('sub', agent_user_id)::text);

  update public.leads
  set status = 'engaged'
  where id = assigned_lead_id;

  if found then
    update_succeeded := true;
  end if;

  if not update_succeeded then
    raise exception 'Assigned agent should be able to update their assigned lead';
  end if;
end $$;

-- Test 10: Agent cannot update unassigned lead
do $$
declare
  update_succeeded boolean := false;
  agent_user_id uuid := (select user_id from test_users where role_label = 'workspace_a_assigned_agent');
  unassigned_lead_id uuid := (
    select lead_id from test_leads
    where assigned_agent_user_id is null
  );
begin
  set local role authenticated;
  execute format('set local request.jwt.claims to %L', json_build_object('sub', agent_user_id)::text);

  update public.leads
  set status = 'engaged'
  where id = unassigned_lead_id;

  if found then
    update_succeeded := true;
  end if;

  if update_succeeded then
    raise exception 'Agent should not be able to update unassigned lead';
  end if;
end $$;

-- Test 11: Owner cannot read workspace B data
do $$
declare
  visible_workspace_count integer;
  workspace_a_owner_user_id uuid := (select user_id from test_users where role_label = 'workspace_a_owner');
begin
  set local role authenticated;
  execute format('set local request.jwt.claims to %L', json_build_object('sub', workspace_a_owner_user_id)::text);

  select count(*) into visible_workspace_count
  from public.workspaces
  where id = (select workspace_id from test_workspaces where workspace_label = 'workspace-b');

  if visible_workspace_count != 0 then
    raise exception 'Workspace A owner should not see workspace B, saw % workspaces', visible_workspace_count;
  end if;
end $$;

-- Test 12: Workspace members can read their own membership
do $$
declare
  visible_member_count integer;
  agent_user_id uuid := (select user_id from test_users where role_label = 'workspace_a_assigned_agent');
begin
  set local role authenticated;
  execute format('set local request.jwt.claims to %L', json_build_object('sub', agent_user_id)::text);

  select count(*) into visible_member_count
  from public.workspace_members
  where workspace_id = (select workspace_id from test_workspaces where workspace_label = 'workspace-a')
    and user_id = agent_user_id;

  if visible_member_count != 1 then
    raise exception 'Agent should see their own membership, saw %', visible_member_count;
  end if;
end $$;

-- Test 13: Outsider cannot read any workspace memberships
do $$
declare
  visible_member_count integer;
  outsider_user_id uuid := (select user_id from test_users where role_label = 'outsider');
begin
  set local role authenticated;
  execute format('set local request.jwt.claims to %L', json_build_object('sub', outsider_user_id)::text);

  select count(*) into visible_member_count
  from public.workspace_members;

  if visible_member_count != 0 then
    raise exception 'Outsider should see 0 memberships, saw %', visible_member_count;
  end if;
end $$;

select 'role-behavior-verification-passed' as status;

rollback;
