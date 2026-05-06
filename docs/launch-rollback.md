# Launch Rollback Notes

Use this when a staging or production launch check exposes a bad migration, provider misconfiguration, or unsafe runtime path. Do not run destructive SQL against production until a database backup or point-in-time recovery target is confirmed.

## General Order

1. Disable new inbound provider traffic first: pause Meta webhooks, Retell webhooks, Stripe webhooks, and scheduled Vercel cron calls before changing data.
2. Stop background mutation paths: pause the Fly worker or set worker concurrency to zero before reverting workflow or CRM behavior.
3. Preserve evidence: export affected rows from `audit_logs`, `provider_errors`, `workflow_jobs`, `crm_sync_logs`, `harwick_ai_turns`, `harwick_ai_tool_calls`, and provider webhook ledgers.
4. Roll forward when possible: add a compensating migration or feature flag before dropping tables or columns.
5. Re-run `npm run launch:check` and the provider-specific staging smoke test before re-enabling traffic.

## Recent Migration Groups

| Area | Migrations | Preferred rollback |
| --- | --- | --- |
| Billing and usage | `20260501000700_billing_and_usage_persistence.sql`, `20260506000200_billing_webhook_events.sql` | Disable checkout/portal/webhook routes by unsetting Stripe env vars, keep tables for ledger history, then reconcile subscriptions after fix. |
| Harwick loops | `20260506000100_harwick_loops.sql` | Disable `/api/agent-runtime/loops` cron and pause loop rows before schema changes. Preserve `harwick_loop_runs` as execution history. |
| Calendar/showings | `20260506000300_member_calendar_connections.sql`, `20260506000400_google_calendar_oauth_provider.sql`, `20260506000500_showing_booking_lifecycle.sql` | Unset Google Calendar OAuth env vars, disable showing approval route actions, keep calendar connection rows encrypted for reconnect/replay. |
| Workspace memory | `20260505001100_workspace_memory_documents.sql`, `20260505001200_workspace_memory_semantic_search.sql`, `20260505001400_workspace_memory_review_controls.sql` | Disable workspace-memory cron/retrieval first. Dismiss or unapprove bad memories rather than deleting learned records. |
| Agent trajectories and inline training | `20260505000500_agent_trajectory_logging.sql`, `20260505000600_signal_types_v2.sql`, `20260505000700_conversation_messages_agent_links.sql` | Stop reconcile/embed cron, keep trajectory and message links for audit/training continuity. |
| Social/listing AI context | `20260505000100_pgvector_listing_embeddings.sql`, `20260505000200_social_post_visual_description.sql`, `20260505000400_lead_document_column.sql` | Fall back to non-semantic/manual context paths; do not drop columns until app code no longer reads them. |

## Provider Configuration

- **Meta**: remove or pause the app webhook subscription before rolling back intake code. Keep OAuth credentials encrypted in Supabase unless compromise is suspected.
- **Follow Up Boss**: pause worker FUB jobs before changing credential or sync mapping code. Replay from `workflow_jobs` only after confirming idempotency keys.
- **Stripe**: do not delete webhook ledger rows. If a webhook handler bug lands, disable the webhook endpoint in Stripe, patch, then replay events from Stripe after deploy.
- **Google Calendar**: revoke test credentials from Google only after calendar connection rows are backed up. Existing encrypted tokens may be needed to debug booking failures.
- **Retell/Twilio**: disable webhooks before schema or parser rollback. Treat transcripts, phone numbers, and recordings as sensitive evidence.

