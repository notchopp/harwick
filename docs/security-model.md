# Security Model

## Baseline

Realty Ops handles lead data, phone numbers, messages, call transcripts, CRM records, and third-party integration credentials. Treat it as sensitive business data even though it is not healthcare PHI.

## Secrets

- Never commit real secrets.
- Store provider credentials server-side only.
- Encrypt workspace integration credentials before persistence.
- Do not expose service-role keys, provider access tokens, webhook secrets, or CRM keys to client code.
- Do not log raw tokens, access-token fragments, webhook signatures, raw call recording URLs, or raw lead payloads.

## Webhooks

- Meta webhook GET challenge must verify `hub.verify_token`.
- Meta webhook POST should verify request signatures when production-ready.
- Twilio webhooks must validate Twilio signatures.
- Retell webhooks must validate Retell signatures or configured webhook secret.
- Duplicate webhook events must be idempotent.
- Malformed webhook payloads should be rejected before side effects.

## Tenant Boundaries

- Every workspace-owned table must carry `workspace_id`.
- Broker users can read workspace-scoped data.
- Agent users can read only assigned leads, assigned tasks, and allowed conversation history.
- Admin overrides must be audited.
- RLS policies must be tested with owner, assigned agent, unassigned agent, and outsider cases before production.

## Messaging Safety

- SMS nurture requires opt-out handling.
- Outbound automation should honor quiet hours before production.
- AI responses must never claim legal, mortgage, or financial certainty.
- Escalate instead of guessing when the lead asks for legal, lending, contract, or emergency-specific advice.

## Observability

- Capture integration errors with provider, workspace, event type, and retry metadata.
- Do not capture full raw message bodies by default in production error tools.
- Redact phone numbers, emails, tokens, and CRM keys from logs.

