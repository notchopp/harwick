# Realty Ops Engineering Grail

This is the persistent engineering standard for the realtor lead operating system. Treat it as the default checklist before creating files, route handlers, schemas, integrations, jobs, UI, tests, or migrations.

## Mission

Realty Ops turns inbound realtor demand into qualified, assigned, CRM-synced leads.

The product should optimize for:

- fast response to Instagram DMs, comments, calls, and SMS
- stable multi-tenant boundaries for solo realtors, agents, teams, and brokerages
- typed contracts at every system boundary
- secure storage of integration credentials
- tested workflow decisions
- quiet, premium, operational UI
- production-readable logging and errors

## File Ownership

- `apps/web/src/app/*`: route boundaries and minimal composition.
- `apps/web/src/features/*`: product workflows and feature composition.
- `apps/web/src/components/*`: reusable UI primitives and app shell.
- `apps/web/src/lib/*`: web-only helpers.
- `apps/worker/src/*`: Fly-hosted background worker runtime, job claiming, and job dispatch.
- `packages/core/src/domains/*`: Zod schemas, DTOs, enums, and derived types.
- `packages/core/src/tokens/*`: shared product tokens.
- `packages/integrations/src/*`: Meta, Twilio, Retell, Follow Up Boss normalization and signature helpers.
- `packages/api-client/src/*`: typed client for app API routes.
- `supabase/migrations/*`: database schema and RLS policy source of truth.
- `docs/*`: architecture and product rules.

## Product Rules

- Customer zero is one realtor, but every architecture choice should support solo realtors, agents under brokerages, teams, and many brokerages.
- Instagram DMs and comments are day-one core channels.
- Instagram integrations may be member-owned or workspace-owned.
- Follow Up Boss is the CRM of record for customer zero.
- Retell handles voice calls and first-party voice number provisioning for the initial flow.
- Twilio or Retell SMS may be used depending on channel needs, but nurture/outbound SMS must pass opt-out, quiet-hour, and staging-number controls before production.
- The app is not a generic CRM replacement. It is the lead intake, qualification, routing, and nurture layer.

## Data Rules

- New API request and response bodies require schemas in `packages/core`.
- Untrusted webhook payloads must be validated before use.
- Provider-specific payloads normalize into internal events before touching business logic.
- Supabase migrations are source of truth for DB changes.
- Every tenant-owned table must include workspace scoping.
- Follow Up Boss, Meta, Retell, and Twilio credentials are encrypted server-side and never exposed to client bundles.

## Workflow Rules

- Lead creation is idempotent by provider identity and source event.
- Every inbound event writes an audit event.
- Background follow-through runs through `workflow_jobs`; webhook routes should enqueue durable work instead of doing slow external follow-through inline.
- Hot lead routing must be explainable from score, source, timeline, budget, preapproval, and engagement.
- Human handoff must preserve transcript, summary, source, and recommended next action.
- Nurture messages must support opt-out and quiet-hour rules before production.

## Testing Standard

Add or update tests when changing:

- schemas and DTOs
- webhook parsing and normalization
- lead scoring
- assignment rules
- nurture enrollment
- CRM sync decisions
- API client request or response behavior
- RLS policies or sensitive migrations

Minimum release gate:

```bash
npm run release:check
```

Use targeted checks during iteration:

```bash
npm run constraints:check
npm run typecheck
npm test
npm run lint
```

## Definition Of Done

A change is done only when:

- it follows file ownership rules
- cross-boundary behavior has typed schemas
- untrusted input is validated
- security-sensitive behavior is tested or explicitly documented as pending
- environment and secret requirements are reflected in examples
- release checks pass once dependencies are available
