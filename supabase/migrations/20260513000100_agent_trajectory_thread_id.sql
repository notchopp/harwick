-- Thread-scoped memory for the Harwick assistant. Lets the runtime load prior
-- turns from the same rail thread and feed them into the model as conversation
-- history, so cross-turn references ("route those to me", "what about yesterday")
-- actually resolve.
--
-- thread_id is a client-supplied string (e.g., "thread-1736812345") rather than
-- a uuid, because the rail manages threads in localStorage and we don't want
-- to require server-side thread provisioning before the first message.

alter table public.agent_trajectories
  add column if not exists thread_id text;

create index if not exists agent_trajectories_thread_idx
  on public.agent_trajectories (workspace_id, thread_id, started_at desc)
  where thread_id is not null;
