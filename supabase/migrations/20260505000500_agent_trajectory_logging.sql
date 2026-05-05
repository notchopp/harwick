-- Agent trajectory logging — the foundation for future RL, fine-tuning, and
-- in-context retrieval RL. Three tables capture (state, action, outcome) for
-- every agentic loop episode.
--
-- agent_trajectories — one row per episode (a full conversation outcome).
-- agent_steps        — one row per loop iteration (model turn + tool exec).
-- agent_outcomes     — delayed reward signals attributed back to trajectories
--                       (operator approve/dismiss/edit/takeover, lead reply,
--                        lead qualified/lost, appointment booked).
--
-- For RL: trajectories → states (steps.input_snapshot) + actions
--   (steps.turn_output) + rewards (outcomes.signal_type → reward function).
-- For fine-tune corpus: filter trajectories where outcome_label='positive',
--   use steps.input_snapshot + turn_output as supervised pairs.
-- For in-context retrieval RL: embed input_snapshot at decision time, fetch
--   top-N similar past trajectories with positive outcomes, inject as
--   few-shot examples. Behavior improves without gradient updates.

create table if not exists public.agent_trajectories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  channel text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  completion_reason text check (
    completion_reason is null
    or completion_reason in (
      'model_end_turn',
      'max_iterations',
      'queued_for_approval',
      'tool_failed',
      'no_tool_calls',
      'lead_replied',
      'lead_disengaged',
      'operator_takeover',
      'lead_qualified',
      'lead_lost'
    )
  ),
  outcome_label text check (
    outcome_label is null
    or outcome_label in ('positive', 'negative', 'neutral', 'pending')
  ) default 'pending',
  step_count int not null default 0,
  final_lead_status text,
  summary_text text,
  summary_embedding vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_trajectories_workspace_started_idx
  on public.agent_trajectories (workspace_id, started_at desc);

create index if not exists agent_trajectories_lead_idx
  on public.agent_trajectories (lead_id);

create index if not exists agent_trajectories_outcome_label_idx
  on public.agent_trajectories (workspace_id, outcome_label);

-- Vector index for in-context retrieval RL: at decision time we embed the
-- new state and find the top-N similar past trajectories with positive
-- outcomes. IVFFlat lists tuned for small workspaces.
create index if not exists agent_trajectories_summary_embedding_idx
  on public.agent_trajectories
  using ivfflat (summary_embedding vector_cosine_ops)
  with (lists = 50);

create table if not exists public.agent_steps (
  id uuid primary key default gen_random_uuid(),
  trajectory_id uuid not null references public.agent_trajectories(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  iteration int not null,
  created_at timestamptz not null default now(),
  -- Full state at decision time. Captures runtime input including lead
  -- document, policy narrative, conversation history, post context, etc.
  -- This is the "state" half of the (state, action, reward) tuple.
  input_snapshot jsonb not null,
  -- Embedding of the input snapshot for retrieval. Optional; populated
  -- async to avoid blocking the live path.
  input_embedding vector(1536),
  -- The model's full HarwickAiTurn output. The "action" half.
  turn_output jsonb not null,
  -- Per-tool execution results: which tools ran, which queued for approval,
  -- which failed, what each handler returned.
  tool_executions jsonb not null default '[]'::jsonb,
  -- Self-gate vs deterministic-gate shadow comparison. Lets us measure
  -- when the model's self-gate disagrees with the deterministic gate; once
  -- disagreement < 5% we delete the deterministic gate.
  self_gate_auto_execute boolean,
  self_gate_reason text,
  deterministic_gate_auto_execute boolean,
  gates_agreed boolean,
  -- Why this step ended (mirrors AgenticLoopOutcome.exitReason).
  exit_reason text,
  -- Pointer back to the persisted harwick_ai_turn row for joins.
  harwick_ai_turn_id uuid
);

create index if not exists agent_steps_trajectory_idx
  on public.agent_steps (trajectory_id, iteration);

create index if not exists agent_steps_workspace_created_idx
  on public.agent_steps (workspace_id, created_at desc);

create index if not exists agent_steps_lead_idx
  on public.agent_steps (lead_id);

create table if not exists public.agent_outcomes (
  id uuid primary key default gen_random_uuid(),
  trajectory_id uuid not null references public.agent_trajectories(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  attributed_to_step_id uuid references public.agent_steps(id) on delete set null,
  signal_type text not null check (
    signal_type in (
      'operator_approve',
      'operator_dismiss',
      'operator_edit',
      'operator_takeover',
      'operator_release',
      'lead_reply',
      'lead_no_reply',
      'lead_qualified',
      'lead_lost',
      'lead_appointment_booked',
      'lead_status_change'
    )
  ),
  signal_value jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now()
);

create index if not exists agent_outcomes_trajectory_idx
  on public.agent_outcomes (trajectory_id, recorded_at desc);

create index if not exists agent_outcomes_workspace_recorded_idx
  on public.agent_outcomes (workspace_id, recorded_at desc);

create index if not exists agent_outcomes_signal_type_idx
  on public.agent_outcomes (workspace_id, signal_type);

-- RLS: every read scoped to the user's workspace memberships.
alter table public.agent_trajectories enable row level security;
alter table public.agent_steps enable row level security;
alter table public.agent_outcomes enable row level security;

drop policy if exists agent_trajectories_workspace_read on public.agent_trajectories;
create policy agent_trajectories_workspace_read on public.agent_trajectories
  for select using (
    workspace_id in (
      select workspace_id from public.workspace_members where user_id = auth.uid()
    )
  );

drop policy if exists agent_steps_workspace_read on public.agent_steps;
create policy agent_steps_workspace_read on public.agent_steps
  for select using (
    workspace_id in (
      select workspace_id from public.workspace_members where user_id = auth.uid()
    )
  );

drop policy if exists agent_outcomes_workspace_read on public.agent_outcomes;
create policy agent_outcomes_workspace_read on public.agent_outcomes
  for select using (
    workspace_id in (
      select workspace_id from public.workspace_members where user_id = auth.uid()
    )
  );

-- Cosine-similarity retrieval over past trajectories for in-context RL.
-- Returns trajectories scoped to a workspace, ranked by similarity to a
-- query embedding, with an optional outcome filter (e.g. positive only).
create or replace function public.match_agent_trajectories(
  workspace uuid,
  query_embedding vector(1536),
  match_count int default 5,
  min_similarity float default 0.2,
  require_outcome text default null
)
returns table (
  id uuid,
  workspace_id uuid,
  lead_id uuid,
  channel text,
  started_at timestamptz,
  completed_at timestamptz,
  completion_reason text,
  outcome_label text,
  step_count int,
  final_lead_status text,
  summary_text text,
  similarity float
)
language sql stable
as $$
  select
    t.id,
    t.workspace_id,
    t.lead_id,
    t.channel,
    t.started_at,
    t.completed_at,
    t.completion_reason,
    t.outcome_label,
    t.step_count,
    t.final_lead_status,
    t.summary_text,
    1 - (t.summary_embedding <=> query_embedding) as similarity
  from public.agent_trajectories t
  where t.workspace_id = workspace
    and t.summary_embedding is not null
    and 1 - (t.summary_embedding <=> query_embedding) >= min_similarity
    and (require_outcome is null or t.outcome_label = require_outcome)
  order by t.summary_embedding <=> query_embedding asc
  limit match_count;
$$;
