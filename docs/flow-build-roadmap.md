# Flow Build Roadmap

This roadmap keeps build order aligned with the Engineering Grail. Build the provider flows as production boundaries from the start: contracts, migrations, idempotency, tests, staging-safe env, and thin routes.

## Shared Spine

All lead channels should converge into:

```text
provider event
-> validate and normalize
-> write lead_events idempotently
-> create or update lead
-> classify and extract fields
-> score
-> assign or nurture
-> queue Follow Up Boss sync
-> show operator next action
```

## Voice First

Voice is first because calls need platform-owned Retell provisioning before the webhook can be fully live.

1. Model workspace-owned Retell assets in Supabase.
2. Provision or update Retell conversation flow and agent through the backend.
3. Store `retell_agent_id` and `retell_cf_id` on the workspace voice agent row.
4. Resolve Retell webhooks by `call.agent_id`.
5. Add `/api/retell/context` for compact pre-call workspace variables.
6. Extract real estate qualification fields from call analysis.
7. Score and assign the lead.
8. Queue Follow Up Boss sync.

## Instagram Next

Instagram already has event normalization, so the next gap is secure workspace connection.

1. Add Meta OAuth connection flow.
2. Store Page and Instagram Business Account IDs per workspace.
3. Encrypt credentials server-side.
4. Verify webhook signatures before production side effects.
5. Classify DM/comment intent.
6. Apply the same scoring, assignment, nurture, and CRM sync spine as voice.

## Done Standard

Every flow slice needs:

- package-level schemas or typed contracts
- integration normalization tests
- webhook malformed-payload tests
- idempotency tests for persisted events
- `npm run release:check`
- `npm run build`
- staging provider notes before live writes
