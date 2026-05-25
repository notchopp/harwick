alter table public.harwick_ai_automation_policies
  alter column allowed_auto_actions set default array[
    'send_reply',
    'ask_qualification',
    'move_comment_to_dm',
    'send_buyer_blueprint',
    'dispatch_subagent'
  ];

alter table public.harwick_ai_automation_policies
  alter column allowed_auto_tools set default array[
    'send_meta_message',
    'send_meta_reply',
    'send_meta_dm',
    'dispatch_subagent'
  ];

update public.harwick_ai_automation_policies
set
  allowed_auto_tools = array(
    select distinct tool
    from unnest(
      allowed_auto_tools
      || array['send_meta_message', 'send_meta_reply', 'send_meta_dm', 'dispatch_subagent']::text[]
    ) as allowed_tools(tool)
  ),
  updated_at = now()
where not (
  'send_meta_message' = any(allowed_auto_tools)
  and 'dispatch_subagent' = any(allowed_auto_tools)
);

update public.harwick_ai_automation_policies
set
  allowed_auto_actions = array(
    select distinct action
    from unnest(
      allowed_auto_actions
      || array['dispatch_subagent']::text[]
    ) as allowed_actions(action)
  ),
  updated_at = now()
where not ('dispatch_subagent' = any(allowed_auto_actions));
