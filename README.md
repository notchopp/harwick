# Realty Ops / Harwick

Realty Ops is the internal repo name for the Harwick product surface. Harwick is a production-first AI operating layer for real estate teams and brokerages. The system captures inbound demand from social channels, public listing pages, and voice calls, holds conversations before a human is needed, qualifies leads, routes work to the right operator or agent, syncs qualified opportunities to Follow Up Boss, and keeps enough audit state for a brokerage to understand why each lead changed.

This README is an internal engineering reference. It is not marketing copy and should be kept accurate as the backend evolves.

## Product Scope

Harwick is built as a multi-tenant workspace platform. A workspace represents a brokerage, team, or solo realtor business. Each workspace owns its integrations, voice agents, connected Meta accounts, CRM credentials, listing facts, routing rules, lead events, and worker job state.

The north-star flow is:

```text
Instagram, Facebook, or voice call
-> validate provider payload or signature
-> normalize into internal events
-> create or update a lead
-> run Harwick AI with conversation, listing, tone, calendar, and policy context
-> qualify, score, assign, create tasks, and update conversation state
-> auto-send, queue approval, or pause based on automation policy
-> sync qualified leads to Follow Up Boss
-> reconcile downstream CRM activity
-> surface operator work queues and system health
```

## Current Backend Capabilities

### Harwick AI Runtime

Harwick AI is no longer just a reply prompt. It is modeled as a typed runtime that returns a full conversation turn:

- conversation state and isolated per-thread memory
- qualification state for buyer, seller, renter, and unknown leads
- workspace and agent tone profile inputs
- listing context and post context inputs
- calendar/showing context inputs
- safety flags, confidence, missing fields, and handoff brief
- state patches for durable conversation memory
- typed tool calls for the next action

Runtime contracts live in `packages/core/src/domains/harwick-ai-runtime.ts`.

The current runtime supports tools such as:

- `send_meta_reply`
- `send_meta_dm`
- `check_calendar`
- `request_showing_approval`
- `register_open_house`
- `route_lead`
- `sync_follow_up_boss`
- `pause_automation`

Tool execution is governed by `packages/core/src/domains/harwick-ai-automation-policy.ts` and `packages/integrations/src/harwick-ai-tools.ts`. The AI decides what should happen; automation policy decides whether it is allowed to auto-send; the executor performs, queues, or blocks the tool call.

The current default policy allows safe, high-confidence social replies and qualification questions to auto-send. Showing approvals, routing, CRM sync, pause actions, and risky legal/lending/valuation cases remain approval-gated unless a future policy explicitly allows them.

### Social Intake

- Meta webhook intake for Instagram and Facebook comments/messages.
- Provider normalization into internal lead events.
- Post context hydration through Meta Graph where available.
- Stored social post context for captions, permalinks, media type, areas, CTA hints, and listing hints.
- Harwick AI runtime for reply turns, state patches, safety flags, tool calls, and legacy draft compatibility.
- Local deterministic Harwick AI runtime for development and test paths.
- OpenAI-backed Harwick AI runtime for production model calls.
- Audited outbound Meta reply send for DMs/comments.
- Social operator queue for pending DM/comment replies, approve/send/dismiss actions, automation pause/resume, scoped human takeover, and send failure state.
- Conversation-thread endpoint for queue records.

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
- Conversation-scoped automation state so one lead thread can be paused or taken over without disabling AI for other leads or agents.
- Lead timeline API that merges lead events, tasks, voice handoffs, CRM sync logs, CRM back-sync events, and nurture messages with redaction.

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
- Listing media upload API for workspace listing photos/videos.
- Verification API for "verified now" workflows.
- Verification metadata:
  - `verification_status`
  - `verified_by_member_id`
  - `verified_at`
  - `needs_recheck_at`
- Voice listing lookup answers from verified/manual workspace facts and avoids guessing when facts are missing.
- Stale or missing provider-backed facts can create `verify_listing` tasks for known leads.
- Internal listings page reuses the public listing card language with operator actions such as pending, sold, verify, recheck, public, import CSV, and add listing.
- Public workspace listings route supports a branded inventory surface for leads to browse, open details, inquire, and feed back into intake.

Repliers support exists behind an integration abstraction, but it is dormant until licensing, brokerage approval, and credentials are ready.

### App UI And Operations

The web app is now more than the first dashboard shell:

- `/home`: operator work surface with queue, routing desk, health, recent leads, and role-aware context.
- `/leads`: list/card lead views with filters, pagination, detail sheet, automation state, and timeline-backed context.
- `/conversations`: conversation workspace backed by conversation data contracts.
- `/listings`: internal inventory management with list/card views, pagination, manual listing actions, CSV import, and media upload.
- `/integrations`: customer-owned connections for Meta, Follow Up Boss, and calendar-facing setup surfaces.
- `/login`: minimal Supabase-auth login screen.
- shared app shell, workspace topbar, muted navigation, design tokens, and shadcn/Radix-based primitives.

The UI should remain an operator work surface, not a CRM clone or marketing dashboard.

### Health And Readiness

There are two health surfaces:

- `/api/health/readiness`: internal production readiness check with missing environment requirements.
- `/api/health/systems`: product-safe systems health response for UI surfaces.

The product-safe health API exposes labels such as Lead intake, Harwick AI, Voice system, Listing system, CRM sync, and Background jobs. It intentionally avoids leaking internal stack or vendor names.

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
  Provider clients, signature verification, provider payload normalization, Harwick AI runtime adapters, tool execution

packages/api-client
  API transport and response validation utilities

supabase/migrations
  Source of truth for database schema and RLS-related changes

docs
  Engineering guardrails, product memory, security model, environment model, integration model
```

## Engineering Rules

Before changing code, read `AGENTS.md`, `docs/codex-agent-constraints.json`, and `docs/paid-launch-map.md`.

`docs/paid-launch-map.md` is the current execution spine from this codebase state to paid launch. It maps what is done, partial, and not started, and should guide the next highest-priority build slice unless the user explicitly redirects.

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
- `social_reply_reviews`
- `conversation_automation_states`
- `listing_media`

## Backend Work Remaining

The backend is functional across the main intake surfaces, Harwick AI runtime, work queues, listings, integrations, and health surfaces. These slices remain before the system should be treated as fully backend-complete:

1. Nurture execution:
   - connect drafted nurture messages to the selected production SMS/social delivery provider
   - add delivery receipts and provider callback reconciliation
   - expose approve/send/dismiss APIs for nurture drafts

2. Voice operator queue backend:
   - safe transcript and summary fields
   - post-call analysis status beyond handoff summaries

3. CRM and worker operations visibility:
   - FUB ownership conflict surfacing
   - richer stuck-job recovery controls beyond retry/dismiss

4. Harwick AI persistence and tool execution:
   - persist full `HarwickAiTurn` records beyond the current queue/reply state
   - wire policy-backed auto-send into the production worker path
   - store workspace/member/conversation automation policies in Supabase
   - add calendar provider handlers for showing availability and approval workflows

5. Final production hardening:
   - rate limits on public-ish routes
   - idempotency coverage pass
   - staging/prod configuration checks
   - provider error logging coverage pass
   - RLS and auth coverage pass for the newer UI/backend surfaces

## Current Priority

Keep tightening the real operating loop:

1. Persist automation policies and full Harwick AI turns.
2. Connect policy-approved auto-send to the production social send path.
3. Wire calendar connection and showing approval tools.
4. Continue removing placeholder UI by binding every surface to real workspace data.
5. Harden auth/RLS before customer-zero live traffic.
