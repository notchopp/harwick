-- AI-native labeling pipeline v2: extend signal_type enum.
--
-- Six explicit operator tags (operator clicks something we observe directly):
--   operator_approve, operator_dismiss, operator_edit, operator_takeover,
--   routing_accepted, routing_overridden.
--
-- Inline tags (operator labels a specific step good/bad/note):
--   operator_tag_positive, operator_tag_negative, operator_tag_note.
--
-- Implicit signals (background reconciliation worker derives these):
--   reply_engaged       — auto-sent reply, lead responded within window
--   reply_no_engagement — auto-sent reply, lead ghosted past window
--   qualification_completed — lead qualified entirely on auto path
--   fub_accepted        — FUB sync succeeded (no conflict, no rejection)
--   showing_booked      — showing task closed as booked
--   converted           — deal closed_won
--   churned             — lead reached closed_lost / archived
--   operator_release    — operator handed thread back to AI (neutral signal)
--
-- Operator never knows they're labeling a training corpus. They use Harwick;
-- Harwick records.
alter table public.agent_outcomes
  drop constraint if exists agent_outcomes_signal_type_check;

alter table public.agent_outcomes
  add constraint agent_outcomes_signal_type_check
  check (signal_type in (
    'operator_approve',
    'operator_dismiss',
    'operator_edit',
    'operator_takeover',
    'operator_release',
    'operator_tag_positive',
    'operator_tag_negative',
    'operator_tag_note',
    'routing_accepted',
    'routing_overridden',
    'lead_reply',
    'lead_no_reply',
    'lead_qualified',
    'lead_lost',
    'lead_appointment_booked',
    'lead_status_change',
    'reply_engaged',
    'reply_no_engagement',
    'qualification_completed',
    'fub_accepted',
    'showing_booked',
    'converted',
    'churned'
  ));
