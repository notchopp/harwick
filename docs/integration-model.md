# Integration Model

## Meta / Instagram

Purpose:

- ingest Instagram DMs
- ingest Instagram comments
- reply when policy and permissions allow
- connect solo realtors, individual agents, teams, and brokerages to their own Page and Instagram professional accounts

Rules:

- Store Page ID and Instagram Business Account ID per integration account.
- Integration accounts can be workspace-scoped for shared team or brokerage channels, or member-scoped for an individual agent's own channel.
- A brokerage workspace can contain many member-owned Instagram integrations. Do not assume one Instagram account per workspace.
- Store provider tokens encrypted server-side.
- Normalize all Meta events into internal `lead_events`.
- Do not put Graph Explorer tokens in code or docs.
- App review and permissions are launch blockers, not afterthoughts.

## Follow Up Boss

Purpose:

- create or update contacts
- log notes, calls, texts, and source events
- sync assignment and stage metadata when supported

Rules:

- Customer API keys are workspace credentials.
- FUB sync should be queued and retryable.
- FUB sync jobs run through the Fly worker and `workflow_jobs`; do not call FUB inline from Meta or Retell webhooks.
- Every sync attempt writes a `crm_sync_log`.
- Never treat FUB as the only source of lead conversation history.

## Twilio

Purpose:

- support broader two-way SMS, outbound nurture, and SMS delivery persistence when Retell's in-call SMS is not enough
- optionally own/import phone numbers later if a customer needs custom telephony outside Retell-managed numbers

Rules:

- Validate Twilio signatures on inbound webhooks.
- Normalize phone numbers before lookup.
- Support opt-out states before nurture production.
- Separate staging and production numbers.

## Retell

Purpose:

- run voice agents for inbound and outbound qualification calls
- provision workspace-owned voice agents through Realty Ops
- provision the first voice phone number for each workspace or member-owned voice agent
- send call transcript, summary, extracted fields, and call metadata back through webhooks

Rules:

- Users should not paste unmanaged Retell agent IDs for the normal flow; the platform provisions and stores workspace-owned assets.
- Retell `agent_id` must resolve back to a workspace before call events mutate leads.
- Retell `phone_number` must be stored on the provisioned voice agent row before the number is shown to customers.
- Validate Retell webhooks.
- Treat transcripts as sensitive.
- Store extracted fields separately from raw transcript.
- Call outcomes normalize into the same lead event model as social and SMS.
