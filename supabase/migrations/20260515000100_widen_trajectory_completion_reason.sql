-- agent_trajectories.completion_reason previously accepted only the hand-rolled
-- agentic-loop exit reasons (model_end_turn, max_iterations, etc.). The
-- rail's ai-sdk runtime persists ai-sdk finish reasons here directly
-- (stop, length, content-filter, tool-calls, error, other), which the old
-- constraint rejected — so every rail trajectory's completeTrajectory()
-- update was silently failing inside the route's try/catch, leaving
-- trajectories permanently completed_at=null and step_count=0.
--
-- Widening the constraint to accept both vocabularies. The old values stay
-- valid for the agentic-loop path; ai-sdk finish reasons + a generic
-- 'completed' fallback land cleanly too.

alter table public.agent_trajectories
  drop constraint if exists agent_trajectories_completion_reason_check;

alter table public.agent_trajectories
  add constraint agent_trajectories_completion_reason_check
  check (
    completion_reason is null
    or completion_reason = any (array[
      -- Legacy agentic-loop exit reasons
      'model_end_turn', 'max_iterations', 'queued_for_approval', 'tool_failed',
      'no_tool_calls', 'lead_replied', 'lead_disengaged', 'operator_takeover',
      'lead_qualified', 'lead_lost',
      -- ai-sdk finishReason values
      'stop', 'length', 'content-filter', 'tool-calls', 'error', 'other', 'unknown',
      -- Generic fallback used when the runtime exits without a finishReason
      'completed'
    ])
  );
