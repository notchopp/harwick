# Harwick

Harwick is a production-first AI operating layer for real estate teams and brokerages. The system captures inbound demand from social channels and voice calls, qualifies leads, routes work to the right operator, syncs qualified opportunities to Follow Up Boss, and keeps enough audit state for a brokerage to understand why each lead changed.

This README is an internal engineering reference. It is not marketing copy and should be kept accurate as the backend evolves.

## Product Scope

Harwick is built as a multi-tenant workspace platform. A workspace represents a brokerage, team, or solo realtor business. Each workspace owns its integrations, voice agents, connected Meta accounts, CRM credentials, listing facts, routing rules, lead events, and worker job state.

The north-star flow is:

```text
Instagram, Facebook, or voice call
-> validate provider payload or signature
-> normalize into internal events
-> create or update a lead
-> qualify, score, assign, and create tasks
-> draft or send governed replies where allowed
-> sync qualified leads to Follow Up Boss
-> reconcile downstream CRM activity
-> surface operator work queues and system health
```

## Current Backend Capabilities

### Social Intake

- Meta webhook intake for Instagram and Facebook comments/messages.
- Provider normalization into internal lead events.
- Post context hydration through Meta Graph where available.
- Stored social post context for captions, permalinks, media type, areas, CTA hints, and listing hints.
- OpenAI-powered reply drafting with lead context and post context.
- Audited outbound Meta reply send for DMs/comments.
- Social operator queue for pending DM/comment replies, approve/send/dismiss actions, and send failure state.

### Voice Intake

- Retell provisioning path for workspace-owned agents, conversation flows, and phone numbers.
- Retell dynamic call context for workspace, known caller, lead id, transfer destination, and assigned member context.
- Retell tools:
  - `create_lead_handoff`
  - `lookup_listing`
  - `transfer_call`
  - `end_call`
- Voice handoff persistence and qualification job enqueueing.
- Known-caller lookup and assigned-member transfer routing.
- Voice handoff operator queue with callback task creation, review, and dismiss actions.

### Lead Workflow

- Deterministic scoring and qualification contracts in `packages/core`.
- Worker job foundation for qualification, assignment, FUB sync, back-sync reconciliation, and task creation.
- Assignment routing that can prefer source-owned/member-owned channels and balance work across eligible teammates.
- Lead tasks for callbacks, listing verification, assignment review, FUB retry, and nurture review.
- Nurture execution foundation with opt-out detection, quiet-hour blocking, step scheduling, durable worker jobs, and reviewable outbound drafts.

### Follow Up Boss

- Outbound sync for qualified leads through worker jobs.
- Workspace-scoped FUB credential model through encrypted integration accounts.
- Webhook subscription and back-sync foundation.
- Reconciliation for bounded FUB person, stage, call, text, task, and note activity.
- Correlation metadata to suppress self-echo loops where Realty Ops caused the FUB change.
- CRM and worker failure operations APIs for failed sync visibility, workflow retry/dismiss actions, and provider error review.

### Listings

The active launch path does not depend on Repliers or live MLS approval.

- Workspace-scoped manual listing facts stored in `listing_facts`.
- Manual listing create/list API.
- CSV listing import API with normalization for common headers.
- Quick update API for price, status, beds, baths, pool, notes, URLs, incentives, address, and MLS number.
- Verification API for "verified now" workflows.
- Verification metadata:
  - `verification_status`
  - `verified_by_member_id`
  - `verified_at`
  - `needs_recheck_at`
- Voice listing lookup answers from verified/manual workspace facts and avoids guessing when facts are missing.
- Stale or missing provider-backed facts can create `verify_listing` tasks for known leads.

Repliers support exists behind an integration abstraction, but it is dormant until licensing, brokerage approval, and credentials are ready.

## Architecture

The repo is structured as a monorepo:

```text
apps/web
  Next.js app, API route handlers, feature services, Supabase adapters

apps/worker
  Background job runner and workflow processors

packages/core
  Shared contracts, Zod schemas, workflow decisions, logger, normalization primitives

packages/integrations
  Provider clients, signature verification, provider payload normalization

packages/api-client
  API transport and response validation utilities

supabase/migrations
  Source of truth for database schema and RLS-related changes

docs
  Engineering guardrails, product memory, security model, environment model, integration model
```

## Engineering Rules

Before changing code, read `AGENTS.md` and `docs/codex-agent-constraints.json`.

Key constraints:

- Shared contracts and cross-boundary DTOs live in `packages/core`.
- Provider-specific mapping and signature verification live in `packages/integrations`.
- API routes stay thin and compose feature services.
- Feature logic lives under `apps/web/src/features`.
- Supabase migrations are the source of truth for DB changes.
- Every workspace-owned row must include `workspace_id`.
- Provider credentials must be encrypted before persistence.
- Public API routes validate body, params, query, and auth before side effects.
- Never commit real tokens, API keys, access tokens, service-role keys, webhook secrets, or CRM credentials.

## Local Commands

Install dependencies:

```bash
npm install
```

Run the web app:

```bash
npm run dev
```

Run the worker:

```bash
npm run worker:dev
```

Run the production gate:

```bash
npm run release:check
```

Build the web app:

```bash
npm run build
```

Apply a single Supabase migration:

```bash
npm run supabase:migrate -- supabase/migrations/<migration-file>.sql
```

## Required Verification

For structural changes, run:

```bash
npm run release:check
npm run build
```

If worker contracts or job behavior changed, also run the relevant worker tests or worker build path.

## Environment Model

Use `.env.example` and `.env.staging.example` as references. Do not commit `.env`, `.env.local`, `.env.*.local`, service-role keys, provider access tokens, or API secrets.

Important environment groups:

- Supabase runtime and service role keys.
- Meta app credentials and webhook verification token.
- Retell API key and voice agent configuration.
- OpenAI API key and reply model.
- Follow Up Boss credentials through encrypted integration accounts.
- Optional listing provider fallback variables for future Repliers use.

## Database

All schema changes must be represented under `supabase/migrations`.

Current major tables include:

- `workspaces`
- `workspace_members`
- `integration_accounts`
- `workspace_voice_agents`
- `leads`
- `lead_events`
- `voice_lead_handoffs`
- `workflow_jobs`
- `lead_tasks`
- `nurture_enrollments`
- `listing_facts`
- `social_posts`
- `meta_account_foundations`
- `follow_up_boss_webhook_subscriptions`
- `crm_backsync_events`
- `crm_sync_logs`
- `provider_error_logs`
- `worker_heartbeats`

## Backend Work Remaining

The backend is functional across the main intake surfaces, but these slices remain before the system should be treated as fully backend-complete:

1. Nurture execution:
   - connect drafted nurture messages to the selected production SMS/social delivery provider
   - add delivery receipts and provider callback reconciliation
   - expose approve/send/dismiss APIs for nurture drafts

2. Listing task closure loop:
   - expose listing recheck queue APIs for operators

3. Social operator queue backend:
   - persist OpenAI draft output directly onto queue items
   - add conversation-thread endpoints around queue records

4. Voice operator queue backend:
   - safe transcript and summary fields
   - post-call analysis status beyond handoff summaries

5. CRM and worker operations visibility:
   - FUB ownership conflict surfacing
   - richer stuck-job recovery controls beyond retry/dismiss

6. Workspace readiness backend:
   - Meta readiness
   - FUB readiness
   - voice readiness
   - listing source readiness
   - worker health readiness

7. Unified lead timeline:
   - merge Meta, voice, FUB, tasks, replies, assignments, and listing events
   - enforce redaction and workspace access boundaries

8. Final production hardening:
   - rate limits on public-ish routes
   - idempotency coverage pass
   - staging/prod configuration checks
   - provider error logging coverage pass

## Current Priority

Backend first. UI work should wait until the remaining backend slices are complete enough that screens can bind to real operational data instead of placeholders.
